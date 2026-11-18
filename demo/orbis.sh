#!/usr/bin/env bash
# Builds Orbis's browser library at the commit below into .cache/orbis, for
# the demo's `engine=orbis`: its sources in web/src, which Vite bundles, and
# its wasm in web/pkg. Run it from the repository root.
set -euo pipefail

repo=https://github.com/sargunv/orbis
rev=699c33cae3bd53c6b1a69aa40e1cbb6ed4d299d4
dir=.cache/orbis

# A checkout of another commit moves to this one, and keeps its target/.
if [[ "$(git -C "$dir" rev-parse HEAD 2> /dev/null)" != "$rev" ]]; then
  mkdir -p "$dir"
  git -C "$dir" init --quiet
  git -C "$dir" fetch --quiet --depth 1 "$repo" "$rev"
  git -C "$dir" checkout --quiet --force FETCH_HEAD
fi

# web/pkg/.rev names the commit web/pkg was built from, so the build, which
# shrinks and splits the modules every time, runs once per commit. It runs
# on the toolchain Orbis's rust-toolchain.toml pins, with the rust-src its
# -Zbuild-std needs, rather than the one this repository's mise selects
# through RUSTUP_TOOLCHAIN, and xtask reads what cargo built from Orbis's own
# target/.
cd "$dir"
if [[ "$(cat web/pkg/.rev 2> /dev/null)" != "$rev" ]]; then
  env -u RUSTUP_TOOLCHAIN -u CARGO_TARGET_DIR -u CARGO_BUILD_TARGET_DIR \
    cargo xtask web
  echo "$rev" > web/pkg/.rev
fi
