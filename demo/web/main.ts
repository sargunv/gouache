// The page: a map, drawn by one of the engines of engine.ts at a time, and
// the controls over it, which work the same with each. mln-rs (mlnrs.ts)
// starts with the page; GL JS (gljs.ts) and Orbis (orbis.ts) are imported
// only when picked.
//
// URL parameters:
//   engine=<key>           the engine: mlnrs (default), gljs or orbis
//   style=<key|url>        a style of styles.ts, or any style's URL
//                          (default: the first of styles.ts)
//   lat, lon, zoom, bearing, pitch
//                          the camera, unless the hash has one
//
// The hash holds the camera, #zoom/lat/lon[/bearing/pitch], and follows it,
// so that a link opens the same view. Picking a style keeps the camera and
// puts the style's key in `?style=`. The engine button loads the page again
// with the next engine, keeping both.
//
// The zoom buttons zoom by one level; the compass eases the bearing and
// pitch back to zero. When the map stops, the page shows why.

import {
  engineFor,
  nextEngine,
  type EngineEvents,
  type MapEngine,
  type StartOptions,
} from "./engine.ts";
import { startMlnRs } from "./mlnrs.ts";
import { type Camera } from "./protocol.ts";
import { STYLES, type Style, styleFor } from "./styles.ts";

/** The element with `id`, which must be a `type`. */
function element<T extends Element>(
  id: string,
  type: abstract new (...args: never[]) => T,
): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is not a ${type.name}`);
  return found;
}

const params = new URLSearchParams(location.search);
const number = (name: string, fallback: number) =>
  params.has(name) ? Number(params.get(name)) : fallback;
const status = element("status", HTMLElement);
const banner = element("error", HTMLElement);
const mapBox = element("map-box", HTMLElement);

const engine = engineFor(params.get("engine"));
const camera: Camera = cameraFromHash(location.hash) ?? [
  number("lat", 37.78),
  number("lon", -122.33),
  number("zoom", 10),
  number("bearing", 0),
  number("pitch", 0),
];
let current = styleFor(params.get("style"));

let stopped = false;
function stop(message: string) {
  stopped = true;
  console.error(`the map stopped: ${message}`);
  banner.textContent = `The map stopped: ${message}`;
  banner.hidden = false;
  status.textContent = "stopped";
  showStyle();
}

const events: EngineEvents = {
  camera: (camera) => showCamera(camera),
  loaded: () => {
    loading = false;
    showStyle();
  },
  attribution: (entries) => showAttribution(entries),
  styleName: (name) => {
    styleName = name;
    showStyle();
  },
  status: (text) => {
    status.textContent = text;
  },
  stop,
};

// The camera in the hash, #zoom/lat/lon[/bearing/pitch], or null.
function cameraFromHash(hash: string): Camera | null {
  const parts = hash.slice(1).split("/").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  const [zoom, lat, lon, bearing = 0, pitch = 0, ...rest] = parts;
  if (
    zoom === undefined ||
    lat === undefined ||
    lon === undefined ||
    rest.length > 0
  )
    return null;
  return [lat, lon, zoom, bearing, pitch];
}

function hashFromCamera([lat, lon, zoom, bearing, pitch]: Camera): string {
  // Enough digits for a pixel at this zoom.
  const digits = Math.max(
    0,
    Math.ceil(Math.log10((2 ** zoom * 512) / 360 / 0.5)),
  );
  const round = (value: number, places: number) =>
    String(Number(value.toFixed(places)));
  let hash = `#${round(zoom, 2)}/${round(lat, digits)}/${round(lon, digits)}`;
  if (Math.abs(bearing) >= 0.05 || Math.abs(pitch) >= 0.5)
    hash += `/${round(bearing, 1)}/${round(pitch, 0)}`;
  return hash;
}

// The hash follows the camera, written at most every 300 ms (browsers limit
// how often a page may replace its URL).
let writtenHash = location.hash;
let hashTimer: ReturnType<typeof setTimeout> | null = null;
let latestCamera = camera;
const needle = element("needle", SVGElement);
function showCamera(next: Camera) {
  latestCamera = next;
  const [, , , bearing, pitch] = next;
  needle.style.transform = `rotateX(${pitch}deg) rotateZ(${-bearing}deg)`;
  hashTimer ??= setTimeout(() => {
    hashTimer = null;
    writtenHash = hashFromCamera(latestCamera);
    history.replaceState(history.state, "", writtenHash);
  }, 300);
}
window.addEventListener("hashchange", () => {
  if (location.hash === writtenHash) return;
  const next = cameraFromHash(location.hash);
  if (next) withMap((map) => map.jumpTo(next));
});

// Zoom and the compass.
element("zoom-in", HTMLButtonElement).addEventListener("click", () =>
  withMap((map) => map.zoomIn()),
);
element("zoom-out", HTMLButtonElement).addEventListener("click", () =>
  withMap((map) => map.zoomOut()),
);
element("compass", HTMLButtonElement).addEventListener("click", () =>
  withMap((map) => map.resetNorth()),
);

// The engine button: the engine's name, and a click loads the page again
// with the next one, at the same style and camera.
const engineButton = element("engine", HTMLButtonElement);
const after = nextEngine(engine);
engineButton.textContent = engine.name;
engineButton.title = `Switch to ${after.name}`;
engineButton.setAttribute(
  "aria-label",
  `Map engine: ${engine.name}. Switch to ${after.name}`,
);
engineButton.addEventListener("click", () => {
  const url = new URL(location.href);
  if (after === engineFor(null)) url.searchParams.delete("engine");
  else url.searchParams.set("engine", after.key);
  url.hash = hashFromCamera(latestCamera);
  location.assign(url);
});
element("engine-about", HTMLElement).textContent = engine.about;

// The style button and its list.
const styleList = element("style-list", HTMLElement);
let loading = true;
let styleName = "";
function showStyle() {
  element("style-name", HTMLElement).textContent =
    current.key === null ? styleName || current.name : current.name;
  element("style-detail", HTMLElement).textContent = stopped
    ? "Stopped"
    : loading
      ? "Loading…"
      : (current.detail ?? "");
  document.documentElement.dataset.theme = current.dark ? "dark" : "light";
  for (const option of styleList.querySelectorAll<HTMLElement>(
    ".style-option",
  )) {
    option.setAttribute(
      "aria-current",
      String(option.dataset.key === current.key),
    );
  }
}
function pickStyle(next: Style) {
  element("styles", HTMLElement).hidePopover();
  if (next.url === current.url) return;
  current = next;
  loading = true;
  styleName = "";
  showStyle();
  showAttribution([]);
  withMap((map) => map.setStyle(next.url));
  const url = new URL(location.href);
  if (next.key !== null) url.searchParams.set("style", next.key);
  url.hash = writtenHash;
  history.replaceState(history.state, "", url);
}
styleList.replaceChildren(
  ...STYLES.map((option) => {
    const name = document.createElement("span");
    name.className = "style-name";
    name.textContent = option.name;
    const text = document.createElement("span");
    text.className = "style-text";
    text.append(name);
    if (option.detail !== undefined) {
      const detail = document.createElement("span");
      detail.className = "style-detail";
      detail.textContent = option.detail;
      text.append(detail);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "style-option";
    button.dataset.key = option.key ?? "";
    button.append(text);
    button.addEventListener("click", () => pickStyle(option));
    const item = document.createElement("li");
    item.append(button);
    return item;
  }),
);
showStyle();

// Attribution: the sources' HTML, kept to its text and its http(s) links.
const attribution = element("attribution", HTMLElement);
const attributionToggle = element("attribution-toggle", HTMLButtonElement);
attributionToggle.addEventListener("click", () => {
  const open = !attribution.classList.contains("open");
  attribution.classList.toggle("open", open);
  attributionToggle.setAttribute("aria-expanded", String(open));
});
function sanitize(node: Node, into: HTMLElement) {
  for (const child of node.childNodes) {
    if (child instanceof Text) {
      into.append(child.data);
    } else if (
      child instanceof HTMLAnchorElement &&
      /^https?:\/\//.test(child.getAttribute("href") ?? "")
    ) {
      const link = document.createElement("a");
      link.href = child.href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = child.textContent;
      into.append(link);
    } else if (child instanceof Element) {
      sanitize(child, into);
    }
  }
}
function showAttribution(entries: string[]) {
  const all = entries.map((entry) => {
    const part = document.createElement("span");
    sanitize(new DOMParser().parseFromString(entry, "text/html").body, part);
    return { part, text: part.textContent.trim() };
  });
  // Each credit once: an entry is left out when a longer one, or an equal
  // one before it, contains its text.
  const repeated = (i: number, text: string) =>
    all.some(
      (other, j) =>
        j !== i &&
        other.text.includes(text) &&
        (other.text.length > text.length || j < i),
    );
  const parts = all
    .filter(({ text }, i) => text && !repeated(i, text))
    .map(({ part }) => part);
  element("attribution-text", HTMLElement).replaceChildren(
    ...parts.flatMap((part, i) => (i ? [" ", part] : [part])),
  );
  attribution.hidden = parts.length === 0;
}

// The map. What the controls ask of it before it starts waits until it has.
const options: StartOptions = {
  container: mapBox,
  style: current.url,
  camera,
  on: events,
};
const map: Promise<MapEngine> =
  engine.key === "gljs"
    ? import("./gljs.ts").then(({ startGlJs }) => startGlJs(options))
    : engine.key === "orbis"
      ? import("./orbis.ts").then(({ startOrbis }) => startOrbis(options))
      : Promise.resolve(startMlnRs(options));
map.catch((error: unknown) =>
  stop(error instanceof Error ? error.message : String(error)),
);
const withMap = (call: (map: MapEngine) => void) => void map.then(call);
