import type { Json } from "./expr.ts";

/** A style layer, as plain JSON. */
export interface Layer {
  id: string;
  type:
    | "background"
    | "fill"
    | "line"
    | "symbol"
    | "circle"
    | "fill-extrusion"
    | "hillshade"
    | "raster"
    | "color-relief";
  source?: string;
  "source-layer"?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: Json;
  layout?: Record<string, Json>;
  paint?: Record<string, Json>;
}

/** The OpenMapTiles vector source's id. */
export const OMT = "openmaptiles";
/** The terrain source's id. */
export const DEM = "terrain";
/** The bathymetry source's id: elevation that includes the sea floor. */
export const SEA = "bathymetry";

/** A layer on the OpenMapTiles source. */
export function omt(
  sourceLayer: string,
  layer: Omit<Layer, "source" | "source-layer">,
): Layer {
  return { ...layer, source: OMT, "source-layer": sourceLayer };
}
