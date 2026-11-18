# Gouache

A map style for [OpenFreeMap](https://openfreemap.org)'s vector tiles: saturated
land and water with terrain shading and ocean depth at low zoom, and a calm,
near-white city with 3D buildings up close.

Demo: https://code.sargunv.dev/gouache/

Style: `https://code.sargunv.dev/gouache/style.json`

Gouache is made for [mln-rs](https://github.com/louwers/mln-rs). It draws its
land cover with `fill-layer-blend`, which MapLibre GL JS and MapLibre Native
don't support yet; there the land cover is drawn without its blend, and the
terrain shading under it is hidden.

## Building

```sh
mise install
mise run build           # the style, sprite and glyphs, into dist/
demo/build.sh --release  # the demo page, into site/
pnpm -C demo dev         # or serve the demo from its sources
```

## Data and assets

- Map data: [OpenMapTiles](https://openmaptiles.org) by OpenFreeMap, from
  [OpenStreetMap](https://www.openstreetmap.org/copyright).
- Terrain: [Mapterhorn](https://mapterhorn.com/attribution). Ocean depth:
  [Mapzen terrain tiles](https://github.com/tilezen/joerd/blob/master/docs/attribution.md).
- Fonts: Mona Sans and Noto Sans (SIL Open Font License).
- Icons: [Maki](https://github.com/mapbox/maki) and
  [Temaki](https://github.com/rapideditor/temaki) (CC0).

## License

BSD 3-Clause (LICENSE). The data, fonts and icons above keep their own licenses.
