# Gouache

A MapLibre style for OpenFreeMap's OpenMapTiles vector tiles, with its own
fonts, sprite, terrain shading and bathymetry, and a demo page that runs it on
mln-rs in the browser.

## Project map

- `src/`: the style generator (TypeScript, run by Node directly).
  - `theme.ts`: the design tokens. `layers/`: the layers, by subject.
  - `expr.ts`: expression helpers. `lint.ts`: the no-pop check.
  - `sprite.ts`, `pois.ts`: the sprite, from Maki and Temaki icons.
- `fonts/fonts.json`, `scripts/fonts.py`: the fonts and their glyph build.
- `demo/`: the demo page (demo/README.md).
- `dist/`: the built style, sprite and glyphs. `site/`: the built demo.

## Commands

- `mise run build`: build `dist/` (glyphs only when the fonts change).
  `GOUACHE_BASE_URL` sets where the sprite and glyphs are served from.
- `demo/build.sh [--release]`, then `pnpm -C demo dev`: the demo, with the style
  beside it.
- `mise run check`, `mise run fix`: formatters and linters.

## Invariants

- Nothing pops in or out: a layer is invisible at its minzoom and maxzoom, and a
  feature class fades or grows in from the zoom where OpenMapTiles first has it.
  `lint.ts` checks the layer half.
- Land cover is one layer with `fill-layer-blend: multiply` over the hillshade.
  mln-rs renders layer blends; GL JS and MapLibre Native draw it normally. Each
  blended layer draws offscreen, so keep them few.
