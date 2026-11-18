import type { PoiCategory } from "./theme.ts";

// What each OpenMapTiles POI class looks like: its category, which sets the
// icon's color, and the Maki or Temaki glyph inside the icon. OpenMapTiles
// gives a class to some groups of tags and the tag's own value otherwise, so
// the table has both.

interface PoiKind {
  category: PoiCategory;
  /** "maki:<name>" or "temaki:<name>". */
  glyph: string;
}

export const POIS: Record<string, PoiKind> = {
  restaurant: { category: "food", glyph: "maki:restaurant" },
  fast_food: { category: "food", glyph: "maki:fast-food" },
  cafe: { category: "food", glyph: "maki:cafe" },
  bar: { category: "food", glyph: "maki:bar" },
  beer: { category: "food", glyph: "maki:beer" },
  ice_cream: { category: "food", glyph: "maki:ice-cream" },
  bakery: { category: "food", glyph: "maki:bakery" },
  pub: { category: "food", glyph: "maki:beer" },

  shop: { category: "shopping", glyph: "maki:shop" },
  grocery: { category: "shopping", glyph: "maki:grocery" },
  supermarket: { category: "shopping", glyph: "maki:grocery" },
  clothing_store: { category: "shopping", glyph: "maki:clothing-store" },
  alcohol_shop: { category: "shopping", glyph: "maki:alcohol-shop" },
  books: { category: "shopping", glyph: "maki:library" },
  florist: { category: "shopping", glyph: "maki:florist" },
  jewelry: { category: "shopping", glyph: "maki:jewelry-store" },
  shoes: { category: "shopping", glyph: "maki:shoe" },
  mobile_phone: { category: "shopping", glyph: "maki:mobile-phone" },
  gift: { category: "shopping", glyph: "maki:gift" },
  hardware: { category: "shopping", glyph: "maki:hardware" },
  furniture: { category: "shopping", glyph: "maki:furniture" },
  hairdresser: { category: "shopping", glyph: "maki:hairdresser" },
  laundry: { category: "shopping", glyph: "maki:laundry" },

  park: { category: "nature", glyph: "maki:park" },
  garden: { category: "nature", glyph: "maki:garden" },
  playground: { category: "nature", glyph: "maki:playground" },
  dog_park: { category: "nature", glyph: "maki:dog-park" },
  campsite: { category: "nature", glyph: "maki:campsite" },
  zoo: { category: "nature", glyph: "maki:zoo" },
  cemetery: { category: "nature", glyph: "maki:cemetery" },

  museum: { category: "culture", glyph: "maki:museum" },
  art_gallery: { category: "culture", glyph: "maki:art-gallery" },
  theatre: { category: "culture", glyph: "maki:theatre" },
  cinema: { category: "culture", glyph: "maki:cinema" },
  music: { category: "culture", glyph: "maki:music" },
  castle: { category: "culture", glyph: "maki:castle" },
  monument: { category: "culture", glyph: "maki:monument" },
  attraction: { category: "culture", glyph: "maki:attraction" },
  place_of_worship: { category: "culture", glyph: "maki:place-of-worship" },

  railway: { category: "transit", glyph: "maki:rail" },
  bus: { category: "transit", glyph: "maki:bus" },
  ferry_terminal: { category: "transit", glyph: "maki:ferry" },
  harbor: { category: "transit", glyph: "maki:harbor" },
  aerialway: { category: "transit", glyph: "maki:aerialway" },
  bicycle_rental: { category: "transit", glyph: "maki:bicycle-share" },
  parking: { category: "transit", glyph: "maki:parking" },
  fuel: { category: "transit", glyph: "maki:fuel" },
  car: { category: "transit", glyph: "maki:car" },

  hospital: { category: "health", glyph: "maki:hospital" },
  pharmacy: { category: "health", glyph: "maki:pharmacy" },
  doctors: { category: "health", glyph: "maki:doctor" },
  dentist: { category: "health", glyph: "maki:dentist" },
  veterinary: { category: "health", glyph: "maki:veterinary" },

  school: { category: "education", glyph: "maki:school" },
  college: { category: "education", glyph: "maki:college" },
  library: { category: "education", glyph: "maki:library" },

  lodging: { category: "lodging", glyph: "maki:lodging" },

  town_hall: { category: "civic", glyph: "maki:town-hall" },
  post: { category: "civic", glyph: "maki:post" },
  police: { category: "civic", glyph: "maki:police" },
  fire_station: { category: "civic", glyph: "maki:fire-station" },
  bank: { category: "civic", glyph: "maki:bank" },
  atm: { category: "civic", glyph: "maki:bank" },
  office: { category: "civic", glyph: "maki:suitcase" },
  information: { category: "civic", glyph: "maki:information" },
  toilets: { category: "civic", glyph: "maki:toilet" },

  stadium: { category: "sport", glyph: "maki:stadium" },
  golf: { category: "sport", glyph: "maki:golf" },
  swimming: { category: "sport", glyph: "maki:swimming" },
  sports: { category: "sport", glyph: "maki:pitch" },
  fitness: { category: "sport", glyph: "maki:fitness-centre" },
};

/** The sprite image id of a POI kind. */
export function iconId(kind: PoiKind): string {
  return `poi-${kind.glyph.replace(":", "-")}-${kind.category}`;
}
