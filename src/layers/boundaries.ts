import { fadeIn, zoomExp, zoomLinear } from "../expr.ts";
import { type Layer, omt } from "../layer.ts";
import type { Theme } from "../theme.ts";

// Country and state borders on land. Maritime borders aren't drawn.

export function boundaries(t: Theme): Layer[] {
  const c = t.color;
  const onLand = ["!=", ["get", "maritime"], 1];
  return [
    omt("boundary", {
      id: "boundary-state",
      type: "line",
      minzoom: 3,
      filter: ["all", ["==", ["get", "admin_level"], 4], onLand],
      layout: { "line-join": "round" },
      paint: {
        "line-color": c.boundaryState,
        "line-width": zoomExp(1.4, { 3: 0.4, 8: 1, 14: 1.6 }),
        "line-dasharray": ["literal", [3, 2]],
        "line-opacity": zoomLinear({ 3: 0, 5: 0.8, 14: 0.6 }),
      },
    }),
    omt("boundary", {
      id: "boundary-country",
      type: "line",
      filter: [
        "all",
        ["==", ["get", "admin_level"], 2],
        onLand,
        ["!=", ["get", "disputed"], 1],
        // Claimants' lines for a border drawn elsewhere.
        ["!", ["has", "claimed_by"]],
      ],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": c.boundaryCountry,
        "line-width": zoomExp(1.4, { 0: 0.6, 5: 1.2, 10: 2, 14: 3 }),
        "line-opacity": zoomLinear({ 0: 0.7, 6: 1 }),
      },
    }),
    omt("boundary", {
      id: "boundary-disputed",
      type: "line",
      filter: [
        "all",
        ["==", ["get", "admin_level"], 2],
        onLand,
        ["==", ["get", "disputed"], 1],
      ],
      paint: {
        "line-color": c.boundaryCountry,
        "line-width": zoomExp(1.4, { 0: 0.6, 5: 1.2, 10: 2, 14: 3 }),
        "line-dasharray": ["literal", [2, 2]],
        "line-opacity": fadeIn(0, 1, 0.8),
      },
    }),
  ];
}
