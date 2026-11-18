import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

// The page in web/, built into the repo's site/ beside the style, which
// `mise run build` writes into dist/ and Vite serves and copies as is. Every
// asset's name is hashed by its content, so that a browser never mixes files
// of two builds, and URLs are relative, so that the site works at any path.
// web/pkg is wasm-bindgen's output, which build.sh writes first.
//
// `orbis` is Orbis's browser library in the checkout that orbis.sh builds,
// bundled from its sources with the wasm beside them.
export default defineConfig({
  root: "web",
  resolve: {
    alias: {
      orbis: fileURLToPath(
        new URL("../.cache/orbis/web/src/index.ts", import.meta.url),
      ),
    },
  },
  base: "./",
  publicDir: "../../dist",
  // No index.html in place of a missing file, such as a glyph range the
  // style has none of.
  appType: "mpa",
  build: {
    outDir: "../../site",
    emptyOutDir: true,
    target: "es2023",
  },
  worker: {
    format: "es",
  },
});
