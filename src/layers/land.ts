import { withAlpha } from "../color.ts";
import { fadeIn, fadeInOut, isIn, type Json, zoomLinear } from "../expr.ts";
import { DEM, type Layer, omt } from "../layer.ts";
import type { Theme } from "../theme.ts";

// The ground: an elevation tint, land cover, land use, parks and terrain
// shading. The tint stands in for land cover until OpenMapTiles has it, from
// zoom 7, and all of it recedes toward city zoom.

/** Grass subclasses drawn as scrub: dry, low or sparse vegetation. */
const SCRUB = ["heath", "scrub", "fell", "tundra", "scree"];

/** Built-up land use. */
const URBAN: Json = isIn(
  "class",
  "residential",
  "suburb",
  "quarter",
  "neighbourhood",
  "commercial",
  "retail",
);

/** Where the uplands tint begins, in meters. */
const UPLANDS = 600;

function relief(stops: [number, string][]): Json {
  return [
    "interpolate",
    ["linear"],
    ["elevation"],
    ...stops.flatMap(([meters, color]) => [meters, color]),
  ];
}

export function land(t: Theme): Layer[] {
  const c = t.color;
  return [
    {
      id: "background",
      type: "background",
      paint: { "background-color": c.land },
    },
    // Two tints: the whole range, for the atlas look at low zoom, and only
    // the uplands, which lasts into mountain detail without tinting the
    // cities, which are mostly low.
    {
      id: "relief",
      type: "color-relief",
      source: DEM,
      maxzoom: 12,
      paint: {
        "color-relief-color": relief(t.relief),
        "color-relief-opacity": zoomLinear({ 0: 1, 8: 1, 12: 0 }),
      },
    },
    {
      id: "relief-uplands",
      type: "color-relief",
      source: DEM,
      maxzoom: 15,
      paint: {
        "color-relief-color": relief(
          t.relief.map(([meters, color]) => [
            meters,
            meters < UPLANDS ? withAlpha(color, 0) : color,
          ]),
        ),
        "color-relief-opacity": zoomLinear({ 8: 0, 12: 0.9, 13: 0.8, 15: 0 }),
      },
    },
    omt("landuse", {
      id: "landuse-urban",
      type: "fill",
      filter: URBAN,
      paint: {
        "fill-color": c.urban,
        "fill-opacity": fadeInOut(4, 7, 13, 15.5, 0.9),
      },
    }),
    {
      id: "hillshade",
      type: "hillshade",
      source: DEM,
      paint: {
        // A key light from the northwest, and two weak fills from either side
        // of it that keep slopes facing away from it readable.
        "hillshade-method": "multidirectional",
        "hillshade-illumination-direction": [315, 255, 15],
        "hillshade-illumination-altitude": [40, 30, 30],
        "hillshade-highlight-color": [
          // Faint: a highlight can only wash the colors below it toward
          // white.
          withAlpha(c.hillshadeHighlight, 0.35),
          withAlpha(c.hillshadeHighlight, 0.1),
          withAlpha(c.hillshadeHighlight, 0.1),
        ],
        "hillshade-shadow-color": [
          withAlpha(c.hillshadeShadow, 0.42),
          withAlpha(c.hillshadeAccent, 0.2),
          withAlpha(c.hillshadeAccent, 0.2),
        ],
        "hillshade-exaggeration": zoomLinear({
          2: t.hillshade,
          6: t.hillshade * 0.85,
          10: t.hillshade * 0.9,
          11.5: t.hillshade * 0.72,
          12.5: t.hillshade * 0.65,
          14: t.hillshade * 0.35,
          15.5: t.hillshade * 0.18,
          17: t.hillshade * 0.1,
        }),
      },
    },
    // Land cover multiplied over the shaded relief, so the terrain's shadows
    // darken its colors instead of greying them. One layer, since each
    // blended layer draws offscreen.
    omt("landcover", {
      id: "landcover",
      type: "fill",
      minzoom: 7,
      filter: [
        "all",
        ["!=", ["get", "class"], "ice"],
        ["!", isIn("subclass", "park", "garden", "golf_course")],
      ],
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          "wood",
          c.wood,
          "grass",
          ["case", isIn("subclass", ...SCRUB), c.scrub, c.grass],
          "farmland",
          c.farmland,
          "wetland",
          c.wetland,
          "sand",
          c.sand,
          "rock",
          c.rock,
          "#ffffff",
        ],
        "fill-opacity": zoomLinear({ 7: 0, 9: 1, 13: 1, 16: 0.6 }),
        "fill-antialias": false,
        "fill-layer-blend": "multiply",
      },
    }),
    omt("landcover", {
      id: "landcover-ice",
      type: "fill",
      filter: ["==", ["get", "class"], "ice"],
      paint: {
        "fill-color": c.ice,
        "fill-opacity": zoomLinear({ 0: 0.75, 6: 0.85, 10: 0.9 }),
        "fill-antialias": false,
      },
    }),
    omt("landuse", {
      id: "landuse-industrial",
      type: "fill",
      filter: isIn("class", "industrial", "railway", "garages", "dam"),
      paint: { "fill-color": c.industrial, "fill-opacity": fadeIn(10, 12) },
    }),
    omt("landuse", {
      id: "landuse-institution",
      type: "fill",
      filter: isIn(
        "class",
        "hospital",
        "school",
        "university",
        "college",
        "kindergarten",
      ),
      paint: { "fill-color": c.institution, "fill-opacity": fadeIn(11, 13) },
    }),
    omt("park", {
      id: "park-protected",
      type: "fill",
      paint: {
        "fill-color": c.park,
        "fill-opacity": zoomLinear({ 4: 0, 6: 0.25, 10: 0.3, 14: 0.2 }),
        "fill-antialias": false,
      },
    }),
    omt("park", {
      id: "park-protected-edge",
      type: "line",
      minzoom: 6,
      filter: ["==", ["geometry-type"], "Polygon"],
      layout: { "line-join": "round" },
      paint: {
        "line-color": c.park,
        "line-width": zoomLinear({ 6: 0, 9: 1.5, 14: 3 }),
        "line-opacity": zoomLinear({ 6: 0, 9: 0.7, 14: 0.5 }),
        "line-blur": zoomLinear({ 6: 0.5, 14: 2 }),
      },
    }),
    // Built-up land over the shading: cities read as settled, flat ground
    // from regional zoom, and the terrain data's small bumps don't mottle
    // their streets.
    omt("landuse", {
      id: "landuse-urban-wash",
      type: "fill",
      minzoom: 8,
      // Land use only: suburbs and quarters are areas of a city's map that
      // cover its parks too.
      filter: isIn("class", "residential", "commercial", "retail"),
      paint: {
        "fill-color": c.urban,
        "fill-opacity": zoomLinear({ 8: 0, 10: 0.45, 12: 0.6 }),
        "fill-antialias": false,
      },
    }),
    // City parks, cemeteries and pitches over the wash: green stays green in town.
    omt("landuse", {
      id: "landuse-cemetery",
      type: "fill",
      filter: ["==", ["get", "class"], "cemetery"],
      paint: { "fill-color": c.cemetery, "fill-opacity": fadeIn(11, 13) },
    }),
    omt("landcover", {
      id: "landcover-park",
      type: "fill",
      filter: isIn("subclass", "park", "garden", "golf_course"),
      // Below full strength until z14: small parks arrive with the z13
      // tiles.
      paint: {
        "fill-color": c.park,
        "fill-opacity": zoomLinear({ 9: 0, 11: 0.7, 14: 1 }),
      },
    }),
    omt("landuse", {
      id: "landuse-pitch",
      type: "fill",
      filter: isIn("class", "pitch", "stadium", "playground", "track"),
      paint: { "fill-color": c.pitch, "fill-opacity": fadeIn(13, 15) },
    }),
  ];
}
