# Demo

The page that shows Gouache's styles, drawn with
[mln-rs](https://github.com/louwers/mln-rs) in Web Workers through WebAssembly,
with WebGPU or WebGL2.

Build it into `site/`, beside the style, after `mise run build`:

```sh
demo/build.sh            # quicker, for development
demo/build.sh --release  # size-optimized, to publish
```

Once it has built the wasm modules, `pnpm -C demo dev` serves the page from its
sources, with `dist/`, at http://localhost:5173/.

URL parameters:

- `style=<key or URL>`: a style from `web/styles.ts`, or any style's URL.
- `lat`, `lon`, `zoom`, `bearing`, `pitch`: the starting camera, unless the hash
  has one (`#zoom/lat/lon[/bearing/pitch]`).
