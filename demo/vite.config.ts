import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
// The style's content hash: the page asks for `style.json?v=<hash>`, so a
// new build's page never gets an older style.json from a cache.
const styleVersion = createHash("sha256")
  .update(readFileSync(new URL("../dist/style.json", import.meta.url)))
  .digest("hex")
  .slice(0, 12);

export default defineConfig({
  root: "web",
  define: { __STYLE_VERSION__: JSON.stringify(styleVersion) },
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
