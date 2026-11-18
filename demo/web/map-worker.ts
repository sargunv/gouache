// The map's Web Worker: its own instance of the page's module, whose
// runtime renders the map into the page's canvas (an OffscreenCanvas), so
// that the map's work never runs on the page's thread. The page starts the
// tile workers' Web Workers (worker.ts) and gives this worker a control port
// to each, where the runtime connects its render session to them
// (`mlnWebConfigureTileWorkers`): requests go as bytes, and replies come back
// as bytes and payloads, transferred, straight to this worker's instance.
//
// The page sends a preload as soon as it starts, the start once the module
// compiled, then the rest of ToMap (protocol.ts); this worker answers with
// FromMap.
//
// A panic aborts the instance it happens in (wasm32-unknown-unknown can't
// unwind), and nothing may call into it after that. When this instance or a
// tile worker's panics, the map stops: no more frames or work between them,
// and a fatal message goes to the page, with the message the panic hook left
// in `mlnPanic` (src/lib.rs) or a tile worker sent.
//
// The page names this worker `webgl2` where the map draws with WebGL2: it
// then runs that build of the module (pkg/webgl). When the browser's API
// can't start the map, the worker says `unsupported` rather than `fatal`.

import type { WebMap } from "./pkg/gouache_demo.js";
import type {
  Bindings,
  Box,
  Camera,
  FromMap,
  Input,
  Start,
  TileWorkerFatal,
  ToMap,
} from "./protocol.ts";

const webgl2 = self.name === "webgl2";

// Imported rather than a static import, so that the preloads below don't
// wait for it.
const bindings: Promise<
  Bindings<
    "WebMap" | "set_preloads" | "mlnWebStopPump" | "mlnWebConfigureTileWorkers"
  >
> = webgl2
  ? import("./pkg/webgl/gouache_demo.js")
  : import("./pkg/gouache_demo.js");

type Handle = (message: ToMap) => void;

let start: Promise<Handle | undefined> | null = null;
const early: ToMap[] = []; // messages before the map exists
onmessage = ({ data }: MessageEvent<ToMap>) => {
  if (data.type === "preload") preloadStyle(data.style, data.ratio, data.zoom);
  else if (data.type === "start")
    start = run(data).catch((error: unknown) => fatal("map", error));
  else if (start) void start.then((handle) => handle?.(data));
  else early.push(data);
};

const post = (message: FromMap) => postMessage(message);

let stopped = false;
// Stops the instance's work between frames, once it has started.
let stopPump = () => {};

function fatal(where: string, error: unknown): undefined {
  if (stopped) return;
  stopped = true;
  try {
    stopPump();
  } catch {
    // The instance panicked: nothing runs in it any more.
  }
  post({
    type: "fatal",
    message: `${where}: ${self.mlnPanic ?? String(error)}`,
  });
}

// Calls into the instance, unless the map has stopped.
function guard(f: () => void) {
  if (stopped) return;
  try {
    f();
  } catch (error) {
    fatal("map", error);
  }
}

// What throws outside `guard`: a fetch's or an image decode's completion.
addEventListener("error", (event) =>
  fatal("map", event.error ?? event.message),
);
addEventListener("unhandledrejection", (event) => fatal("map", event.reason));

// What the map fetches first, fetched while the module downloads and
// compiles: the style, then its sources' TileJSON, its sprite and its
// labels' first glyphs, at the URLs the map asks for them by. The map's
// fetches take these responses (`RuntimeOptions::fetch_preloads`), each once,
// when they ask for the same URL; one never asked for is dropped after a
// minute. Only absolute http(s) URLs: the map's file source maps
// the others first.
const preloads = new Map<
  string,
  { response: Promise<Response>; expiry: ReturnType<typeof setTimeout> }
>();

function takePreload(url: string): Promise<Response> | undefined {
  const preloaded = preloads.get(url);
  if (preloaded === undefined) return undefined;
  preloads.delete(url);
  clearTimeout(preloaded.expiry);
  return preloaded.response;
}

function preload(url: unknown): Promise<Response> | undefined {
  if (typeof url !== "string" || !/^https?:\/\//.test(url) || preloads.has(url))
    return undefined;
  const response = fetch(url);
  // Unclaimed, a failure is quiet; claimed, the map fetches again.
  response.catch(() => {});
  const expiry = setTimeout(() => preloads.delete(url), 60_000);
  preloads.set(url, { response, expiry });
  return response;
}

function preloadStyle(url: string, ratio: number, zoom: number) {
  // A clone to read: the map takes the original.
  preload(url)
    ?.then((response): Promise<unknown> | undefined =>
      response.ok ? response.clone().json() : undefined,
    )
    .then((style) => {
      if (isRecord(style)) preloadParts(style, ratio, zoom);
    })
    .catch(() => {});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preloadParts(
  style: Record<string, unknown>,
  ratio: number,
  zoom: number,
) {
  for (const source of Object.values(
    isRecord(style.sources) ? style.sources : {},
  )) {
    if (isRecord(source)) void preload(source.url);
  }
  const sprites =
    typeof style.sprite === "string"
      ? [style.sprite]
      : Array.isArray(style.sprite)
        ? style.sprite.map((sprite: unknown) =>
            isRecord(sprite) ? sprite.url : undefined,
          )
        : [];
  for (const sprite of sprites) {
    // mln_storage's `Resource::sprite_json` and `sprite_image`.
    if (typeof sprite !== "string" || sprite.includes("#")) continue;
    const query = sprite.includes("?") ? sprite.indexOf("?") : sprite.length;
    const scale = ratio > 1 ? "@2x" : "";
    for (const extension of [".json", ".png"]) {
      void preload(
        `${sprite.slice(0, query)}${scale}${extension}${sprite.slice(query)}`,
      );
    }
  }
  const glyphs = style.glyphs;
  if (typeof glyphs === "string") {
    for (const stack of firstFontStacks(style, zoom)) {
      // mln_storage's `Resource::glyphs`, for the first range.
      void preload(
        glyphs
          .replaceAll("{fontstack}", percentEncode(stack))
          .replaceAll("{range}", "0-255"),
      );
    }
  }
}

// The style spec's default `text-font`.
const DEFAULT_FONT = ["Open Sans Regular", "Arial Unicode MS Regular"];
// Expressions whose arguments are all strings, unlike a font stack's.
const STRING_EXPRESSIONS = new Set([
  "get",
  "has",
  "var",
  "feature-state",
  "global-state",
  "properties",
]);

// The font stacks, joined, of the symbol layers with text shown at `zoom`
// whose `text-font` is a constant: the glyphs their tiles' labels ask for
// first.
function firstFontStacks(
  style: Record<string, unknown>,
  zoom: number,
): Set<string> {
  const stacks = new Set<string>();
  for (const layer of Array.isArray(style.layers) ? style.layers : []) {
    if (!isRecord(layer)) continue;
    const layout = isRecord(layer.layout) ? layer.layout : {};
    const shown =
      layer.type === "symbol" &&
      layout.visibility !== "none" &&
      (typeof layer.minzoom !== "number" || zoom >= layer.minzoom) &&
      (typeof layer.maxzoom !== "number" || zoom < layer.maxzoom);
    if (
      !shown ||
      layout["text-field"] === undefined ||
      layout["text-field"] === ""
    )
      continue;
    const font = layout["text-font"];
    const fonts: unknown =
      font === undefined
        ? DEFAULT_FONT
        : Array.isArray(font) && font[0] === "literal"
          ? font[1]
          : font;
    if (!Array.isArray(fonts) || fonts.length === 0) continue;
    const names = fonts.filter((name: unknown) => typeof name === "string");
    if (
      names.length === fonts.length &&
      !STRING_EXPRESSIONS.has(names[0] ?? "")
    )
      stacks.add(names.join(","));
  }
  return stacks;
}

// Match Resource::glyphs: percent-encode every non-unreserved UTF-8 byte with
// lowercase hex.
function percentEncode(text: string): string {
  let encoded = "";
  for (const byte of new TextEncoder().encode(text)) {
    const char = String.fromCharCode(byte);
    encoded += /[A-Za-z0-9\-_.~]/.test(char)
      ? char
      : `%${byte.toString(16).padStart(2, "0")}`;
  }
  return encoded;
}

async function run({
  module,
  canvas,
  tileWorkers,
  width,
  height,
  ratio,
  style,
  camera,
}: Start): Promise<Handle> {
  const {
    default: init,
    WebMap,
    set_preloads,
    mlnWebStopPump,
    mlnWebConfigureTileWorkers,
  } = await bindings;
  await init({ module_or_path: module });
  stopPump = mlnWebStopPump;
  set_preloads(takePreload);

  // The runtime connects its session to the tile workers' Web Workers over
  // their control ports, which report their panics.
  tileWorkers.forEach((control, i) => {
    control.onmessage = ({ data }: MessageEvent<TileWorkerFatal>) =>
      fatal(`tile worker ${i}`, data.fatal);
  });
  let spawned = 0;
  mlnWebConfigureTileWorkers(tileWorkers.length, () => tileWorkers[spawned++]);

  // The map's work (finished fetches, worker replies, queued tasks, its
  // frames) runs as soon as the map asks for it, in a task of its own
  // (mln_web_host's pump), rather than waiting for the next animation frame:
  // each step of a load (a tile's response, its parsing, the next request)
  // would otherwise wait a frame.
  let rendering: WebMap | undefined;
  const onFrame = () => guard(() => rendering?.drain_frames());
  let map: WebMap;
  try {
    map = await WebMap.create(canvas, width, height, ratio, onFrame);
  } catch (error) {
    if (self.mlnPanic !== undefined) throw error;
    if (!(error instanceof Error && error.name === "NotSupportedError"))
      throw error;
    stopped = true;
    post({ type: "unsupported", message: error.message });
    return () => {};
  }
  rendering = map;

  map.set_style_url(style);
  map.jump_to(...camera);

  let started = performance.now();
  let loadedMs: number | null = null;
  let reported = 0;
  let attribution = "";
  let styleName = "";
  const report = (force: boolean) => {
    const now = performance.now();
    if (!force && now - reported < 250) return;
    reported = now;
    post({
      type: "status",
      text:
        `${webgl2 ? "WebGL2" : "WebGPU"}, ${tileWorkers.length} tile workers` +
        (loadedMs === null ? "" : `, loaded in ${Math.round(loadedMs)} ms`),
    });
    // A source's attribution can come later than its style, with its
    // TileJSON. They come from the last read, a report ago.
    map.read_style_info();
    const next = map.attributions();
    if (next.join("\n") !== attribution) {
      attribution = next.join("\n");
      post({ type: "attribution", attribution: next });
    }
    const name = map.style_name();
    if (name !== styleName) {
      styleName = name;
      post({ type: "styleName", name });
    }
  };
  function frame() {
    guard(drawFrame);
    if (!stopped) requestAnimationFrame(frame);
  }
  let shownCamera = "";
  function drawFrame() {
    map.frame(performance.now());
    if (map.take_notch()) post({ type: "notch" });
    const [lat = 0, lon = 0, zoom = 0, bearing = 0, pitch = 0] = map.camera();
    const camera: Camera = [lat, lon, zoom, bearing, pitch];
    const next = camera.join();
    if (next !== shownCamera) {
      shownCamera = next;
      post({ type: "camera", camera });
    }
    if (loadedMs === null && map.is_fully_loaded()) {
      loadedMs = performance.now() - started;
      post({ type: "loaded" });
      report(true);
    }
    report(false);
  }
  requestAnimationFrame(frame);

  let box: Box | null = null;
  const handle = (data: ToMap) =>
    guard(() => {
      switch (data.type) {
        case "resize":
          map.resize(data.width, data.height);
          break;
        case "pixelRatio":
          map.set_pixel_ratio(data.ratio);
          break;
        case "style":
          map.set_style_url(data.url);
          started = performance.now();
          loadedMs = null;
          // The page clears both for the new style, so they go again even
          // when the new style's are the same.
          attribution = "";
          styleName = "";
          report(true);
          break;
        case "jumpTo":
          map.jump_to(...data.camera);
          break;
        case "resetNorth":
          map.reset_north();
          break;
        case "input": {
          for (const input of data.inputs) applyInput(map, input);
          const [x0, y0, x1, y1] = map.box_zoom() ?? [];
          const next: Box | null =
            x0 === undefined ||
            y0 === undefined ||
            x1 === undefined ||
            y1 === undefined
              ? null
              : [x0, y0, x1, y1];
          if (String(next) !== String(box)) {
            box = next;
            post({ type: "box", box });
          }
          if (map.take_notch()) post({ type: "notch" });
          break;
        }
        case "preload":
        case "start":
          break;
      }
    });
  for (const data of early.splice(0)) handle(data);
  return handle;
}

// The page's events, on this worker's clock: the one frames run on.
function applyInput(map: WebMap, input: Input) {
  const time = input.time - performance.timeOrigin;
  switch (input.kind) {
    case "pointer_down":
      map.pointer_down(
        input.id,
        input.pointerType,
        input.button,
        input.x,
        input.y,
        input.modifiers,
        time,
      );
      break;
    case "pointer_move":
      map.pointer_move(input.id, input.x, input.y, time);
      break;
    case "pointer_up":
      map.pointer_up(input.id, input.x, input.y, time);
      break;
    case "pointer_cancel":
      map.pointer_cancel(input.id, time);
      break;
    case "wheel":
      map.wheel(
        input.x,
        input.y,
        input.wheel,
        input.amount,
        input.modifiers,
        time,
      );
      break;
    case "key":
      map.key(input.key, input.modifiers, time);
      break;
    case "modifiers":
      map.modifiers(input.modifiers, time);
      break;
    case "blur":
      map.blur(time);
      break;
  }
}
