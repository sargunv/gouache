// A tile workers' Web Worker (tile-worker.ts) on the module that draws with
// WebGL2, so that a browser without WebGPU downloads one module.

import init, { mlnWebServeTileWorker } from "./pkg/webgl/gouache_demo.js";
import { serve } from "./tile-worker.ts";

serve({ default: init, mlnWebServeTileWorker });
