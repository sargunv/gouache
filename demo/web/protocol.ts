// The messages between the page (main.ts), the map's Web Worker
// (map-worker.ts) and the tile workers' Web Workers (tile-worker.ts).
//
// Each tile workers' Web Worker has a control port to the map's: the map's
// runtime connects each of its render sessions to it there, with a port of
// its own (TileWorkerConnect), and the Web Worker reports a panic there
// (TileWorkerFatal).

/** What the map draws with, each a build of the module. */
export type Backend = "webgpu" | "webgl2";

/** The module's bindings (pkg/gouache_demo.js). */
type Module = typeof import("./pkg/gouache_demo.js");
/** `names` of the bindings of either build of the module, and its start. */
export type Bindings<Names extends keyof Module> = Pick<Module, Names> & {
  default: (options: {
    module_or_path: WebAssembly.Module;
  }) => Promise<unknown>;
};

/** A camera: degrees, but for the zoom. */
export type Camera = [
  lat: number,
  lon: number,
  zoom: number,
  bearing: number,
  pitch: number,
];

/**
 * A call of one of WebMap's input methods, by the event's time as
 * performance.timeOrigin + timeStamp, which the map's Web Worker turns into
 * its own performance.now(). Positions are CSS pixels from the canvas's
 * top-left corner; modifiers are bits: Shift 1, Ctrl 2, Alt 4, Meta 8.
 */
export type Input =
  | {
      kind: "pointer_down";
      id: number;
      pointerType: string;
      button: number;
      x: number;
      y: number;
      modifiers: number;
      time: number;
    }
  | { kind: "pointer_move"; id: number; x: number; y: number; time: number }
  | { kind: "pointer_up"; id: number; x: number; y: number; time: number }
  | { kind: "pointer_cancel"; id: number; time: number }
  // `wheel` is WebMap::wheel's kind: WHEEL_NOTCHES or WHEEL_PIXELS.
  | {
      kind: "wheel";
      x: number;
      y: number;
      wheel: number;
      amount: number;
      modifiers: number;
      time: number;
    }
  | { kind: "key"; key: string; modifiers: number; time: number }
  // A modifier key went down or up: the modifiers held now.
  | { kind: "modifiers"; modifiers: number; time: number }
  | { kind: "blur"; time: number };

/** WebMap::wheel's `kind`: continuous scrolling, in pixels. */
export const WHEEL_PIXELS = 0;
/** WebMap::wheel's `kind`: a mouse wheel's detents, which the map eases. */
export const WHEEL_NOTCHES = 1;

/** What starts the map, once the module compiled. */
export interface Start {
  type: "start";
  module: WebAssembly.Module;
  canvas: OffscreenCanvas;
  /** One per tile workers' Web Worker: its control port. */
  tileWorkers: MessagePort[];
  /** CSS pixels. */
  width: number;
  height: number;
  ratio: number;
  /** An absolute URL. */
  style: string;
  camera: Camera;
}

/** From the page to the map's Web Worker. */
export type ToMap =
  | { type: "preload"; style: string; ratio: number; zoom: number }
  | Start
  | { type: "resize"; width: number; height: number }
  | { type: "pixelRatio"; ratio: number }
  | { type: "style"; url: string }
  | { type: "jumpTo"; camera: Camera }
  | { type: "resetNorth" }
  // The page's inputs of one task, such as the moves of a touch's fingers,
  // which the map applies before it draws again.
  | { type: "input"; inputs: Input[] };

/** A box-zoom drag's box, [x0, y0, x1, y1] in CSS pixels. */
export type Box = [number, number, number, number];

/** From the map's Web Worker to the page. */
export type FromMap =
  | { type: "status"; text: string }
  // Once the map is fully loaded, and again once each later style is.
  | { type: "loaded" }
  | { type: "box"; box: Box | null }
  // A gesture reached a notch: the page plays its haptic.
  | { type: "notch" }
  | { type: "camera"; camera: Camera }
  | { type: "attribution"; attribution: string[] }
  | { type: "styleName"; name: string }
  // The map stopped: a panic, or it failed to start.
  | { type: "fatal"; message: string }
  // The map didn't start: the browser's API couldn't draw it.
  | { type: "unsupported"; message: string };

/** From the page to a tile workers' Web Worker. */
export interface StartTileWorker {
  module: WebAssembly.Module;
  /** The control port, whose other end is the map's Web Worker. */
  control: MessagePort;
}

/**
 * From the map's runtime to a tile workers' Web Worker, over its control
 * port, for each render session: a port to serve the session's tile workers
 * on.
 */
export interface TileWorkerConnect {
  module: WebAssembly.Module;
  port: MessagePort;
}

/**
 * From a tile workers' Web Worker, over its control port and in place of
 * replies over its sessions' ports: its instance panicked.
 */
export interface TileWorkerFatal {
  fatal: string;
}

declare global {
  /** The message of the panic that aborted this instance (src/lib.rs). */
  var mlnPanic: string | undefined;
}
