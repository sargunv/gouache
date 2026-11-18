// The map engines the page can draw with, one at a time, and what the page's
// controls need of each (MapEngine) and hear from it (EngineEvents).

import type { Camera } from "./protocol.ts";

/** An engine's key, as `?engine=` takes it. */
export type EngineKey = "mlnrs" | "gljs" | "orbis";

export interface Engine {
  key: EngineKey;
  /** Its name on the page's engine button. */
  name: string;
  /** What the about panel says draws the map. */
  about: string;
}

/** The engines, in the order the engine button cycles through them; the
 * first is the default. */
export const ENGINES: Engine[] = [
  {
    key: "mlnrs",
    name: "mln-rs",
    about:
      "This page draws it with mln-rs, in Web Workers through WebAssembly, with WebGPU, or WebGL2 where the browser has no WebGPU.",
  },
  {
    key: "gljs",
    name: "GL JS",
    about: "This page draws it with MapLibre GL JS, with WebGL2.",
  },
  {
    key: "orbis",
    name: "Orbis",
    about:
      "This page draws it with Orbis, through WebAssembly, with WebGPU, or WebGL2 where the browser has no WebGPU.",
  },
];

/** The engine for `?engine=`; the first of ENGINES without a known one. */
export function engineFor(param: string | null): Engine {
  const [first] = ENGINES;
  if (first === undefined) throw new Error("ENGINES is empty");
  return ENGINES.find((engine) => engine.key === param) ?? first;
}

/** The engine after `engine`, around to the first after the last. */
export function nextEngine(engine: Engine): Engine {
  const next = ENGINES[(ENGINES.indexOf(engine) + 1) % ENGINES.length];
  if (next === undefined) throw new Error("ENGINES is empty");
  return next;
}

/** What the page's controls ask of a map. */
export interface MapEngine {
  /** Shows the style at an absolute URL, keeping the camera. */
  setStyle(url: string): void;
  zoomIn(): void;
  zoomOut(): void;
  /** Eases the bearing and pitch back to zero. */
  resetNorth(): void;
  jumpTo(camera: Camera): void;
}

/** What a map tells the page. */
export interface EngineEvents {
  camera(camera: Camera): void;
  /** The style and the tiles in view are in: once at the start, and once
   * after each `setStyle`. */
  loaded(): void;
  /** The sources' attribution HTML; empty while a new style loads. */
  attribution(entries: string[]): void;
  /** The style's own name. */
  styleName(name: string): void;
  /** A line for the about panel: what the map draws with. */
  status(text: string): void;
  /** The map stopped for good, and why. */
  stop(message: string): void;
}

/** What starts an engine's map. */
export interface StartOptions {
  /** The element the map fills. */
  container: HTMLElement;
  /** An absolute URL. */
  style: string;
  camera: Camera;
  on: EngineEvents;
}

/** GL JS's camera options for the page's camera; Orbis takes the same. */
export const cameraOptions = ([lat, lon, zoom, bearing, pitch]: Camera) => ({
  center: [lon, lat] satisfies [number, number],
  zoom,
  bearing,
  pitch,
});

/**
 * The name and sources' attribution of the style at `url`, for an engine
 * that doesn't report them: each source's own `attribution`, or its
 * TileJSON's.
 */
export async function styleInfo(
  url: string,
): Promise<{ name: string; attribution: string[] }> {
  const json = async (url: string): Promise<unknown> =>
    (await fetch(url)).json();
  const style = await json(url);
  if (!isRecord(style)) return { name: "", attribution: [] };
  const sources = isRecord(style.sources) ? Object.values(style.sources) : [];
  const attribution = await Promise.all(
    sources.filter(isRecord).map(async (source) => {
      if (typeof source.attribution === "string") return source.attribution;
      if (typeof source.url !== "string") return "";
      const tileJson = await json(new URL(source.url, url).href).catch(
        () => null,
      );
      return isRecord(tileJson) && typeof tileJson.attribution === "string"
        ? tileJson.attribution
        : "";
    }),
  );
  return {
    name: typeof style.name === "string" ? style.name : "",
    attribution: attribution.filter((entry) => entry !== ""),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
