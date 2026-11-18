import { fadeIn, isIn, type Stops, zoomExp, zoomLinear } from "../expr.ts";
import { type Layer, omt, SEA } from "../layer.ts";
import type { Theme } from "../theme.ts";

// Water bodies, rivers and streams, and airport grounds.

/** The shallows' width in pixels. */
const SHALLOWS: Stops = { 4: 1, 8: 2.5, 12: 3.5, 14: 3.5, 18: 3 };

function halve(stops: Stops): Stops {
  return Object.fromEntries(
    Object.entries(stops).map(([zoom, value]) => [zoom, value / 2]),
  );
}

export function water(t: Theme): Layer[] {
  const c = t.color;
  return [
    omt("waterway", {
      id: "waterway-river",
      type: "line",
      filter: [
        "all",
        isIn("class", "river", "canal"),
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": c.waterway,
        "line-width": zoomExp(1.5, { 8: 0.5, 12: 1.5, 15: 4, 18: 12 }),
        "line-opacity": fadeIn(3, 6),
      },
    }),
    omt("waterway", {
      id: "waterway-stream",
      type: "line",
      minzoom: 12,
      filter: [
        "all",
        isIn("class", "stream", "ditch", "drain"),
        ["!=", ["get", "brunnel"], "tunnel"],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": c.waterway,
        "line-width": zoomExp(1.5, { 12: 0.3, 15: 1.2, 18: 3 }),
        "line-opacity": fadeIn(12, 13.5),
      },
    }),
    omt("water", {
      id: "water",
      type: "fill",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      paint: {
        "fill-color": zoomLinear({ 4: c.ocean, 9: c.water }),
        "fill-antialias": true,
        "fill-opacity": ["case", ["==", ["get", "intermittent"], 1], 0.5, 1],
      },
    }),
    // Ocean depth, until the oceans leave the view.
    {
      id: "water-depth",
      type: "color-relief",
      source: SEA,
      maxzoom: 10,
      paint: {
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          ...t.depth.flatMap(([meters, color]) => [meters, color]),
        ],
        "color-relief-opacity": zoomLinear({ 0: 1, 7: 1, 10: 0 }),
      },
    },
    // Shallows: a lighter band just inside every shore.
    omt("water", {
      id: "water-shallows",
      type: "line",
      filter: ["!=", ["get", "brunnel"], "tunnel"],
      layout: { "line-join": "round" },
      paint: {
        "line-color": c.waterShallow,
        "line-width": zoomExp(1.4, SHALLOWS),
        "line-offset": zoomExp(1.4, halve(SHALLOWS)),
        "line-blur": zoomExp(1.4, SHALLOWS),
        // Fainter at street zoom, where it would outline every pier.
        "line-opacity": zoomLinear({ 4: 0, 7: 0.9, 13: 0.9, 16: 0.35 }),
      },
    }),
    omt("aeroway", {
      id: "aeroway-area",
      type: "fill",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": c.aeroway, "fill-opacity": fadeIn(10, 12, 0.7) },
    }),
    omt("aeroway", {
      id: "aeroway-runway",
      type: "line",
      filter: [
        "all",
        ["==", ["geometry-type"], "LineString"],
        isIn("class", "runway", "taxiway"),
      ],
      paint: {
        "line-color": c.aeroway,
        "line-width": [
          "interpolate",
          ["exponential", 1.5],
          ["zoom"],
          10,
          ["match", ["get", "class"], "runway", 1, 0],
          14,
          ["match", ["get", "class"], "runway", 12, 2],
          18,
          ["match", ["get", "class"], "runway", 80, 18],
        ],
        "line-opacity": fadeIn(10, 11.5),
      },
    }),
  ];
}
