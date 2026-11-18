import type { Json } from "./expr.ts";

// Checks that nothing pops: a layer that starts at a minzoom must be
// invisible there (an opacity, width or height that is 0 at that zoom), and a
// layer that ends at a maxzoom must have faded out by then.
//
// Symbol layers are the exception at the start: the renderer fades symbols in
// as they're placed. Their opacity must not hide them anywhere but in a
// fade-out before a maxzoom, because a hidden symbol still takes collision
// space from visible ones.

const APPEARANCE = [
  "fill-opacity",
  "line-opacity",
  "line-width",
  "fill-extrusion-opacity",
  "fill-extrusion-height",
  "circle-opacity",
  "circle-radius",
  "text-opacity",
  "icon-opacity",
  "raster-opacity",
  "color-relief-opacity",
];

/** The largest value `expression` can take at `zoom`, or null if unknown. */
function maxAt(expression: Json, zoom: number): number | null {
  if (typeof expression === "number") return expression;
  if (!Array.isArray(expression)) return null;
  const [op, ...rest] = expression;
  if (op === "interpolate" || op === "step") {
    const input = op === "interpolate" ? rest[1] : rest[0];
    const stops = op === "interpolate" ? rest.slice(2) : rest.slice(2);
    if (!(Array.isArray(input) && input[0] === "zoom"))
      return maxOfOutputs(expression);
    const pairs: [number, Json][] = [];
    for (let i = 0; i + 1 < stops.length; i += 2) {
      const z = stops[i];
      const v = stops[i + 1];
      if (typeof z === "number" && v !== undefined) pairs.push([z, v]);
    }
    if (op === "step") {
      let value: Json | undefined = rest[1];
      for (const [z, v] of pairs) if (zoom >= z) value = v;
      return value === undefined ? null : maxAt(value, zoom);
    }
    const first = pairs[0];
    const last = pairs.at(-1);
    if (!first || !last) return null;
    if (zoom <= first[0]) return maxAt(first[1], zoom);
    if (zoom >= last[0]) return maxAt(last[1], zoom);
    for (let i = 1; i < pairs.length; i++) {
      const lo = pairs[i - 1];
      const hi = pairs[i];
      if (!lo || !hi || zoom > hi[0]) continue;
      const a = maxAt(lo[1], zoom);
      const b = maxAt(hi[1], zoom);
      if (a === null || b === null) return null;
      // An upper bound: each feature's value lies between its own stops.
      const t = (zoom - lo[0]) / (hi[0] - lo[0]);
      return a * (1 - t) + b * t;
    }
    return null;
  }
  return maxOfOutputs(expression);
}

/** The largest number among a match or case's outputs. */
function maxOfOutputs(expression: Json): number | null {
  if (!Array.isArray(expression)) return null;
  const [op, ...rest] = expression;
  if (op === "match") {
    const outputs = [
      ...rest.slice(1, -1).filter((_, i) => i % 2 === 1),
      rest.at(-1),
    ];
    const values = outputs.map((o) => (o === undefined ? null : maxAt(o, 0)));
    return values.some((v) => v === null)
      ? null
      : Math.max(...values.map((v) => v ?? 0));
  }
  if (op === "case") {
    const outputs = [
      ...rest.slice(0, -1).filter((_, i) => i % 2 === 1),
      rest.at(-1),
    ];
    const values = outputs.map((o) => (o === undefined ? null : maxAt(o, 0)));
    return values.some((v) => v === null)
      ? null
      : Math.max(...values.map((v) => v ?? 0));
  }
  return null;
}

/** Whether `expression` evaluates to 0 at `zoom` for every feature. */
function zeroAt(expression: Json, zoom: number): boolean {
  if (!Array.isArray(expression)) return expression === 0;
  if (expression[0] === "case") {
    const outputs = [
      ...expression.slice(1, -1).filter((_, i) => i % 2 === 1),
      expression.at(-1),
    ];
    return outputs.every((o) => o !== undefined && zeroAt(o, zoom));
  }
  return maxAt(expression, zoom) === 0;
}

const SYMBOL_OPACITY = ["text-opacity", "icon-opacity"];

/**
 * Whether `expression` can be 0 for some feature at some zoom, other than at
 * the last stop of a zoom curve when `fadesOut`.
 */
function canHide(expression: Json, fadesOut: boolean): boolean {
  if (typeof expression === "number") return expression === 0;
  if (!Array.isArray(expression)) return false;
  const [op, ...rest] = expression;
  if (op === "interpolate" || op === "step") {
    const input = op === "interpolate" ? rest[1] : rest[0];
    const onZoom = Array.isArray(input) && input[0] === "zoom";
    const outputs = (
      op === "step" ? [rest[1], ...rest.slice(3)] : rest.slice(2)
    ).filter((_, i) => (op === "step" ? i === 0 || i % 2 === 0 : i % 2 === 1));
    const checked = onZoom && fadesOut ? outputs.slice(0, -1) : outputs;
    return checked.some((o) => o !== undefined && canHide(o, false));
  }
  if (op === "match") {
    const outputs = [
      ...rest.slice(1, -1).filter((_, i) => i % 2 === 1),
      rest.at(-1),
    ];
    return outputs.some((o) => o !== undefined && canHide(o, fadesOut));
  }
  if (op === "case") {
    const outputs = [
      ...rest.slice(0, -1).filter((_, i) => i % 2 === 1),
      rest.at(-1),
    ];
    return outputs.some((o) => o !== undefined && canHide(o, fadesOut));
  }
  return false;
}

export function lint(layers: Json[]): string[] {
  const problems: string[] = [];
  for (const layer of layers) {
    if (typeof layer !== "object" || layer === null || Array.isArray(layer))
      continue;
    const { id, type, minzoom, maxzoom, paint } = layer;
    if (typeof paint !== "object" || paint === null || Array.isArray(paint))
      continue;
    const appearance = APPEARANCE.filter((key) => key in paint).map(
      (key) => paint[key] ?? null,
    );
    if (typeof minzoom === "number" && minzoom > 0 && type !== "symbol") {
      if (!appearance.some((value) => zeroAt(value, minzoom))) {
        problems.push(
          `${JSON.stringify(id)}: visible at its minzoom ${minzoom}; fade it in`,
        );
      }
    }
    if (type === "symbol") {
      const fadesOut = typeof maxzoom === "number" && maxzoom < 24;
      for (const key of SYMBOL_OPACITY) {
        const value = paint[key];
        if (value !== undefined && canHide(value, fadesOut)) {
          problems.push(
            `${JSON.stringify(id)}: ${key} hides symbols; placement already fades them in, and hidden symbols still collide. Use a filter or minzoom${fadesOut ? "" : " (only a fade-out before a maxzoom may reach 0)"}`,
          );
        }
      }
    }
    if (typeof maxzoom === "number" && maxzoom < 24) {
      if (!appearance.some((value) => zeroAt(value, maxzoom))) {
        problems.push(
          `${JSON.stringify(id)}: visible at its maxzoom ${maxzoom}; fade it out`,
        );
      }
    }
  }
  return problems;
}
