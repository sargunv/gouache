// A Web Worker running tile workers: its own instance of the page's module,
// with its own memory. worker.ts and worker-webgl.ts start it, each on its
// build of the module. The page gives it the module and a control port to
// the map's Web Worker, and the instance starts at once. The map's runtime
// then connects each of its render sessions over the control port, with a
// port of the session's own, which the instance serves: requests are the
// session's bytes, and the replies go back in batches, each its bytes and
// its payloads (pixels, vertices, indices), all transferred.
//
// A panic aborts the instance (wasm32-unknown-unknown can't unwind), and
// nothing may call into it after that. The worker then sends {fatal:
// message} over the control port and the sessions' ports instead of
// replies, with the message the panic hook left in `mlnPanic` (src/lib.rs),
// and the map stops.

import type {
  Bindings,
  StartTileWorker,
  TileWorkerConnect,
  TileWorkerFatal,
} from "./protocol.ts";

/** Runs tile workers in this Web Worker, on a build of the module. */
export function serve({
  default: init,
  mlnWebServeTileWorker,
}: Bindings<"mlnWebServeTileWorker">) {
  let control: MessagePort | null = null;
  const ports: MessagePort[] = [];
  // Once the instance panicked, the panic's message.
  let dead: string | null = null;

  const tell = (port: MessagePort | null, message: string) =>
    port?.postMessage({ fatal: message } satisfies TileWorkerFatal);

  function fatal(error: unknown) {
    if (dead !== null) return;
    dead = self.mlnPanic ?? String(error);
    tell(control, dead);
    for (const port of ports) tell(port, dead);
  }

  // What throws outside `connect`: the instance's work between requests, a
  // reply's image decode, the instance's start.
  addEventListener("error", (event) => fatal(event.error ?? event.message));
  addEventListener("unhandledrejection", (event) => fatal(event.reason));

  function connect(port: MessagePort) {
    if (dead !== null) {
      tell(port, dead);
      return;
    }
    ports.push(port);
    try {
      mlnWebServeTileWorker(port);
    } catch (error) {
      fatal(error);
    }
  }

  onmessage = async ({ data }: MessageEvent<StartTileWorker>) => {
    control = data.control;
    await init({ module_or_path: data.module });
    // The control port keeps the connections that arrive before the
    // instance starts.
    data.control.onmessage = ({ data }: MessageEvent<TileWorkerConnect>) =>
      connect(data.port);
  };
}
