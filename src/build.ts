// Builds dist/: style.json and the sprite, and checks the style. The glyphs
// come from scripts/fonts.py.
//
// GOUACHE_BASE_URL is where dist/ is served, for the sprite's and glyphs'
// URLs.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";

import { lint } from "./lint.ts";
import { buildSprite } from "./sprite.ts";
import { style } from "./style.ts";
import { GOUACHE } from "./theme.ts";

const configured = process.env.GOUACHE_BASE_URL ?? "http://localhost:5173/";
const base = configured.endsWith("/") ? configured : `${configured}/`;
const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");

const json = style(GOUACHE, base);
const layers = Array.isArray(json.layers) ? json.layers : [];
const problems = [
  ...validateStyleMin(JSON.parse(JSON.stringify(json))).map((e) => e.message),
  ...lint(layers),
];

mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, "style.json"), `${JSON.stringify(json, null, 1)}\n`);
buildSprite(
  GOUACHE,
  join(dist, "sprites", "gouache"),
  join(root, ".cache", "sprite"),
);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exitCode = 1;
} else {
  console.log(`dist/style.json: ${layers.length} layers`);
}
