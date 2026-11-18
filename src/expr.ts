// Expression helpers. Every helper returns plain style JSON; build.ts
// validates the whole style against the style spec.

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

/** Zoom stops: zoom level to value. */
export type Stops<T extends Json = number> = Record<number, T>;

/** Linear interpolation over zoom. */
export function zoomLinear<T extends Json>(stops: Stops<T>): Json {
  return ["interpolate", ["linear"], ["zoom"], ...flatten(stops)];
}

/** Exponential interpolation over zoom, for sizes that scale with the map. */
export function zoomExp<T extends Json>(base: number, stops: Stops<T>): Json {
  return ["interpolate", ["exponential", base], ["zoom"], ...flatten(stops)];
}

/** 0 until `from`, then up to `to` over `[from, until]`. */
export function fadeIn(from: number, until: number, to: number = 1): Json {
  return zoomLinear({ [from]: 0, [until]: to });
}

/** Fades in over `[a, b]` and out over `[c, d]`. */
export function fadeInOut(
  a: number,
  b: number,
  c: number,
  d: number,
  peak: number = 1,
): Json {
  return zoomLinear({ [a]: 0, [b]: peak, [c]: peak, [d]: 0 });
}

/** Fades out over `[from, until]`. */
export function fadeOut(from: number, until: number, start: number = 1): Json {
  return zoomLinear({ [from]: start, [until]: 0 });
}

function flatten<T extends Json>(stops: Stops<T>): Json[] {
  return Object.entries(stops)
    .map(([zoom, value]): [number, T] => [Number(zoom), value])
    .sort(([a], [b]) => a - b)
    .flatMap(([zoom, value]) => [zoom, value]);
}

/** `["get", key]` is one of `values`. */
export function isIn(key: string, ...values: string[]): Json {
  return ["in", ["get", key], ["literal", values]];
}

/** Lines only: OpenMapTiles' transportation layer also has polygons. */
export const LINES: Json = [
  "match",
  ["geometry-type"],
  ["LineString", "MultiLineString"],
  true,
  false,
];

/** The feature's local name. */
export const NAME: Json = ["coalesce", ["get", "name"], ["get", "name:latin"]];

/**
 * The feature's English name, else its local name: for countries and seas,
 * whose local names list every official language.
 */
export const NAME_EN: Json = ["coalesce", ["get", "name:en"], NAME];
