import { GpuRenderer } from "./renderer.js";
import { Model } from "./model.js";

export class CanvasRenderer {
  /** @type {GpuRenderer} */
  static gpuRenderer;

  #context;

  #renderFn;

  /**
   * @param {HTMLCanvasElement | OffscreenCanvas} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    const context = canvas.getContext("webgpu");

    if (!context) {
      throw new Error("Could not get canvas webgpu context");
    }

    this.#context = context;

    context.configure({
      device: CanvasRenderer.gpuRenderer.device,
      format: CanvasRenderer.gpuRenderer.format,
      alphaMode: "premultiplied",
    });

    this.#renderFn = CanvasRenderer.gpuRenderer.prepare({
      width: canvas.width,
      height: canvas.height,
      createView() {
        return context.getCurrentTexture().createView();
      },
    });
  }

  resize() {
    this.#renderFn.cleanup();
    this.#renderFn = CanvasRenderer.gpuRenderer.prepare({
      width: this.canvas.width,
      height: this.canvas.height,
      createView: () => this.#context.getCurrentTexture().createView(),
    });
  }

  /**
   * @param {Model} model
   * @param {Model} stud
   */
  render(model, stud) {
    this.#renderFn.render(
      model.color,
      model.transformation.matrix,
      model.geometry,
      stud.geometry
    );
  }
}
