// The map on mln-rs. The page runs no wasm itself. It compiles the module,
// gives its canvas to the map's Web Worker (map-worker.ts) as an
// OffscreenCanvas, and starts the tile workers' Web Workers (worker.ts)
// while the module compiles, each with a control port to the map's, where
// the map's runtime connects them with MessageChannels of their own, so that
// their requests and replies never pass through this thread. Each Web Worker
// instantiates the same module with its own memory, so nothing needs
// SharedArrayBuffer or COOP/COEP headers.
//
// The map draws with WebGPU. A browser without it gets the module's other
// build, which draws with WebGL2 (pkg/webgl, worker-webgl.ts). So does one
// whose WebGPU can't start the map: the page then loads again with WebGL2,
// and the tab remembers that.
//
// Input: the canvas's pointer, wheel, key and focus events go to the map's
// Web Worker, whose gesture recognizer (mln_gestures) moves the camera: drag
// to pan, right- or Ctrl-drag to rotate and tilt, Shift-drag to zoom to a
// box, the wheel or a trackpad to zoom, double-click or double-tap to zoom
// in (Shift: out), two fingers to pinch, twist and tilt, and the arrow,
// +/= and - keys. The map follows its box's size (ResizeObserver). The zoom
// buttons send the + and - keys. A panic in any of the Web Workers' wasm
// instances stops the map.

import type { MapEngine, StartOptions } from "./engine.ts";
import wasmUrl from "./pkg/gouache_demo_bg.wasm?url";
import webglWasmUrl from "./pkg/webgl/gouache_demo_bg.wasm?url";
import {
  type Backend,
  type Box,
  type FromMap,
  type Input,
  type StartTileWorker,
  type ToMap,
} from "./protocol.ts";
import { wheelDelta } from "./wheel.ts";

// What a tab whose WebGPU couldn't start the map draws with from then on.
const BACKEND_KEY = "gouache-backend";
function rememberedBackend(): string | null {
  try {
    return sessionStorage.getItem(BACKEND_KEY);
  } catch {
    return null; // no storage for this page
  }
}

/** Starts the map in `container`. */
export function startMlnRs({
  container,
  style,
  camera,
  on,
}: StartOptions): MapEngine {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "Map");
  container.append(canvas);

  let ratio = window.devicePixelRatio || 1;
  // The map's size in CSS pixels, its box's; the worker resizes the map and
  // its surface. Its first report is the size the map started at.
  let size: [number, number] = [container.clientWidth, container.clientHeight];
  // The map draws its size times the pixel ratio, rounded down, in device
  // pixels. The canvas's box covers exactly those: at a fractional pixel
  // ratio, a box of whole CSS pixels covers a fractional number of device
  // pixels, and a browser that resamples the canvas into it blurs the map.
  const devicePixels = (length: number) => Math.floor(length * ratio);
  function fitCanvas() {
    canvas.style.width = `${devicePixels(size[0]) / ratio}px`;
    canvas.style.height = `${devicePixels(size[1]) / ratio}px`;
  }
  canvas.width = devicePixels(size[0]);
  canvas.height = devicePixels(size[1]);
  fitCanvas();

  const backend: Backend =
    (rememberedBackend() ?? ("gpu" in navigator ? "webgpu" : "webgl2")) ===
    "webgl2"
      ? "webgl2"
      : "webgpu";

  const compiling = WebAssembly.compileStreaming(
    fetch(backend === "webgl2" ? webglWasmUrl : wasmUrl),
  );

  // The Web Workers load their scripts while the module downloads and
  // compiles, and get it once it has.
  const count = Math.max(
    1,
    Math.min(4, (navigator.hardwareConcurrency || 2) - 1),
  );
  const tileWorkers = Array.from({ length: count }, () =>
    backend === "webgl2"
      ? new Worker(new URL("./worker-webgl.ts", import.meta.url), {
          type: "module",
        })
      : new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
  );
  const map =
    backend === "webgl2"
      ? new Worker(new URL("./map-worker.ts", import.meta.url), {
          type: "module",
          name: "webgl2",
        })
      : new Worker(new URL("./map-worker.ts", import.meta.url), {
          type: "module",
        });
  // The map's Web Worker may draw between any two of its messages. A touch's
  // fingers move with an event each: sent one by one, a pinch would draw with
  // one finger moved and not yet the other, zoomed far in or out for a frame,
  // and the map would load that zoom's tiles. So the page's inputs (`send`)
  // go together at the end of the task they came in, and before any other
  // message, which keeps their order.
  let inputs: Input[] = [];
  function sendInputs() {
    if (inputs.length === 0) return;
    map.postMessage({ type: "input", inputs } satisfies ToMap);
    inputs = [];
  }
  const endOfTask = new MessageChannel();
  endOfTask.port1.onmessage = sendInputs;
  const toMap = (message: ToMap, transfer: Transferable[] = []) => {
    sendInputs();
    map.postMessage(message, transfer);
  };
  // The map's Web Worker fetches the style and what it needs first meanwhile.
  toMap({ type: "preload", style, ratio, zoom: camera[2] });

  // The rest of the page starts meanwhile: its controls work at once, and
  // what they ask of the map waits in the map's Web Worker until it starts.
  compiling.then(
    (module) => {
      const controls = tileWorkers.map((worker) => {
        const channel = new MessageChannel();
        const start: StartTileWorker = { module, control: channel.port2 };
        worker.postMessage(start, [channel.port2]);
        return channel.port1;
      });

      const offscreen = canvas.transferControlToOffscreen();
      toMap(
        {
          type: "start",
          module,
          canvas: offscreen,
          tileWorkers: controls,
          width: size[0],
          height: size[1],
          ratio,
          style,
          camera,
        },
        [offscreen, ...controls],
      );
    },
    (error: unknown) =>
      on.stop(
        `the module didn't compile: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );

  // The browser's API couldn't start the map. After WebGPU the page loads
  // again to draw with WebGL2, in this tab from now on; after WebGL2 there is
  // nothing left to draw with.
  function unsupported(message: string) {
    if (backend === "webgl2") {
      on.stop(
        `this browser has neither WebGPU nor WebGL2 for the map to draw with (${message})`,
      );
      return;
    }
    try {
      sessionStorage.setItem(BACKEND_KEY, "webgl2");
    } catch {
      on.stop(`WebGPU can't draw the map (${message})`);
      return;
    }
    location.reload();
  }

  map.onmessage = ({ data }: MessageEvent<FromMap>) => {
    switch (data.type) {
      case "box":
        showBox(data.box);
        break;
      case "notch":
        // Phones that vibrate tick; elsewhere `vibrate` is missing or does
        // nothing.
        navigator.vibrate?.(10);
        break;
      case "status":
        on.status(data.text);
        break;
      case "loaded":
        on.loaded();
        break;
      case "fatal":
        on.stop(data.message);
        break;
      case "unsupported":
        unsupported(data.message);
        break;
      case "camera":
        on.camera(data.camera);
        break;
      case "attribution":
        on.attribution(data.attribution);
        break;
      case "styleName":
        on.styleName(data.name);
        break;
    }
  };

  const send = (input: Input) => {
    if (inputs.push(input) === 1) endOfTask.port2.postMessage(null);
  };
  // Each event's time, as performance.timeOrigin + timeStamp: the map's Web
  // Worker turns it into its own performance.now(), the clock its frames run
  // on.
  const time = (e: Event) => performance.timeOrigin + e.timeStamp;
  const modifiers = (e: MouseEvent | KeyboardEvent) =>
    (e.shiftKey ? 1 : 0) |
    (e.ctrlKey ? 2 : 0) |
    (e.altKey ? 4 : 0) |
    (e.metaKey ? 8 : 0);
  // The keys the map uses; Escape only ends a box zoom, so its default stays.
  const KEYS = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "+",
    "=",
    "-",
    "_",
  ]);
  // Where the canvas is: read on each press and resize rather than on every
  // move, which would lay the page out again.
  let origin = canvas.getBoundingClientRect();
  const at = (e: MouseEvent) => ({
    x: e.clientX - origin.left,
    y: e.clientY - origin.top,
  });

  canvas.tabIndex = 0;
  canvas.style.touchAction = "none";
  canvas.style.outline = "none";
  canvas.addEventListener("pointerdown", (e) => {
    canvas.focus({ preventScroll: true });
    origin = canvas.getBoundingClientRect();
    send({
      kind: "pointer_down",
      id: e.pointerId,
      pointerType: e.pointerType,
      button: e.button,
      ...at(e),
      modifiers: modifiers(e),
      time: time(e),
    });
    // The map drags with the primary and secondary buttons.
    if (e.button === 0 || e.button === 2) canvas.setPointerCapture(e.pointerId);
  });
  // In a worker, the map draws as soon as a move arrives: pointerrawupdate
  // comes when the browser has the move, pointermove only with the page's
  // next frame. A touch moves with pointermove, which comes for all its
  // fingers in one task, as one input message (`send`): Chromium dispatches
  // each finger's pointerrawupdate in a task of its own, and the map would
  // draw a pinch with one finger moved and not the other.
  const raw = "onpointerrawupdate" in HTMLElement.prototype;
  const move = (e: PointerEvent) =>
    send({ kind: "pointer_move", id: e.pointerId, ...at(e), time: time(e) });
  if (raw) {
    canvas.addEventListener("pointerrawupdate", (e) => {
      if (e instanceof PointerEvent && e.pointerType !== "touch") move(e);
    });
  }
  canvas.addEventListener("pointermove", (e) => {
    if (!raw || e.pointerType === "touch") move(e);
  });
  canvas.addEventListener("pointerup", (e) =>
    send({ kind: "pointer_up", id: e.pointerId, ...at(e), time: time(e) }),
  );
  canvas.addEventListener("pointercancel", (e) =>
    send({ kind: "pointer_cancel", id: e.pointerId, time: time(e) }),
  );
  // wheelDelta (wheel.ts) reads the event's deltas first, `deltaMode` before
  // `deltaY`, so that Firefox keeps a mouse wheel's lines.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = wheelDelta(e);
      if (delta.amount !== 0)
        send({
          kind: "wheel",
          ...at(e),
          ...delta,
          modifiers: modifiers(e),
          time: time(e),
        });
    },
    { passive: false },
  );
  // Shift and Ctrl change what a drag does (Shift draws a box, Ctrl rotates),
  // so the map learns of them as they go down and up.
  const MODIFIER_KEYS = new Set(["Shift", "Control"]);
  const keyEvent = (e: KeyboardEvent) => {
    if (MODIFIER_KEYS.has(e.key))
      send({ kind: "modifiers", modifiers: modifiers(e), time: time(e) });
  };
  canvas.addEventListener("keydown", (e) => {
    keyEvent(e);
    if (KEYS.has(e.key)) e.preventDefault();
    if (KEYS.has(e.key) || e.key === "Escape")
      send({ kind: "key", key: e.key, modifiers: modifiers(e), time: time(e) });
  });
  canvas.addEventListener("keyup", keyEvent);
  canvas.addEventListener("blur", (e) => send({ kind: "blur", time: time(e) }));
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // A box-zoom drag's box, which the worker reports while it is drawn.
  const box = document.createElement("div");
  box.id = "box";
  box.hidden = true;
  document.body.append(box);
  function showBox(corners: Box | null) {
    box.hidden = !corners;
    if (!corners) return;
    const [x0, y0, x1, y1] = corners;
    Object.assign(box.style, {
      left: `${origin.left + window.scrollX + Math.min(x0, x1)}px`,
      top: `${origin.top + window.scrollY + Math.min(y0, y1)}px`,
      width: `${Math.abs(x1 - x0)}px`,
      height: `${Math.abs(y1 - y0)}px`,
    });
  }

  new ResizeObserver(() => {
    origin = canvas.getBoundingClientRect();
    const next: [number, number] = [
      container.clientWidth,
      container.clientHeight,
    ];
    if (next[0] === size[0] && next[1] === size[1]) return;
    size = next;
    fitCanvas();
    toMap({ type: "resize", width: size[0], height: size[1] });
  }).observe(container);

  // A window that moves to a display of another density draws at its pixel
  // ratio.
  const watchRatio = (current: number) => {
    matchMedia(`(resolution: ${current}dppx)`).addEventListener(
      "change",
      () => {
        ratio = window.devicePixelRatio || 1;
        fitCanvas();
        toMap({ type: "pixelRatio", ratio });
        watchRatio(ratio);
      },
      { once: true },
    );
  };
  watchRatio(ratio);

  // The zoom buttons press the map's keys.
  const key = (key: string) =>
    send({
      kind: "key",
      key,
      modifiers: 0,
      time: performance.timeOrigin + performance.now(),
    });
  return {
    setStyle: (url) => toMap({ type: "style", url }),
    zoomIn: () => key("+"),
    zoomOut: () => key("-"),
    resetNorth: () => toMap({ type: "resetNorth" }),
    jumpTo: (camera) => toMap({ type: "jumpTo", camera }),
  };
}
