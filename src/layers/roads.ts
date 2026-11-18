import { mix } from "../color.ts";
import {
  fadeIn,
  isIn,
  type Json,
  LINES,
  type Stops,
  zoomExp,
  zoomLinear,
} from "../expr.ts";
import { type Layer, omt } from "../layer.ts";
import type { Theme } from "../theme.ts";

// Roads, railways and paths, in three passes: tunnels, the ground, bridges.
// Each class's width starts at 0 at the zoom where OpenMapTiles first puts
// the class in its tiles, so roads grow in rather than pop in.

/** Road classes, bottom to top. */
const CLASSES = [
  "service",
  "minor",
  "tertiary",
  "secondary",
  "primary",
  "trunk",
  "motorway",
] as const;
type RoadClass = (typeof CLASSES)[number];

/** Fill widths in pixels, by class; each begins where its data begins. */
const WIDTH: Record<RoadClass, Stops> = {
  motorway: {
    4: 0,
    6: 0.7,
    8: 1.1,
    10: 2,
    12: 3.4,
    14: 6,
    16: 12,
    18: 34,
    20: 120,
  },
  trunk: {
    5: 0,
    7: 0.6,
    8: 0.9,
    10: 1.7,
    12: 3,
    14: 5.4,
    16: 11,
    18: 30,
    20: 110,
  },
  primary: {
    7: 0,
    8.5: 0.7,
    10: 1.4,
    12: 2.8,
    14: 5.4,
    16: 10.5,
    18: 28,
    20: 100,
  },
  secondary: { 9: 0, 10.5: 0.8, 12: 2, 14: 4.2, 16: 9, 18: 24, 20: 90 },
  tertiary: { 11: 0, 12.5: 1.2, 14: 3.6, 16: 8, 18: 22, 20: 80 },
  minor: { 12: 0, 13.5: 0.9, 14.5: 2.6, 16: 6.5, 18: 18, 20: 66 },
  service: { 13: 0, 14.5: 0.9, 16: 3, 18: 9, 20: 32 },
};

/** Casing widths on each side, in pixels, by class. */
const CASING: Record<RoadClass, Stops> = {
  motorway: { 5: 0, 8: 0.3, 12: 0.6, 16: 1, 18: 2 },
  trunk: { 6: 0, 9: 0.3, 12: 0.6, 16: 1, 18: 2 },
  primary: { 8: 0, 10: 0.4, 12: 0.6, 16: 1, 18: 2 },
  secondary: { 10: 0, 11.5: 0.45, 14: 0.7, 16: 1, 18: 1.8 },
  tertiary: { 12: 0, 13: 0.5, 16: 0.9, 18: 1.6 },
  minor: { 13: 0, 14.5: 0.6, 16: 0.8, 18: 1.4 },
  service: { 14: 0, 15.5: 0.5, 18: 1 },
};

/**
 * Ramps are drawn narrower than their road, and grow in from the zoom where
 * OpenMapTiles first includes them, so interchanges don't arrive as blobs.
 */
const RAMP_SCALE: Stops = { 9: 0, 12: 0.2, 13.5: 0.4, 15: 0.65 };

function plus(a: Stops, b: Stops, times: number): Stops {
  const zooms = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map(Number)
    .sort((x, y) => x - y);
  return Object.fromEntries(
    zooms.map((z) => [z, sampleOr(a, z) + times * sampleOr(b, z)]),
  );
}

function sampleOr(stops: Stops, zoom: number): number {
  const keys = Object.keys(stops)
    .map(Number)
    .sort((x, y) => x - y);
  let lo: number | undefined;
  let hi: number | undefined;
  for (const k of keys) {
    if (k <= zoom) lo = k;
    if (k >= zoom && hi === undefined) hi = k;
  }
  if (lo === undefined) return 0;
  if (hi === undefined || hi === lo) return stops[lo] ?? 0;
  const t = (zoom - lo) / (hi - lo);
  return (stops[lo] ?? 0) * (1 - t) + (stops[hi] ?? 0) * t;
}

/** A width over zoom that depends on the class and whether it's a ramp. */
function widthOf(table: Record<RoadClass, Stops>, factor: number): Json {
  const zooms = [
    ...new Set([
      ...CLASSES.flatMap((klass) => Object.keys(table[klass]).map(Number)),
      ...Object.keys(RAMP_SCALE).map(Number),
    ]),
  ].sort((a, b) => a - b);
  const byClass = (zoom: number, scale: number): Json => [
    "match",
    ["get", "class"],
    ...CLASSES.flatMap((klass) => [
      klass,
      sampleOr(table[klass], zoom) * scale,
    ]),
    0,
  ];
  return [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    ...zooms.flatMap((zoom) => [
      zoom,
      [
        "case",
        ["==", ["get", "ramp"], 1],
        byClass(zoom, factor * sampleOr(RAMP_SCALE, zoom)),
        byClass(zoom, factor),
      ],
    ]),
  ];
}

function casingWidth(factor: number): Json {
  const table = { ...WIDTH };
  for (const klass of CLASSES) {
    table[klass] = plus(WIDTH[klass], CASING[klass], 2 / factor);
  }
  return widthOf(table, factor);
}

const sortKey: Json = [
  "match",
  ["get", "class"],
  ...CLASSES.flatMap((klass, i) => [klass, i]),
  -1,
];

/** Path subclasses of towns and cities, rather than of the backcountry. */
const FOOTWAYS = [
  "footway",
  "pedestrian",
  "cycleway",
  "steps",
  "corridor",
  "platform",
];

const ROAD_FILTER: Json = isIn("class", ...CLASSES);

function brunnel(kind: "tunnel" | "bridge" | "ground"): Json {
  if (kind === "ground") return ["!", isIn("brunnel", "tunnel", "bridge")];
  return ["==", ["get", "brunnel"], kind];
}

export function roads(t: Theme): Layer[] {
  const c = t.color;
  const w = t.roadWidth;
  const fillOf = (wash: number): Json => [
    "match",
    ["get", "class"],
    "motorway",
    mix(c.roadMotorway, c.land, wash),
    "trunk",
    mix(c.roadTrunk, c.land, wash),
    ["primary", "secondary", "tertiary"],
    mix(c.roadMajor, c.land, wash),
    "service",
    mix(c.roadService, c.land, wash),
    mix(c.roadMinor, c.land, wash),
  ];
  const casing: Json = [
    "match",
    ["get", "class"],
    "motorway",
    c.roadMotorwayCasing,
    "trunk",
    c.roadTrunkCasing,
    c.roadCasing,
  ];

  // Every pass starts at the first road zoom, so a bridge or tunnel never
  // leaves a gap in its road; widths start at 0 there, per class.
  const opacity = zoomLinear({ 4: 0.55, 8: 0.65, 11: 1 });
  const casingLayer = (kind: "bridge" | "ground"): Layer =>
    omt("transportation", {
      id: `road-${kind}-casing`,
      type: "line",
      minzoom: 4,
      filter: ["all", LINES, ROAD_FILTER, brunnel(kind)],
      layout: {
        "line-cap": kind === "ground" ? "round" : "butt",
        "line-join": "round",
        "line-sort-key": sortKey,
      },
      paint: {
        "line-color": casing,
        "line-width": casingWidth(w),
        "line-opacity": opacity,
      },
    });
  const fillLayer = (kind: "tunnel" | "bridge" | "ground"): Layer =>
    omt("transportation", {
      id: `road-${kind}`,
      type: "line",
      minzoom: 4,
      filter: ["all", LINES, ROAD_FILTER, brunnel(kind)],
      layout: {
        "line-cap": "round",
        "line-join": "round",
        "line-sort-key": sortKey,
      },
      paint: {
        // Tunnels are their road's colors washed into the land, with no
        // casing, so they read as underground and overlapping tubes don't
        // stripe.
        "line-color": fillOf(kind === "tunnel" ? 0.3 : 0),
        "line-width": widthOf(WIDTH, kind === "tunnel" ? w * 0.8 : w),
        "line-opacity":
          kind === "tunnel" ? zoomLinear({ 4: 0.25, 12: 0.35 }) : opacity,
      },
    });

  return [
    fillLayer("tunnel"),
    casingLayer("ground"),
    ...railAndPaths(t),
    fillLayer("ground"),
    casingLayer("bridge"),
    fillLayer("bridge"),
  ];
}

function railAndPaths(t: Theme): Layer[] {
  const c = t.color;
  return [
    // Sidewalks, plazas and steps are drawn as quiet solid lines; trails
    // and tracks keep the hiking map's dashes.
    omt("transportation", {
      id: "path-footway",
      type: "line",
      minzoom: 14,
      filter: [
        "all",
        LINES,
        ["==", ["get", "class"], "path"],
        isIn("subclass", ...FOOTWAYS),
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": mix(c.path, c.land, 0.35),
        "line-width": zoomExp(1.5, { 14: 0.5, 16: 0.9, 18: 2, 20: 4 }),
        "line-opacity": zoomLinear({ 14: 0, 15.5: 0.7, 18: 0.9 }),
      },
    }),
    omt("transportation", {
      id: "path-trail",
      type: "line",
      minzoom: 13,
      filter: [
        "all",
        LINES,
        [
          "any",
          ["==", ["get", "class"], "track"],
          [
            "all",
            ["==", ["get", "class"], "path"],
            ["!", isIn("subclass", ...FOOTWAYS)],
          ],
        ],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-join": "round" },
      paint: {
        "line-color": c.path,
        "line-width": zoomExp(1.5, { 13: 0.5, 16: 1, 18: 1.8, 20: 3 }),
        "line-dasharray": ["literal", [3, 2]],
        "line-opacity": zoomLinear({ 13: 0, 14.5: 0.8 }),
      },
    }),
    omt("transportation", {
      id: "rail",
      type: "line",
      minzoom: 9,
      filter: [
        "all",
        LINES,
        isIn("class", "rail", "transit"),
        ["!=", ["get", "brunnel"], "tunnel"],
        ["!", isIn("subclass", "subway", "tram")],
      ],
      layout: { "line-join": "round" },
      paint: {
        "line-color": c.rail,
        "line-width": zoomExp(1.4, { 9: 0.4, 12: 0.9, 16: 2, 18: 3 }),
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          0,
          10.5,
          ["case", ["has", "service"], 0, 0.45],
          12,
          ["case", ["has", "service"], 0, 1],
          14,
          ["case", ["has", "service"], 0, 1],
          15,
          1,
        ],
      },
    }),
    omt("transportation", {
      id: "rail-hatch",
      type: "line",
      minzoom: 14,
      filter: [
        "all",
        LINES,
        ["==", ["get", "class"], "rail"],
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      paint: {
        "line-color": c.rail,
        "line-width": zoomExp(1.4, { 14: 3, 18: 7 }),
        "line-dasharray": ["literal", [0.2, 3]],
        "line-opacity": fadeIn(14, 15.5),
      },
    }),
  ];
}
