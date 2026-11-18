import { fadeIn, type Json, zoomLinear } from "../expr.ts";
import { type Layer, omt } from "../layer.ts";
import type { Theme } from "../theme.ts";

// Buildings arrive as footprints that fade in, then rise to their height
// over a couple of zoom levels, so a city never jumps from flat to tall.

/** Where footprints start to fade in: the building layer's first zoom. */
const FOOTPRINT = 13;
/** Where buildings start to rise, and where they reach full height. */
const RISE_FROM = 14.5;
const RISE_UNTIL = 16.5;
/** The footprints hand over to the extrusions over this zoom range. */
const HANDOVER: [number, number] = [RISE_FROM, RISE_FROM + 1];
/** Where roofs have brightened from the footprints' grey to white. */
const ROOF_WHITE = RISE_FROM + 1.25;

function rise(property: string): ReturnType<typeof zoomLinear> {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    RISE_FROM,
    0,
    RISE_UNTIL,
    ["coalesce", ["get", property], 0],
  ];
}

export function buildings(t: Theme): Layer[] {
  const c = t.color;
  // Outlines of buildings that OpenStreetMap draws by their parts: the parts
  // rise, the outline stays a footprint.
  const outline: Json = ["==", ["get", "hide_3d"], true];
  return [
    omt("building", {
      id: "building",
      type: "fill",
      minzoom: FOOTPRINT,
      // The extrusions draw these footprints from here on.
      maxzoom: HANDOVER[1],
      filter: ["!", outline],
      paint: {
        "fill-color": c.building,
        "fill-outline-color": c.buildingOutline,
        // Held under the extrusions while they fade in over it.
        "fill-opacity": zoomLinear({
          [FOOTPRINT]: 0,
          [FOOTPRINT + 1]: 1,
          [HANDOVER[1] - 0.3]: 1,
          [HANDOVER[1]]: 0,
        }),
      },
    }),
    omt("building", {
      id: "building-outline",
      type: "fill",
      minzoom: FOOTPRINT,
      filter: outline,
      paint: {
        // Brightens with the roofs around it, so it reads as one of them.
        "fill-color": zoomLinear({
          [RISE_FROM]: c.building,
          [ROOF_WHITE]: c.buildingRoof,
        }),
        "fill-outline-color": c.buildingOutline,
        "fill-opacity": fadeIn(FOOTPRINT, FOOTPRINT + 1),
      },
    }),
    omt("building", {
      id: "building-3d",
      type: "fill-extrusion",
      minzoom: RISE_FROM,
      filter: ["!", outline],
      layout: { "fill-extrusion-rounded-corner-distance": 6 },
      paint: {
        // Starts in its footprint's grey, so it takes over without a seam,
        // and brightens as it rises.
        "fill-extrusion-color": zoomLinear({
          [RISE_FROM]: c.building,
          [ROOF_WHITE]: c.buildingRoof,
        }),
        "fill-extrusion-height": rise("render_height"),
        "fill-extrusion-base": rise("render_min_height"),
        "fill-extrusion-vertical-gradient": true,
        "fill-extrusion-opacity": fadeIn(HANDOVER[0], HANDOVER[1] - 0.3),
      },
    }),
  ];
}
