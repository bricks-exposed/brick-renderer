import { BrickRenderer } from "./brick-renderer.js";
import { CanvasRenderer } from "./canvas-renderer.js";
import { Model } from "./model.js";
import { Loader } from "./part-loader-worker.js";
import { GpuRenderer } from "./renderer.js";

export async function initialize() {
  const worker = new Worker(new URL("part-worker.js", import.meta.url), {
    type: "module",
    name: "part-loader-worker",
  });

  const loader = new Loader(worker);

  const colors = await loader.initialize();

  Model.loader = loader;

  const gpuRenderer = await GpuRenderer.create(colors);

  CanvasRenderer.gpuRenderer = gpuRenderer;

  customElements.define("brick-renderer", BrickRenderer);
}
