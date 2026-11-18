import type { Json } from "./expr.ts";
import { DEM, type Layer, OMT, SEA } from "./layer.ts";
import { boundaries } from "./layers/boundaries.ts";
import { buildings } from "./layers/buildings.ts";
import { labels } from "./layers/labels.ts";
import { land } from "./layers/land.ts";
import { roads } from "./layers/roads.ts";
import { water } from "./layers/water.ts";
import type { Theme } from "./theme.ts";

/** The whole style for `theme`, with its sprite and glyphs under `base`. */
export function style(theme: Theme, base: string): Record<string, Json> {
  const roadLayers = roads(theme);
  const layers: Layer[] = [
    ...land(theme),
    // Tunnels below the water, so one under a river doesn't read as a bridge.
    ...roadLayers.filter((layer) => layer.id === "road-tunnel"),
    ...water(theme),
    ...roadLayers.filter((layer) => layer.id !== "road-tunnel"),
    ...buildings(theme),
    ...boundaries(theme),
    ...labels(theme),
  ];
  return {
    version: 8,
    name: theme.name,
    center: [0, 30],
    zoom: 2,
    sources: {
      [OMT]: {
        type: "vector",
        url: "https://tiles.openfreemap.org/planet",
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      },
      [DEM]: {
        type: "raster-dem",
        tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
        tileSize: 512,
        maxzoom: 12,
        encoding: "terrarium",
        attribution:
          '<a href="https://mapterhorn.com/attribution" target="_blank">&copy; Mapterhorn</a>',
      },
      // Mapterhorn is land only; Mapzen's terrain tiles have the sea floor.
      // Depth reads at ocean scale only, so a coarse zoom is enough.
      [SEA]: {
        type: "raster-dem",
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 7,
        encoding: "terrarium",
        attribution:
          '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Mapzen terrain tiles</a>',
      },
    },
    sprite: `${base}sprites/gouache`,
    glyphs: `${base}fonts/{fontstack}/{range}.pbf`,
    light: {
      anchor: "map",
      position: [1.15, 210, 35],
      color: theme.color.light,
      intensity: theme.lightIntensity,
    },
    sky: {
      "sky-color": theme.color.sky,
      "horizon-color": theme.color.horizon,
      "fog-color": theme.color.land,
      "sky-horizon-blend": 0.7,
      "horizon-fog-blend": 0.8,
      "fog-ground-blend": 0.95,
      "atmosphere-blend": 0,
    },
    layers: layers.map((layer) => toJson(layer)),
  };
}

function toJson(layer: Layer): Json {
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(layer)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
