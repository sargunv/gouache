// The map on Orbis, which the page imports only for `engine=orbis`.
// `orbis` is Orbis's browser library, from the checkout demo/orbis.sh
// builds (vite.config.ts); orbis-api.d.ts types the parts of it used here.

import { createMap } from "orbis";

import {
  cameraOptions,
  styleInfo,
  type MapEngine,
  type StartOptions,
} from "./engine.ts";

export async function startOrbis({
  container,
  style,
  camera,
  on,
}: StartOptions): Promise<MapEngine> {
  const map = await createMap({
    container,
    style,
    camera: cameraOptions(camera),
  });
  const backend = map.backend === "webgpu" ? "WebGPU" : "WebGL2";

  let started = performance.now();
  let loading = true;
  const showStyle = (url: string) => {
    started = performance.now();
    loading = true;
    on.status(backend);
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
      `${backend}, loaded in ${Math.round(performance.now() - started)} ms`,
    );
    on.loaded();
  });
  map.on("move", () => {
    const {
      center: [lon, lat],
      zoom,
      bearing,
      pitch,
    } = map.camera.current;
    on.camera([lat, lon, zoom, bearing, pitch]);
  });
  // An error that starts "the map stopped" is the map's last.
  map.on("error", ({ message }) => {
    if (message.startsWith("the map stopped")) on.stop(message);
    else console.error(`orbis: ${message}`);
  });

  const zoomBy = (levels: number) =>
    void map.camera.easeTo({ zoom: map.camera.current.zoom + levels });
  return {
    setStyle: (url) => {
      map.setStyle(url);
      showStyle(url);
    },
    zoomIn: () => zoomBy(1),
    zoomOut: () => zoomBy(-1),
    resetNorth: () => void map.camera.easeTo({ bearing: 0, pitch: 0 }),
    jumpTo: (camera) => map.camera.jumpTo(cameraOptions(camera)),
  };
}
