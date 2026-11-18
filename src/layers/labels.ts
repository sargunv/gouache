import { mix } from "../color.ts";
import {
  fadeOut,
  isIn,
  type Json,
  NAME,
  NAME_EN,
  zoomLinear,
} from "../expr.ts";
import { type Layer, omt } from "../layer.ts";
import { iconId, POIS } from "../pois.ts";
import type { PoiCategory, Theme } from "../theme.ts";

// Every label and icon: water names, roads and shields, POIs, places.
//
// The renderer fades symbols in as they're placed, so these layers don't fade
// in with zoom: a label at opacity 0 still takes its collision space and
// pushes visible ones out. Density comes from filters and minzooms instead.
// A layer that leaves its zoom range drops its symbols at once, so a layer
// with a maxzoom fades out over its last half zoom.

type Weight =
  | "Regular"
  | "Medium"
  | "SemiBold"
  | "Bold"
  | "Italic"
  | "Medium Italic";

/** A text-font that falls back to Noto Sans for what the family lacks. */
function font(family: string, weight: Weight): Json {
  return ["literal", [`${family} ${weight}`, `Noto Sans ${weight}`]];
}

export function labels(t: Theme): Layer[] {
  // Placed top first: lakes, ponds and fountains below the roads, so street
  // names win over them.
  return [
    ...lakeLabels(t),
    ...roadLabels(t),
    ...poiLabels(t),
    // Above the POIs, so a river keeps its name among the city's labels.
    ...waterLabels(t),
    ...placeLabels(t),
  ];
}

function waterHalo(t: Theme): Record<string, Json> {
  return {
    "text-halo-color": mix(t.color.water, "#ffffff", 0.35),
    "text-halo-width": 1,
    "text-halo-blur": 0.5,
  };
}

/**
 * Lakes, ponds and fountains: OpenMapTiles names every one at street zoom,
 * so they give way to POIs and stay small.
 */
function lakeLabels(t: Theme): Layer[] {
  const c = t.color;
  const halo = waterHalo(t);
  return (["Point", "LineString"] as const).map((geometry) =>
    omt("water_name", {
      id: `label-water-lake-${geometry === "Point" ? "point" : "line"}`,
      type: "symbol",
      minzoom: 8,
      filter: [
        "all",
        ["==", ["get", "class"], "lake"],
        ["==", ["geometry-type"], geometry],
      ],
      layout: {
        "text-field": NAME,
        "text-font": font(t.type.text, "Italic"),
        // Small: OpenMapTiles names every pond and fountain at street zoom.
        "text-size": zoomLinear({ 8: 11, 14: 11, 18: 12 }),
        "text-letter-spacing": 0.05,
        "text-max-width": 8,
        "symbol-placement": geometry === "Point" ? "point" : "line",
      },
      paint: { "text-color": c.labelWater, ...halo },
    }),
  );
}

function waterLabels(t: Theme): Layer[] {
  const c = t.color;
  const halo = waterHalo(t);
  return [
    omt("waterway", {
      id: "label-waterway",
      type: "symbol",
      minzoom: 12,
      filter: isIn("class", "river", "canal"),
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 400,
        "text-field": NAME,
        "text-font": font(t.type.text, "Italic"),
        "text-size": zoomLinear({ 12: 12, 15: 14, 18: 16 }),
        "text-letter-spacing": 0.08,
        "text-max-angle": 30,
      },
      paint: { "text-color": c.labelWater, ...halo },
    }),
    omt("water_name", {
      id: "label-water-ocean",
      type: "symbol",
      filter: isIn("class", "ocean", "sea", "bay", "strait"),
      layout: {
        "text-field": NAME_EN,
        "text-font": font(t.type.text, "Italic"),
        // Bays and straits are often small and seen at city zoom: they take
        // a lake's size.
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          ["match", ["get", "class"], ["ocean", "sea"], 11, 10],
          4,
          ["match", ["get", "class"], ["ocean", "sea"], 14, 11],
          8,
          ["match", ["get", "class"], ["ocean", "sea"], 16, 12],
          14,
          ["match", ["get", "class"], ["ocean", "sea"], 16, 13],
        ],
        "text-letter-spacing": [
          "match",
          ["get", "class"],
          ["ocean", "sea"],
          0.22,
          0.08,
        ],
        "text-max-width": 6,
        "text-line-height": 1.3,
      },
      paint: { "text-color": c.labelWater, ...halo },
    }),
  ];
}

/** The zoom from which each road class is named. */
const ROAD_LABEL_FROM: Record<string, number> = {
  motorway: 10,
  trunk: 11,
  primary: 12,
  secondary: 13,
  tertiary: 13,
  minor: 15,
  service: 16,
  path: 16,
  track: 16,
};

/** Features whose class is shown from `from[class]` on. */
function classFrom(from: Record<string, number>): Json {
  const byZoom = new Map<number, string[]>();
  for (const [klass, zoom] of Object.entries(from)) {
    byZoom.set(zoom, [...(byZoom.get(zoom) ?? []), klass]);
  }
  return [
    "any",
    ...[...byZoom].map(([zoom, classes]): Json => [
      "all",
      isIn("class", ...classes),
      [">=", ["zoom"], zoom],
    ]),
  ];
}

function roadLabels(t: Theme): Layer[] {
  const c = t.color;
  return [
    omt("transportation_name", {
      id: "label-road",
      type: "symbol",
      minzoom: 10,
      filter: classFrom(ROAD_LABEL_FROM),
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 350,
        "text-field": NAME,
        "text-font": font(t.type.road, "Medium"),
        "text-size": zoomLinear({ 12: 10, 15: 11.5, 18: 14 }),
        "text-letter-spacing": 0.02,
        "text-max-angle": 30,
        "text-padding": 4,
        // Upright to the screen when the map is pitched, so a name stays
        // legible instead of lying flat on the street among the buildings.
        "text-pitch-alignment": "viewport",
        "symbol-sort-key": [
          "match",
          ["get", "class"],
          "motorway",
          0,
          "trunk",
          1,
          "primary",
          2,
          "secondary",
          3,
          "tertiary",
          4,
          5,
        ],
      },
      paint: {
        "text-color": c.labelRoad,
        "text-halo-color": c.labelHalo,
        "text-halo-width": 1.1,
      },
    }),
    omt("transportation_name", {
      id: "label-shield",
      type: "symbol",
      minzoom: 8,
      filter: [
        "all",
        classFrom({ motorway: 8, trunk: 9, primary: 11 }),
        ["has", "ref"],
        ["<=", ["get", "ref_length"], 6],
      ],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          400,
          14,
          700,
        ],
        // A road on several routes has refs like "4;5": show the first.
        "text-field": [
          "let",
          "ref",
          ["get", "ref"],
          [
            "case",
            ["in", ";", ["var", "ref"]],
            ["slice", ["var", "ref"], 0, ["index-of", ";", ["var", "ref"]]],
            ["var", "ref"],
          ],
        ],
        "text-font": font(t.type.shield, "SemiBold"),
        "text-size": zoomLinear({ 8: 8.5, 14: 9.5 }),
        "text-rotation-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "icon-image": "shield",
        "icon-text-fit": "both",
        "icon-text-fit-padding": [2, 4, 1, 4],
        "symbol-sort-key": [
          "match",
          ["get", "class"],
          "motorway",
          0,
          "trunk",
          1,
          2,
        ],
      },
      paint: {
        "text-color": c.shieldText,
      },
    }),
  ];
}

function poiLabels(t: Theme): Layer[] {
  const c = t.color;
  const known = Object.keys(POIS);
  const lookup = (pick: (key: string) => Json, fallback: Json): Json => [
    "match",
    ["get", "subclass"],
    ...known.flatMap((key) => [key, pick(key)]),
    [
      "match",
      ["get", "class"],
      ...known.flatMap((key) => [key, pick(key)]),
      fallback,
    ],
  ];
  const category = (key: string): PoiCategory =>
    POIS[key]?.category ?? "default";
  const kind = (key: string) => POIS[key];
  const icon = lookup((key) => {
    const k = kind(key);
    return k ? iconId(k) : "poi-dot";
  }, "poi-dot");
  const textColor = lookup(
    (key) => mix(t.poi[category(key)], c.labelPlace, 0.35),
    mix(t.poi.default, c.labelPlace, 0.35),
  );

  // Fewer POIs at lower zoom: OpenMapTiles ranks them by importance within
  // each tile, lowest first. Stations are their own layer, shown earlier.
  // Each zoom's POIs arrive over two half steps, the most important first,
  // so a zoom never floods in at once.
  const tiers: [number, number][] = [
    [15, 3],
    [15.5, 7],
    [16, 13],
    [16.5, 20],
    [17, 1000],
  ];
  const LAST = 17;
  /**
   * Landmarks that a tile ranks among its first eight arrive with the first
   * tier: OpenMapTiles ranks by class, which puts a city's sights behind its
   * shops and cafés.
   */
  const earlyLandmark: Json = [
    "all",
    isIn("class", "attraction", "museum", "castle", "monument", "art_gallery"),
    ["<", ["get", "rank"], 8],
  ];
  /** Names too long to set before there's room: a site's full listing. */
  const shortName: Json = ["<=", ["length", NAME], 30];
  /** Practices and errands: many, alike, and rarely landmarks. */
  const errand: Json = [
    "any",
    isIn(
      "class",
      "bus",
      "doctors",
      "dentist",
      "veterinary",
      "police",
      "post",
      "bank",
      "atm",
      "toilets",
      "information",
      "office",
    ),
    isIn("subclass", "clinic", "doctors", "dentist"),
  ];
  const poiLayout = (minzoom: number): Record<string, Json> => ({
    "icon-image": icon,
    "icon-size": zoomLinear({ [minzoom]: 0.85, [minzoom + 2]: 1 }),
    "text-field": NAME,
    "text-font": font(t.type.text, "Medium"),
    "text-size": zoomLinear({ [minzoom]: 10.5, 18: 12 }),
    // One anchor: variable anchors make the renderer reposition every
    // label on each frame the camera turns.
    "text-anchor": "top",
    "text-offset": [0, 1],
    "text-max-width": 9,
    // Room around each POI while few are shown, so they have space.
    "icon-padding": zoomLinear({ [minzoom]: 10, 18: 3 }),
    "text-padding": zoomLinear({ [minzoom]: 6, 18: 2 }),
    "symbol-sort-key": ["get", "rank"],
  });
  const poiPaint: Record<string, Json> = {
    "text-color": textColor,
    "text-halo-color": c.labelHalo,
    "text-halo-width": 1,
  };
  return [
    omt("mountain_peak", {
      id: "label-peak",
      type: "symbol",
      minzoom: 9,
      // Only real mountains while a view spans a region; hills and urban
      // knolls wait for street zoom, where they're local landmarks.
      filter: [
        "all",
        isIn("class", "peak", "volcano"),
        ["has", "name"],
        [
          ">=",
          ["coalesce", ["get", "ele"], 0],
          ["step", ["zoom"], 900, 11, 500, 13, 250, 15, 0],
        ],
      ],
      layout: {
        "icon-image": "peak",
        "icon-size": zoomLinear({ 9: 0.7, 14: 1 }),
        "text-field": [
          "format",
          NAME,
          {},
          ["case", ["has", "ele"], "\n", ""],
          {},
          [
            "case",
            ["has", "ele"],
            ["concat", ["to-string", ["get", "ele"]], " m"],
            "",
          ],
          { "font-scale": 0.85 },
        ],
        "text-font": font(t.type.text, "Medium Italic"),
        "text-size": zoomLinear({ 9: 10, 14: 11.5 }),
        "text-anchor": "top",
        "text-offset": [0, 0.6],
        "text-max-width": 8,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": c.labelPeak,
        "text-halo-color": c.labelHalo,
        "text-halo-width": 1,
      },
    }),
    omt("aerodrome_label", {
      id: "label-airport",
      type: "symbol",
      minzoom: 9,
      // Both codes, and not private or minor: seaplane bases, heliports
      // and airstrips can carry an IATA code too.
      filter: [
        "all",
        ["has", "iata"],
        ["has", "icao"],
        ["!", isIn("class", "private", "other")],
      ],
      layout: {
        "icon-image": "poi-maki-airport-transit",
        "icon-size": zoomLinear({ 9: 0.8, 13: 1 }),
        "text-field": NAME,
        "text-font": font(t.type.text, "Medium"),
        "text-size": zoomLinear({ 9: 10, 14: 12 }),
        "text-anchor": "top",
        "text-offset": [0, 1.1],
        "text-max-width": 8,
        "text-optional": true,
      },
      paint: {
        "text-color": mix(t.poi.transit, c.labelPlace, 0.35),
        "text-halo-color": c.labelHalo,
        "text-halo-width": 1,
      },
    }),
    // Railway stations first; a city's many metro stations a zoom later.
    ...(
      [
        ["station", 13, ["station", "halt"]],
        ["subway", 15, ["subway"]],
      ] as const
    ).map(([id, minzoom, subclasses]) =>
      omt("poi", {
        id: `label-poi-${id}`,
        type: "symbol",
        minzoom,
        filter: [
          "all",
          ["has", "name"],
          ["==", ["get", "class"], "railway"],
          isIn("subclass", ...subclasses),
        ],
        layout: {
          ...poiLayout(minzoom),
          // A big interchange is several stations of one name, one per
          // operator: room enough that one of them names it.
          "icon-padding": zoomLinear({ [minzoom]: 24, 16: 16, 18: 6 }),
        },
        paint: poiPaint,
      }),
    ),
    ...tiers.map(([minzoom, below], i) => {
      const from = i === 0 ? 0 : (tiers[i - 1]?.[1] ?? 0);
      const ranked: Json = [
        "all",
        [">=", ["get", "rank"], from],
        ["<", ["get", "rank"], below],
      ];
      return omt("poi", {
        id: `label-poi-${String(minzoom).replace(".", "-")}`,
        type: "symbol",
        minzoom,
        filter: [
          "all",
          ["has", "name"],
          i === 0
            ? ["any", ranked, earlyLandmark]
            : ["all", ranked, ["!", earlyLandmark]],
          ["!", isIn("class", "entrance", "railway")],
          // Errands, and long names that need room, wait for the last tier.
          ...(minzoom < LAST ? [["!", errand], shortName] : []),
        ],
        layout: poiLayout(minzoom),
        paint: poiPaint,
      });
    }),
    omt("park", {
      id: "label-park",
      type: "symbol",
      minzoom: 8,
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["has", "name"],
        ["<=", ["get", "rank"], 3],
        ["any", ["<=", ["length", NAME], 30], [">=", ["zoom"], 17]],
      ],
      layout: {
        "text-field": NAME,
        "text-font": font(t.type.text, "Medium Italic"),
        "text-size": zoomLinear({ 8: 11, 14: 12.5 }),
        "text-max-width": 8,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": c.labelPark,
        "text-halo-color": c.labelHalo,
        "text-halo-width": 1,
      },
    }),
    omt("housenumber", {
      id: "label-housenumber",
      type: "symbol",
      minzoom: 17,
      layout: {
        "text-field": ["get", "housenumber"],
        "text-font": font(t.type.text, "Regular"),
        "text-size": 9.5,
        "text-padding": 2,
      },
      paint: {
        "text-color": mix(c.labelPlaceMinor, c.building, 0.3),
      },
    }),
  ];
}

/** Countries too small to label at the size of their neighbours. */
const MICROSTATE: Json = isIn(
  "iso_a2",
  "AD",
  "LI",
  "LU",
  "MC",
  "MT",
  "SM",
  "VA",
  "GI",
  "SG",
  "BH",
  "AG",
  "BB",
  "DM",
  "GD",
  "KN",
  "LC",
  "VC",
  "MV",
  "SC",
  "MU",
  "ST",
  "KM",
  "CV",
  "MH",
  "NR",
  "TV",
  "PW",
  "KI",
  "FM",
  "TO",
  "WS",
);

/** The zoom by which city names have stepped back for the streets. */
const CITY_UNTIL = 15;

function placeLabels(t: Theme): Layer[] {
  const c = t.color;
  const haloPaint = {
    "text-halo-color": c.labelHalo,
    "text-halo-width": 1.2,
    "text-halo-blur": 0.25,
  };
  /** Bigger for a lower rank (more important). */
  const byRank = (top: number, bottom: number): Json => [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "rank"], 10],
    1,
    top,
    10,
    bottom,
  ];
  /**
   * Bigger for a larger country: OpenMapTiles ranks countries 1 to 3, and
   * microstates, which rank with mid-sized countries, are set smaller still.
   */
  const countryRank = (top: number, bottom: number): Json => [
    "case",
    MICROSTATE,
    bottom * 0.8,
    [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "rank"], 3],
      1,
      top,
      3,
      bottom,
    ],
  ];
  const cityLayout: Record<string, Json> = {
    // English where the map names countries in English, so one script
    // reads across a continent.
    "text-field": NAME_EN,
    "text-font": font(t.type.text, "SemiBold"),
    // Lesser cities, such as a capital's boroughs, shrink well below it
    // at city zoom.
    "text-size": [
      "interpolate",
      ["linear"],
      ["zoom"],
      3,
      byRank(12, 9.5),
      8,
      byRank(16.5, 11.5),
      12,
      byRank(21, 13),
    ],
    "text-max-width": 10,
    "symbol-sort-key": ["get", "rank"],
  };
  const cityPaint: Record<string, Json> = {
    // Lesser cities in a softer ink, so tone agrees with size.
    "text-color": [
      "interpolate",
      ["linear"],
      ["coalesce", ["get", "rank"], 10],
      2,
      c.labelPlace,
      8,
      mix(c.labelPlace, c.labelPlaceMinor, 0.6),
    ],
    ...haloPaint,
    // A city's name steps back once its streets are the map.
    "text-opacity": fadeOut(CITY_UNTIL - 0.6, CITY_UNTIL),
  };
  return [
    omt("place", {
      id: "label-neighbourhood",
      type: "symbol",
      minzoom: 11,
      // Districts first; the smaller quarters and neighbourhoods once the
      // streets are named.
      filter: classFrom({ suburb: 11, quarter: 13, neighbourhood: 14 }),
      layout: {
        "text-field": NAME,
        "text-font": font(t.type.road, "SemiBold"),
        "text-size": zoomLinear({ 12: 10, 16: 11.5 }),
        // Not a numbered district's name: uppercase would turn the French
        // ordinal "8e" into "8E".
        "text-transform": [
          "case",
          [
            "any",
            ...Array.from({ length: 10 }, (_, digit): Json => [
              "in",
              String(digit),
              NAME,
            ]),
          ],
          "none",
          "uppercase",
        ],
        // Tracking also spaces out CJK, so it stays modest.
        "text-letter-spacing": 0.12,
        "text-max-width": 7,
        // Wide spacing while a view spans a city, so its districts name the
        // map without filling it.
        "text-padding": zoomLinear({ 11: 28, 13: 14, 15: 6 }),
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": c.labelPlaceMinor,
        ...haloPaint,
      },
    }),
    omt("place", {
      id: "label-village",
      type: "symbol",
      minzoom: 10,
      filter: isIn("class", "village", "hamlet", "island"),
      layout: {
        "text-field": NAME,
        "text-font": font(t.type.text, "Medium"),
        "text-size": zoomLinear({ 10: 10.5, 14: 13, 16: 14 }),
        "text-max-width": 10,
      },
      paint: {
        "text-color": c.labelPlace,
        ...haloPaint,
      },
    }),
    omt("place", {
      id: "label-town",
      type: "symbol",
      minzoom: 7,
      // A town's name steps back once its streets are the map.
      maxzoom: 16,
      filter: ["==", ["get", "class"], "town"],
      layout: {
        "text-field": NAME,
        "text-font": font(t.type.text, "Medium"),
        "text-size": zoomLinear({ 7: 10.5, 11: 13, 14: 15 }),
        "text-max-width": 10,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": c.labelPlace,
        ...haloPaint,
        "text-opacity": fadeOut(15.5, 16),
      },
    }),
    omt("place", {
      id: "label-city",
      type: "symbol",
      minzoom: 3,
      maxzoom: CITY_UNTIL,
      filter: [
        "all",
        ["==", ["get", "class"], "city"],
        ["!=", ["get", "capital"], 2],
        // A capital's boroughs, such as Westminster, are ranked as lesser
        // cities: from z13 their districts name them.
        ["any", ["<", ["get", "rank"], 10], ["<", ["zoom"], 13]],
      ],
      layout: cityLayout,
      paint: cityPaint,
    }),
    omt("place", {
      id: "label-state",
      type: "symbol",
      minzoom: 4,
      maxzoom: 9,
      filter: isIn("class", "state", "province"),
      layout: {
        "text-field": NAME,
        "text-font": font(t.type.text, "SemiBold"),
        "text-size": zoomLinear({ 4: 8.5, 8: 11 }),
        "text-transform": "uppercase",
        "text-letter-spacing": 0.16,
        "text-max-width": 8,
      },
      paint: {
        "text-color": mix(c.labelPlaceMinor, c.boundaryCountry, 0.35),
        ...haloPaint,
        "text-opacity": fadeOut(8.5, 9, 0.9),
      },
    }),
    // Capitals are placed after the countries' names, and move above or
    // below one they would collide with, rather than give way to it.
    omt("place", {
      id: "label-capital",
      type: "symbol",
      minzoom: 3,
      maxzoom: CITY_UNTIL,
      filter: [
        "all",
        ["==", ["get", "class"], "city"],
        ["==", ["get", "capital"], 2],
      ],
      layout: {
        ...cityLayout,
        "text-variable-anchor": ["center", "top", "bottom"],
        "text-radial-offset": 0.5,
      },
      paint: cityPaint,
    }),
    omt("place", {
      id: "label-country",
      type: "symbol",
      minzoom: 1,
      maxzoom: 8,
      // Microstates wait until they're more than a dot.
      filter: [
        "all",
        ["==", ["get", "class"], "country"],
        ["any", ["!", MICROSTATE], [">=", ["zoom"], 5]],
      ],
      layout: {
        "text-field": NAME_EN,
        "text-font": font(t.type.text, "SemiBold"),
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          1,
          countryRank(10, 7),
          4,
          countryRank(13, 8.5),
          7,
          countryRank(16, 10.5),
        ],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.12,
        "text-max-width": 6,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": [
          "case",
          MICROSTATE,
          mix(c.labelCountry, c.labelHalo, 0.25),
          c.labelCountry,
        ],
        ...haloPaint,
        "text-opacity": fadeOut(7.5, 8),
      },
    }),
  ];
}
