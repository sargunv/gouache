//! The map in a Web Worker of its own: a runtime map (`mln_runtime`) whose
//! render session presents to the page's canvas (an `OffscreenCanvas`), with
//! the browser's WebGPU or, in the `webgl` build of the module, its WebGL2.
//! Its tile workers are in other Web Workers, and the page's input moves it
//! through a gesture recognizer (`mln_gestures`).
//!
//! The runtime and the session run on this Web Worker's one thread, in the
//! slices of `mln_web_host`'s pump: a command or a frame demand runs in a
//! later task, never inside the call that sends it. The page's animation
//! frames step the gestures and demand a frame when the map has something
//! new to draw, and the session renders it in a task of its own.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use mln_gestures::{GestureEvent, GestureRecognizer, Input, Modes, PointerKind};
use mln_map::{
    AnimationOptions, CameraOptions, CameraUpdate, CameraUpdateMode, GesturePhase, MapEvent,
};
use mln_runtime::{
    AttachOptions, DemandMode, Error, EventMask, EventType, FrameDemand, FrameDisposition,
    LogicalExtent, Map, MapOptions, RenderSession, RenderTarget, Runtime, RuntimeEvent,
    RuntimeEventKind, RuntimeOptions, Surface,
};
use mln_util::LatLng;
use mln_util::geo::ScreenCoordinate;
use mln_util::logging::{Event, Log};
use mln_util::size::Size;
use parking_lot::Mutex;
use wasm_bindgen::prelude::*;

use crate::js_error;

/// Hands this instance's fetches the responses its Web Worker fetched ahead
/// (web/map-worker.ts): `take(url)` returns a promise of the response
/// fetched for exactly `url`, once, or undefined
/// (`RuntimeOptions::fetch_preloads`).
#[wasm_bindgen]
pub fn set_preloads(take: js_sys::Function) {
    PRELOADS.with(|preloads| *preloads.borrow_mut() = Some(take));
}

thread_local! {
    /// What `set_preloads` set, for the runtimes made after.
    static PRELOADS: std::cell::RefCell<Option<js_sys::Function>> = const { std::cell::RefCell::new(None) };
    /// The `on_frame` of this Web Worker's map, which its session's frame
    /// wake calls on this thread.
    static ON_FRAME: std::cell::RefCell<Option<js_sys::Function>> = const { std::cell::RefCell::new(None) };
}

/// What the runtime reports of the map, as its events and queries arrive.
#[derive(Default)]
struct Reports {
    /// The map finished loading its style.
    loaded: bool,
    /// The style's attributions and name, as the last query read them.
    attributions: Vec<String>,
    style_name: String,
    /// A query of the style's attributions and name is on its way.
    querying: bool,
}

impl Reports {
    fn handle(&mut self, events: &[RuntimeEvent]) {
        for event in events {
            let RuntimeEventKind::Map(event) = &event.kind else {
                continue;
            };
            match event {
                MapEvent::LoadingFinished => self.loaded = true,
                MapEvent::LoadingFailed(error) => {
                    web_sys::console::error_1(&JsValue::from_str(&format!(
                        "map failed to load: {error:?}"
                    )));
                }
                _ => {}
            }
        }
    }
}

/// A continuous map in an `OffscreenCanvas`, in the Web Worker that runs it
/// (web/map-worker.ts).
#[wasm_bindgen]
pub struct WebMap {
    // Dropped first, before the map and its runtime.
    session: RenderSession,
    map: Map,
    _runtime: Runtime,
    reports: Arc<Mutex<Reports>>,
    /// The session has something new to draw since the last demand.
    redraw: Arc<AtomicBool>,
    /// The map's last command sent before the last demand.
    demanded: u64,
    /// CSS pixels, and device pixels per CSS pixel.
    size: Size,
    pixel_ratio: f64,
    /// The page's pointer, wheel and key input, turned into camera moves.
    gestures: GestureRecognizer<Map>,
    /// The pointers that went down on the map and haven't lifted.
    pointers: Vec<u32>,
    /// Whether a gesture reached a notch since `take_notch`.
    notched: bool,
}

#[wasm_bindgen]
impl WebMap {
    /// Starts a runtime and its map at `width` x `height` CSS pixels, and
    /// attaches a render session that presents to `canvas` (the page's
    /// canvas, transferred to this worker) with the build's backend: the
    /// browser's WebGPU, or WebGL2 in the `webgl` build. The tiles' workers
    /// run in the Web Workers that `mlnWebConfigureTileWorkers` set up.
    /// `on_frame()` runs in the task that rendered a frame, and must call
    /// `drain_frames`.
    ///
    /// Rejects with an error named `NotSupportedError` when the browser's
    /// API can't draw the map.
    pub async fn create(
        canvas: web_sys::OffscreenCanvas,
        width: u32,
        height: u32,
        pixel_ratio: f64,
        on_frame: js_sys::Function,
    ) -> Result<WebMap, JsValue> {
        let options = RuntimeOptions {
            fetch_preloads: PRELOADS.with(|preloads| preloads.borrow().clone()),
            ..RuntimeOptions::default()
        };
        let runtime = Runtime::with_registry(&options, crate::registry()).map_err(js_error)?;
        let reports = Arc::new(Mutex::new(Reports::default()));
        let handler_reports = Arc::clone(&reports);
        sent(runtime.set_event_handler(move |events| handler_reports.lock().handle(events)));

        let size = Size::new(width.max(1), height.max(1));
        let options = MapOptions {
            map: mln_map::MapOptions {
                size,
                pixel_ratio: pixel_ratio as f32,
                ..Default::default()
            },
            event_mask: EventMask::NONE
                .with(EventType::MapLoadingFinished)
                .with(EventType::MapLoadingFailed),
            ..Default::default()
        };
        let (map, created) = runtime.create_map(options).map_err(js_error)?;

        let redraw = Arc::new(AtomicBool::new(true));
        let redraw_wake = Arc::clone(&redraw);
        ON_FRAME.with(|slot| *slot.borrow_mut() = Some(on_frame));
        let options = AttachOptions {
            frame_wake: Some(Arc::new(|| {
                let on_frame = ON_FRAME.with(|slot| slot.borrow().clone());
                if let Some(on_frame) = on_frame {
                    let _ = on_frame.call0(&JsValue::NULL);
                }
            })),
            redraw_wake: Some(Arc::new(move || redraw_wake.store(true, Ordering::SeqCst))),
            ..Default::default()
        };
        let surface = Surface::web_canvas(canvas.into(), None).map_err(js_error)?;
        let (session, attached) = map
            .attach(
                RenderTarget::Surface {
                    size,
                    surface,
                    device: None,
                },
                options,
            )
            .map_err(js_error)?;
        created.await.map_err(js_error)?;
        attached.await.map_err(|error| {
            let error = js_sys::Error::new(&format!("the map can't draw: {error}"));
            error.set_name("NotSupportedError");
            JsValue::from(error)
        })?;

        Ok(WebMap {
            session,
            map: map.clone(),
            _runtime: runtime,
            reports,
            redraw,
            demanded: 0,
            size,
            pixel_ratio,
            gestures: GestureRecognizer::new(map),
            pointers: Vec::new(),
            notched: false,
        })
    }

    /// Loads a style from a URL.
    pub fn set_style_url(&self, url: &str) {
        sent(self.map.set_style_url(url));
    }

    /// Moves the camera.
    pub fn jump_to(&self, latitude: f64, longitude: f64, zoom: f64, bearing: f64, pitch: f64) {
        let update = CameraUpdate {
            mode: CameraUpdateMode::Jump,
            camera: camera_options(latitude, longitude, zoom, bearing, pitch),
            animation: AnimationOptions::default(),
            phase: GesturePhase::None,
        };
        sent(self.map.update_camera(update));
    }

    /// The camera as `[latitude, longitude, zoom, bearing, pitch]`, in
    /// degrees but for the zoom, as of the last command that ran.
    #[must_use]
    pub fn camera(&self) -> Vec<f64> {
        let camera = self
            .map
            .snapshot()
            .map(|snapshot| CameraOptions::from(snapshot.view.camera))
            .unwrap_or_default();
        let center = camera.center.unwrap_or_default();
        vec![
            center.latitude(),
            center.longitude(),
            camera.zoom.unwrap_or_default(),
            camera.bearing.unwrap_or_default(),
            camera.pitch.unwrap_or_default(),
        ]
    }

    /// Eases the bearing and pitch back to zero, as a step of the page's
    /// input.
    pub fn reset_north(&mut self) {
        let update = CameraUpdate {
            mode: CameraUpdateMode::Ease,
            camera: CameraOptions {
                bearing: Some(0.0),
                pitch: Some(0.0),
                ..Default::default()
            },
            animation: AnimationOptions::new(Duration::from_millis(500)),
            phase: GesturePhase::None,
        };
        self.gestures.step_to(&update);
    }

    /// Reads the style's attributions and name again, for `attributions`
    /// and `style_name` once the read completes, unless a read is on its
    /// way.
    pub fn read_style_info(&self) {
        if std::mem::replace(&mut self.reports.lock().querying, true) {
            return;
        }
        let read = self.map.with_core(|map| {
            let style = map.style();
            let attributions = style
                .get_sources()
                .iter()
                .filter_map(|source| source.data().attribution().filter(|a| !a.is_empty()))
                .collect::<Vec<_>>();
            (attributions, style.get_name().to_owned())
        });
        let reports = Arc::clone(&self.reports);
        match read {
            Ok(read) => read.on_complete(move |result| {
                let mut reports = reports.lock();
                reports.querying = false;
                if let Ok((attributions, name)) = result {
                    reports.attributions = attributions;
                    reports.style_name = name;
                }
            }),
            Err(error) => {
                reports.lock().querying = false;
                log_refused(&error);
            }
        }
    }

    /// The attributions of the style's sources that have one, as HTML, as
    /// `read_style_info` last read them. A source that links a TileJSON has
    /// one once the TileJSON loads.
    #[must_use]
    pub fn attributions(&self) -> Vec<String> {
        self.reports.lock().attributions.clone()
    }

    /// The style's `name`, or an empty string, as `read_style_info` last
    /// read it.
    #[must_use]
    pub fn style_name(&self) -> String {
        self.reports.lock().style_name.clone()
    }

    /// Resizes the map and the canvas to `width` x `height` CSS pixels.
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), JsValue> {
        self.size = Size::new(width.max(1), height.max(1));
        self.resize_session()
    }

    /// Draws the map at `pixel_ratio` device pixels per CSS pixel from now
    /// on, as on a display of another density, keeping its tiles, and sizes
    /// the canvas for it.
    pub fn set_pixel_ratio(&mut self, pixel_ratio: f64) -> Result<(), JsValue> {
        self.pixel_ratio = pixel_ratio;
        self.resize_session()
    }

    /// One animation frame at `now` (milliseconds, the clock of the input
    /// methods' `time`): ticks the gesture recognizer, then demands a frame
    /// of the session if the map has something new to draw, which it renders
    /// in a later task.
    pub fn frame(&mut self, now: f64) {
        // The page runs an animation frame always, so it ticks the recognizer
        // on each rather than at its deadlines.
        self.gestures.tick(now);
        self.answer_events();
        // A demand renders the map once the commands sent before it ran.
        let sent_sequence = self.map.sent_sequence();
        if self.redraw.swap(false, Ordering::SeqCst) || sent_sequence != self.demanded {
            self.demanded = sent_sequence;
            sent(
                self.session
                    .demand_frame(FrameDemand::new(DemandMode::IfChanged, 0)),
            );
        }
    }

    /// Takes the session's frame results, which `on_frame` announced. Fails
    /// once the session failed, with why.
    pub fn drain_frames(&mut self) -> Result<(), JsValue> {
        let results = self.session.drain_frame_results().map_err(js_error)?;
        if results
            .iter()
            .any(|result| result.disposition == FrameDisposition::Failed)
        {
            let failure = self
                .session
                .snapshot()
                .ok()
                .and_then(|snapshot| snapshot.failure);
            return Err(js_error(failure.map_or_else(
                || "the render session failed".to_owned(),
                |e| e.to_string(),
            )));
        }
        Ok(())
    }

    /// A pointer went down on the canvas, at `x`, `y` CSS pixels from its
    /// top-left corner: `kind` is the DOM `pointerType` ("mouse", "touch" or
    /// "pen"), `button` the DOM `button` (0 primary, 1 middle, 2 secondary)
    /// and `modifiers` the bits of [`SHIFT`] and [`CTRL`]. `time` is in milliseconds
    /// on the clock `frame` gets. Returns whether the map used it.
    #[expect(
        clippy::too_many_arguments,
        reason = "JavaScript passes the DOM pointer event's fields positionally"
    )]
    pub fn pointer_down(
        &mut self,
        id: u32,
        kind: &str,
        button: i32,
        x: f64,
        y: f64,
        modifiers: u32,
        time: f64,
    ) -> bool {
        let kind = match kind {
            "touch" => PointerKind::Touch,
            "pen" => PointerKind::Pen,
            _ => PointerKind::Mouse,
        };
        // The secondary button rotates and tilts; the middle one means
        // nothing to the map.
        let modes = match button {
            0 => Modes::default(),
            2 => Modes {
                rotate: true,
                ..Modes::default()
            },
            _ => return false,
        };
        self.gesture(Input::Modes(key_modes(modifiers)), time);
        self.pointers.push(id);
        self.gesture(
            Input::PointerDown {
                id,
                kind,
                position: ScreenCoordinate::new(x, y),
                modes,
            },
            time,
        )
    }

    /// A pointer moved (see `pointer_down`).
    pub fn pointer_move(&mut self, id: u32, x: f64, y: f64, time: f64) -> bool {
        self.gesture(
            Input::PointerMove {
                id,
                position: ScreenCoordinate::new(x, y),
            },
            time,
        )
    }

    /// A pointer went up (see `pointer_down`).
    pub fn pointer_up(&mut self, id: u32, x: f64, y: f64, time: f64) -> bool {
        self.pointers.retain(|&p| p != id);
        self.gesture(
            Input::PointerUp {
                id,
                position: ScreenCoordinate::new(x, y),
            },
            time,
        )
    }

    /// The browser took a pointer away (`pointercancel`).
    pub fn pointer_cancel(&mut self, id: u32, time: f64) -> bool {
        self.pointers.retain(|&p| p != id);
        self.gesture(Input::PointerCancel { id }, time)
    }

    /// A DOM `wheel` event, as the page classifies it (web/wheel.ts): at
    /// (`x`, `y`), `amount` detents of a mouse wheel when `kind` is
    /// [`WHEEL_NOTCHES`], a third of a level each and eased, or `amount`
    /// pixels of continuous scrolling when it is [`WHEEL_PIXELS`], 1/300
    /// level each; positive scrolls down, zooming out. With Ctrl, which
    /// browsers add to a trackpad pinch, pixels zoom 1/100 level each.
    pub fn wheel(
        &mut self,
        x: f64,
        y: f64,
        kind: u32,
        amount: f64,
        modifiers: u32,
        time: f64,
    ) -> bool {
        debug_assert!(
            kind == WHEEL_NOTCHES || kind == WHEEL_PIXELS,
            "wheel kind {kind}"
        );
        let (discrete, zoom) = match kind {
            WHEEL_NOTCHES => (true, -amount / 3.0),
            _ if modifiers & CTRL != 0 => (false, -amount / 100.0),
            _ => (false, -amount / 300.0),
        };
        let position = ScreenCoordinate::new(x, y);
        let pan = ScreenCoordinate::default();
        self.gesture(
            Input::Delta {
                position,
                discrete,
                pan,
                zoom,
                bearing: 0.0,
                pitch: 0.0,
            },
            time,
        )
    }

    /// A DOM `keydown`, by its `key`, each repeating while held: the arrows
    /// pan 100 px (Shift: turn 15° and tilt 10°), `+`/`=` and `-`/`_` zoom a
    /// level (Shift: two), and Escape drops a drag; the map ignores the
    /// others and returns false.
    pub fn key(&mut self, key: &str, modifiers: u32, time: f64) -> bool {
        self.gesture(Input::Modes(key_modes(modifiers)), time);
        let shift = modifiers & SHIFT != 0;
        let levels = if shift { 2.0 } else { 1.0 };
        let (pan, zoom, bearing, pitch) = match (key, shift) {
            ("Escape", _) => return self.cancel_pointers(time),
            ("+" | "=", _) => ((0.0, 0.0), levels, 0.0, 0.0),
            ("-" | "_", _) => ((0.0, 0.0), -levels, 0.0, 0.0),
            ("ArrowLeft", true) => ((0.0, 0.0), 0.0, -15.0, 0.0),
            ("ArrowRight", true) => ((0.0, 0.0), 0.0, 15.0, 0.0),
            ("ArrowUp", true) => ((0.0, 0.0), 0.0, 0.0, 10.0),
            ("ArrowDown", true) => ((0.0, 0.0), 0.0, 0.0, -10.0),
            ("ArrowLeft", false) => ((100.0, 0.0), 0.0, 0.0, 0.0),
            ("ArrowRight", false) => ((-100.0, 0.0), 0.0, 0.0, 0.0),
            ("ArrowUp", false) => ((0.0, 100.0), 0.0, 0.0, 0.0),
            ("ArrowDown", false) => ((0.0, -100.0), 0.0, 0.0, 0.0),
            _ => return false,
        };
        let position = ScreenCoordinate::new(
            f64::from(self.size.width) / 2.0,
            f64::from(self.size.height) / 2.0,
        );
        let pan = ScreenCoordinate::new(pan.0, pan.1);
        self.gesture(
            Input::Delta {
                position,
                discrete: true,
                pan,
                zoom,
                bearing,
                pitch,
            },
            time,
        )
    }

    /// A modifier key went down or up: `modifiers` are the bits held now.
    pub fn modifiers(&mut self, modifiers: u32, time: f64) -> bool {
        self.gesture(Input::Modes(key_modes(modifiers)), time)
    }

    /// Whether a gesture reached a notch since the last call, for the page
    /// to play a haptic.
    pub fn take_notch(&mut self) -> bool {
        std::mem::take(&mut self.notched)
    }

    /// The canvas lost focus: its pointers and keys end here.
    pub fn blur(&mut self, time: f64) -> bool {
        self.gesture(Input::Modes(Modes::default()), time);
        self.cancel_pointers(time)
    }

    /// The box a box-zoom drag zooms to while it is drawn, as `[x0, y0, x1,
    /// y1]` in CSS pixels, for the page to show; otherwise undefined.
    #[must_use]
    pub fn box_zoom(&self) -> Option<Vec<f64>> {
        self.gestures
            .box_zoom()
            .map(|[a, b]| vec![a.x, a.y, b.x, b.y])
    }

    /// Whether, after every command sent to the map, the style loaded and
    /// every tile and resource the map needs is loaded and drawn.
    #[must_use]
    pub fn is_fully_loaded(&self) -> bool {
        self.reports.lock().loaded
            && self.map.applied_sequence() >= self.map.sent_sequence()
            && self
                .map
                .snapshot()
                .is_ok_and(|snapshot| snapshot.fully_loaded)
    }
}

/// `WebMap::wheel`'s `kind`, as web/protocol.ts's `WHEEL_PIXELS` and
/// `WHEEL_NOTCHES` send it.
const WHEEL_PIXELS: u32 = 0;
const WHEEL_NOTCHES: u32 = 1;

/// The input methods' `modifiers` bits: Shift 1, Ctrl 2, Alt 4, Meta 8.
const SHIFT: u32 = 1;
const CTRL: u32 = 2;

/// What held keys do: Ctrl rotates and tilts on a drag, and Shift zooms to a
/// box on a drag and out on a double click.
fn key_modes(modifiers: u32) -> Modes {
    let shift = modifiers & SHIFT != 0;
    Modes {
        rotate: modifiers & CTRL != 0,
        box_zoom: shift,
        zoom_out: shift,
    }
}

fn camera_options(
    latitude: f64,
    longitude: f64,
    zoom: f64,
    bearing: f64,
    pitch: f64,
) -> CameraOptions {
    CameraOptions {
        center: LatLng::new(latitude, longitude).ok(),
        zoom: Some(zoom),
        bearing: Some(bearing),
        pitch: Some(pitch),
        ..Default::default()
    }
}

/// A command's completion, or `None` when the runtime refused it, which it
/// logs: the page doesn't wait for the map's commands.
fn sent<T>(result: Result<T, Error>) -> Option<T> {
    result.map_err(|error| log_refused(&error)).ok()
}

fn log_refused(error: &Error) {
    Log::error(
        Event::General,
        format!("the map refused a command: {error}"),
    );
}

impl WebMap {
    /// Feeds one input to the gesture recognizer, and answers its events.
    /// Returns whether the map used the input.
    fn gesture(&mut self, input: Input, time: f64) -> bool {
        let used = self.gestures.handle(input, time);
        self.answer_events();
        used
    }

    /// Answers the recognizer's events: a notch reaches the page. The page
    /// has no use for taps.
    fn answer_events(&mut self) {
        for event in self.gestures.take_events() {
            if let GestureEvent::Notch { .. } = event {
                self.notched = true;
            }
        }
    }

    /// Cancels every pointer down on the map; returns whether there was one.
    fn cancel_pointers(&mut self, time: f64) -> bool {
        let pointers = std::mem::take(&mut self.pointers);
        for &id in &pointers {
            self.gesture(Input::PointerCancel { id }, time);
        }
        !pointers.is_empty()
    }

    /// Sizes the session, and the map and canvas with it, to the map's size
    /// and pixel ratio.
    fn resize_session(&self) -> Result<(), JsValue> {
        let extent = LogicalExtent {
            size: self.size,
            scale_factor: self.pixel_ratio,
        };
        self.session.resize(extent).map(drop).map_err(js_error)
    }
}
