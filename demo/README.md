# Demo

The page that shows Gouache's styles, drawn with
[mln-rs](https://github.com/louwers/mln-rs) in Web Workers through WebAssembly,
with WebGPU or WebGL2. The button at the bottom left switches the map to
[MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) or
[Orbis](https://github.com/sargunv/orbis), and back, keeping the style and the
camera.

Build it into `site/`, beside the style, after `mise run build`:

```sh
demo/build.sh            # quicker, for development
demo/build.sh --release  # size-optimized, to publish
```

`build.sh` runs `demo/orbis.sh`, which fetches the Orbis commit it pins into
`.cache/orbis` and builds Orbis's wasm there with `cargo xtask web`, on the Rust
toolchain Orbis's `rust-toolchain.toml` pins. The page bundles Orbis's browser
library from that checkout.

Once it has built the wasm modules, `pnpm -C demo dev` serves the page from its
sources, with `dist/`, at http://localhost:5173/.

URL parameters:

- `engine=mlnrs|gljs|orbis`: what draws the map; mln-rs by default.
- `style=<key or URL>`: a style from `web/styles.ts`, or any style's URL.
- `lat`, `lon`, `zoom`, `bearing`, `pitch`: the starting camera, unless the hash
  has one (`#zoom/lat/lon[/bearing/pitch]`).
