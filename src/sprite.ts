import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { iconId, POIS } from "./pois.ts";
import type { Theme } from "./theme.ts";

// The sprite: POI icons (a white glyph on a circle of the category's color),
// the road shield, and small marks. Built from Maki and Temaki (CC0) with
// spreet, at 1x and 2x.

const require = createRequire(import.meta.url);

function glyphSvg(glyph: string): string {
  const [set, name] = glyph.split(":");
  const root =
    set === "maki"
      ? join(dirname(require.resolve("@mapbox/maki/package.json")), "icons")
      : join(
          dirname(require.resolve("@rapideditor/temaki/package.json")),
          "icons",
        );
  return readFileSync(join(root, `${name}.svg`), "utf8");
}

/** The inside of an SVG, and its viewBox size. */
function inner(svg: string): { body: string; size: number } {
  const viewBox = /viewBox="([\d.\s-]+)"/
    .exec(svg)?.[1]
    ?.split(/\s+/)
    .map(Number);
  const size = viewBox?.[2] ?? 15;
  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "");
  return { body, size };
}

function poiIcon(glyph: string, color: string): string {
  const { body, size } = inner(glyphSvg(glyph));
  const d = 21;
  const g = 12.5;
  const scale = g / size;
  const offset = (d - g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">
<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 0.5}" fill="${color}" stroke="#ffffff" stroke-width="1"/>
<g transform="translate(${offset} ${offset}) scale(${scale})" fill="#ffffff">${body}</g>
</svg>`;
}

function dot(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 9 9">
<circle cx="4.5" cy="4.5" r="3.6" fill="${color}" stroke="#ffffff" stroke-width="1.2"/>
</svg>`;
}

function peak(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="9" viewBox="0 0 10 9">
<path d="M5 1 L9 8 L1 8 Z" fill="${color}" stroke="#ffffff" stroke-width="1" stroke-linejoin="round"/>
</svg>`;
}

/** The shield: a rounded rectangle that stretches around a road's ref. */
const SHIELD = { width: 20, height: 18, radius: 4 };
function shield(fill: string, stroke: string): string {
  const { width, height, radius } = SHIELD;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
</svg>`;
}

export function buildSprite(theme: Theme, out: string, work: string): void {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const write = (id: string, svg: string) =>
    writeFileSync(join(work, `${id}.svg`), svg);

  for (const kind of Object.values(POIS)) {
    write(iconId(kind), poiIcon(kind.glyph, theme.poi[kind.category]));
  }
  write("poi-maki-airport-transit", poiIcon("maki:airport", theme.poi.transit));
  write("poi-dot", dot(theme.poi.default));
  write("peak", peak(theme.color.labelPeak));
  write("shield", shield(theme.color.shield, theme.color.roadCasing));

  mkdirSync(dirname(out), { recursive: true });
  for (const [ratio, suffix] of [
    [1, ""],
    [2, "@2x"],
  ] as const) {
    const target = `${out}${suffix}`;
    execFileSync(
      "spreet",
      ["--ratio", String(ratio), "--unique", work, target],
      {
        stdio: "inherit",
      },
    );
    // spreet has no way to mark a stretchable image, so the shield's
    // stretch zones and content box go into the index here.
    const index = JSON.parse(readFileSync(`${target}.json`, "utf8"));
    const entry = index.shield;
    if (entry) {
      const r = SHIELD.radius * ratio;
      const w = SHIELD.width * ratio;
      const h = SHIELD.height * ratio;
      entry.stretchX = [[r, w - r]];
      entry.stretchY = [[r, h - r]];
      entry.content = [r, r * 0.5, w - r, h - r * 0.5];
    }
    writeFileSync(`${target}.json`, JSON.stringify(index));
  }
}
