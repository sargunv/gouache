//! The demo page's map, built for wasm32-unknown-unknown (no atomics) and
//! driven from JavaScript through wasm-bindgen. The page loads one wasm
//! module, and Web Workers instantiate it, each instance with its own memory:
//!
//! - In the map's Web Worker, `WebMap` (map.rs): a runtime (`mln_runtime`)
//!   and its map, whose render session presents to the page's canvas, an
//!   `OffscreenCanvas`, with the browser's WebGPU, or its WebGL2 in the
//!   `webgl` build.
//! - In each tile worker's Web Worker, `serve_tile_worker`: the tiles' jobs
//!   (layouts, and raster and raster-dem image decodes), which the map's
//!   render session sends as bytes over a `MessageChannel`. Both sides make
//!   their registry with `registry`.
//!
//! The page's thread runs no wasm: it only starts the Web Workers and
//! forwards input to the map's. An instance has no threads, so its work runs
//! in the slices of `mln_web_host::pump` when its Web Worker's event loop
//! runs them.

#![cfg(target_arch = "wasm32")]

mod map;

use std::sync::Arc;

pub use map::{WebMap, set_preloads};
use mln_runtime::registry::{Registry, RegistryBuilder, register_builtins};
use mln_util::logging::{Event, EventSeverity, Log, Observer};
use wasm_bindgen::prelude::*;

/// Runs when an instance starts, in each Web Worker, before any map exists.
#[wasm_bindgen(start)]
fn start() {
    // The Web Worker's script reads a panic's message from `mlnPanic`.
    mln_web_host::set_panic_hook();
    Log::set_observer(Box::new(ConsoleLog));
}

/// The registrations of the map's runtime and of the tile workers, which
/// must agree.
fn registry() -> Arc<Registry> {
    let mut builder = RegistryBuilder::new();
    register_builtins(&mut builder).expect("the built-ins register into no registrations");
    builder.build()
}

/// Runs tile workers for the map side at the other end of `port`, until it
/// disconnects. web/tile-worker.ts calls it for each port that the map's Web
/// Worker sends it.
#[wasm_bindgen(js_name = mlnWebServeTileWorker)]
pub fn serve_tile_worker(port: &web_sys::MessagePort) {
    mln_web_host::tile_worker::serve(port, registry());
}

/// The runtime's log records go to the console.
struct ConsoleLog;

impl Observer for ConsoleLog {
    fn on_record(&self, severity: EventSeverity, event: Event, _code: i64, msg: &str) -> bool {
        let line = JsValue::from_str(&format!("[{}] {msg}", event.as_str()));
        match severity {
            EventSeverity::Error => web_sys::console::error_1(&line),
            EventSeverity::Warning => web_sys::console::warn_1(&line),
            _ => web_sys::console::log_1(&line),
        }
        true
    }
}

fn js_error(message: impl std::fmt::Display) -> JsValue {
    js_sys::Error::new(&message.to_string()).into()
}
