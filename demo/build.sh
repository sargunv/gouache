#!/usr/bin/env bash
# Builds the demo page into site/, beside the style that `mise run build`
# wrote into dist/. Run it from the repository root.
#
#   demo/build.sh            a quicker build, for development
#   demo/build.sh --release  the size-optimized build to publish
#
# The map's module is built twice: with WebGPU, and with the `webgl` feature
# for browsers without WebGPU, which alone download it. Vite then builds the
# page around them.
set -euo pipefail

release=false
case "${1:-}" in
  "") ;;
  --release) release=true ;;
  *)
    echo "usage: demo/build.sh [--release]" >&2
    exit 2
    ;;
esac

if [[ ! -f dist/style.json ]]; then
  echo "error: dist/style.json is missing: run \`mise run build\` first" >&2
  exit 1
fi
if $release; then
  command -v wasm-opt > /dev/null ||
    { echo "error: wasm-opt not found: run \`mise install\`" >&2; exit 1; }
  profile=(--profile release)
  target="${CARGO_TARGET_DIR:-target}/wasm32-unknown-unknown/release"
else
  profile=(--profile dev-opt)
  target="${CARGO_TARGET_DIR:-target}/wasm32-unknown-unknown/dev-opt"
fi

pkg=demo/web/pkg

# wasm-bindgen's output for the module cargo just built, into a directory. A
# release module is shrunk with -Oz, which inlines a function with one caller
# only when it is small: larger inlines grow the compressed module and slow
# its start.
bind() {
  rm -rf "$1"
  wasm-bindgen --target web --out-dir "$1" "$target/gouache_demo.wasm"
  if $release; then
    wasm-opt -Oz --converge --one-caller-inline-max-function-size=20 \
      --zero-filled-memory --low-memory-unused --strip-producers \
      --strip-target-features --strip-debug \
      "$1/gouache_demo_bg.wasm" -o "$1/gouache_demo_bg.wasm"
  fi
}

cargo build "${profile[@]}" --target wasm32-unknown-unknown -p gouache-demo
bind "$pkg"
cargo build "${profile[@]}" --target wasm32-unknown-unknown -p gouache-demo \
  --no-default-features --features webgl
bind "$pkg/webgl"

pnpm -C demo install --frozen-lockfile
pnpm -C demo build
