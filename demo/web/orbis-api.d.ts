// The parts of Orbis's browser library (web/src/index.ts in its checkout)
// that orbis.ts uses: its own sources are built and checked with Orbis.

declare module "orbis" {
  export interface CameraOptions {
    center?: [lon: number, lat: number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
  }

  export interface Camera {
    center: [lon: number, lat: number];
    zoom: number;
    bearing: number;
    pitch: number;
  }

  export interface CameraControl {
    readonly current: Camera;
    jumpTo(options: CameraOptions): void;
    /** Resolves true on arrival, false when interrupted. */
    easeTo(options: CameraOptions & { duration?: number }): Promise<boolean>;
  }

  export interface OrbisMap {
    readonly backend: "webgpu" | "webgl2";
    readonly camera: CameraControl;
    setStyle(style: string): void;
    on(type: "move" | "idle", listener: () => void): () => void;
    on(
      type: "error",
      listener: (event: { message: string }) => void,
    ): () => void;
  }

  /** Resolves once the map can take calls; rejects where it can't draw. */
  export function createMap(options: {
    container: HTMLElement;
    style: string;
    camera?: CameraOptions;
  }): Promise<OrbisMap>;
}
