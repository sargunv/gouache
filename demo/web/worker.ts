// A tile workers' Web Worker (tile-worker.ts) on the module that draws with
// WebGPU.

import init, { mlnWebServeTileWorker } from "./pkg/gouache_demo.js";
import { serve } from "./tile-worker.ts";

serve({ default: init, mlnWebServeTileWorker });
