// The design tokens that the layers read: everything that makes one style of
// the family look different from another.

export interface Theme {
  name: string;
  /** Font families; each must have glyphs in dist/fonts (fonts/fonts.json). */
  type: {
    /** Places, POIs, water. */
    text: string;
    /** Road names; may be a narrower cut. */
    road: string;
    /** Route numbers on shields. */
    shield: string;
  };
  color: {
    land: string;
    /** Built-up land: residential, commercial and the like. */
    urban: string;
    industrial: string;
    park: string;
    wood: string;
    grass: string;
    /** Heath, scrub, fell and tundra: the dry, low vegetation. */
    scrub: string;
    farmland: string;
    wetland: string;
    sand: string;
    ice: string;
    rock: string;
    /** Hospitals, schools, universities. */
    institution: string;
    cemetery: string;
    pitch: string;
    water: string;
    /** The lighter band of shallows just inside every shore. */
    waterShallow: string;
    /** Water at low zoom, where it's mostly ocean. */
    ocean: string;
    waterway: string;
    aeroway: string;
    /** Footprints, and the walls' color where an extrusion meets them. */
    building: string;
    /** Roofs at full height. */
    buildingRoof: string;
    buildingOutline: string;
    roadMotorway: string;
    roadMotorwayCasing: string;
    roadTrunk: string;
    roadTrunkCasing: string;
    roadMajor: string;
    roadMinor: string;
    roadCasing: string;
    roadService: string;
    path: string;
    rail: string;
    boundaryCountry: string;
    boundaryState: string;
    /** Shadows on slopes facing away from the light: a dark version of the
     * land's own hue, since alpha blending greys a contrasting one. */
    hillshadeShadow: string;
    /** Slopes facing the light; warm. */
    hillshadeHighlight: string;
    /** The soft overhead light's shadow, which models the valleys. */
    hillshadeAccent: string;
    labelPlace: string;
    labelPlaceMinor: string;
    labelCountry: string;
    /** Peaks and other landforms. */
    labelPeak: string;
    labelRoad: string;
    labelWater: string;
    labelPark: string;
    labelHalo: string;
    shield: string;
    shieldText: string;
    sky: string;
    /** Where the sky meets the ground, past the fog. */
    horizon: string;
    /** The light on buildings' walls. */
    light: string;
  };
  /**
   * The land's tint by elevation in meters, below the land cover, as
   * elevation to color. It fades out toward city zoom.
   */
  relief: [number, string][];
  /**
   * Tints over the ocean by depth in meters (negative), as depth to color
   * with alpha: lighter shelves, deeper blue basins. Transparent near sea
   * level, where the coarse depth data meets the coastline.
   */
  depth: [number, string][];
  /** POI icon backgrounds, by category (see layers/pois.ts). */
  poi: Record<PoiCategory, string>;
  /** Extra width of every road, as a factor. */
  roadWidth: number;
  /** How strongly the terrain shades, 0 to 1. */
  hillshade: number;
  /** The light's intensity on buildings, 0 to 1. */
  lightIntensity: number;
}

export type PoiCategory =
  | "food"
  | "shopping"
  | "nature"
  | "culture"
  | "transit"
  | "health"
  | "education"
  | "lodging"
  | "civic"
  | "sport"
  | "default";

// Saturated land and water at low zoom, with land cover multiplied over the
// hillshade so shadows keep their color; a calm, near-white city at street
// zoom, with grey highways and pale buildings that rise from their
// footprints. Set in Mona Sans.
export const GOUACHE: Theme = {
  name: "Gouache",
  type: {
    text: "Mona Sans",
    road: "Mona Sans Condensed",
    shield: "Mona Sans Condensed",
  },
  color: {
    land: "#f6f5f2",
    urban: "#f0efeb",
    industrial: "#ebeae6",
    park: "#b6e29c",
    wood: "#b9e0a0",
    grass: "#d6edbf",
    scrub: "#e8ecc6",
    farmland: "#f2f3dd",
    wetland: "#cfe8dc",
    sand: "#fbefcc",
    ice: "#f7fafc",
    rock: "#ebe6dc",
    institution: "#eeebe8",
    cemetery: "#d3e3c6",
    pitch: "#c2deab",
    water: "#8ed0f4",
    waterShallow: "#b8e4fa",
    ocean: "#6cbcef",
    waterway: "#8ed0f4",
    aeroway: "#e6e5e1",
    building: "#e5e3df",
    buildingRoof: "#ebe8e3",
    buildingOutline: "#d6d3ce",
    roadMotorway: "#c3c1bd",
    roadMotorwayCasing: "#a9a6a1",
    roadTrunk: "#d8d6d2",
    roadTrunkCasing: "#bcb9b4",
    roadMajor: "#ffffff",
    roadMinor: "#ffffff",
    roadCasing: "#d9d6d0",
    roadService: "#fdfdfb",
    path: "#bfb9ae",
    rail: "#c1c3c8",
    boundaryCountry: "#9a8799",
    boundaryState: "#bcaeba",
    hillshadeShadow: "#1f3a3c",
    hillshadeHighlight: "#ffeec2",
    hillshadeAccent: "#2c4848",
    labelPlace: "#26262a",
    labelPlaceMinor: "#77746f",
    labelCountry: "#6b5464",
    labelPeak: "#6e5338",
    labelRoad: "#68676b",
    labelWater: "#1f6fa8",
    labelPark: "#3f7140",
    labelHalo: "#fbfaf7",
    shield: "#ffffff",
    shieldText: "#38373b",
    sky: "#c6dcec",
    horizon: "#f3f1ec",
    light: "#ffffff",
  },
  relief: [
    [-100, "#c0e2a0"],
    [0, "#c0e2a0"],
    [250, "#cde6a6"],
    [600, "#dde5b2"],
    [1100, "#ebe2c5"],
    [1700, "#eee4d4"],
    [2400, "#f2ece2"],
    [3200, "#f7f5f0"],
    [4200, "#fcfcfb"],
  ],
  depth: [
    [-11000, "rgba(17, 82, 178, 0.6)"],
    [-6000, "rgba(22, 98, 196, 0.5)"],
    [-3500, "rgba(30, 118, 212, 0.38)"],
    [-1500, "rgba(48, 140, 222, 0.22)"],
    [-400, "rgba(120, 200, 245, 0.2)"],
    [-150, "rgba(170, 225, 250, 0.5)"],
    [-60, "rgba(170, 225, 250, 0)"],
    [0, "rgba(170, 225, 250, 0)"],
  ],
  poi: {
    food: "#e0874a",
    shopping: "#c9688d",
    nature: "#4f9a52",
    culture: "#8a6bc2",
    transit: "#3f7fc6",
    health: "#cf5c55",
    education: "#9c7b5f",
    lodging: "#6a72b9",
    civic: "#7b828c",
    sport: "#3a978a",
    default: "#8c8a86",
  },
  roadWidth: 1,
  hillshade: 0.5,
  lightIntensity: 0.45,
};
