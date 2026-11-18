// The map on MapLibre GL JS, which the page imports only for `engine=gljs`.
// Its own controls are off: the page has its own.

import "maplibre-gl/dist/maplibre-gl.css";
import { Map as GlMap, setWorkerUrl } from "maplibre-gl";
// GL JS finds its worker beside its own module, which a bundle moves.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

import {
  cameraOptions,
  styleInfo,
  type MapEngine,
  type StartOptions,
} from "./engine.ts";

setWorkerUrl(workerUrl);

export function startGlJs({
  container,
  style,
  camera,
  on,
}: StartOptions): MapEngine {
  const map = new GlMap({
    container,
    style,
    ...cameraOptions(camera),
    attributionControl: false,
    hash: false,
  });

  let started = performance.now();
  let loading = true;
  const showStyle = (url: string) => {
    started = performance.now();
    loading = true;
    on.status("WebGL2");
    styleInfo(url).then(
      ({ name, attribution }) => {
        on.styleName(name);
        on.attribution(attribution);
      },
      (error: unknown) => console.error(error),
    );
  };
  showStyle(style);
  map.on("idle", () => {
    if (!loading) return;
    loading = false;
    on.status(
      `WebGL2, loaded in ${Math.round(performance.now() - started)} ms`,
    );
    on.loaded();
  });
  map.on("move", () => {
    const { lng, lat } = map.getCenter();
    on.camera([lat, lng, map.getZoom(), map.getBearing(), map.getPitch()]);
  });
  // A tile or an image that failed: the map goes on.
  map.on("error", ({ error }) => console.error(error));

  return {
    setStyle: (url) => {
      map.setStyle(url);
      showStyle(url);
    },
    zoomIn: () => map.zoomIn(),
    zoomOut: () => map.zoomOut(),
    resetNorth: () => map.resetNorthPitch(),
    jumpTo: (camera) => map.jumpTo(cameraOptions(camera)),
  };
}
