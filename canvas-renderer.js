import { GpuRenderer } from "./renderer.js";
import { Model } from "./model.js";

export class CanvasRenderer {
  /** @type {GpuRenderer} */
  static gpuRenderer;

  #renderFn;

  /**
   * @param {HTMLCanvasElement | OffscreenCanvas} canvas
   */
  constructor(canvas) {
    const context = canvas.getContext("webgpu");

    if (!context) {
      throw new Error("Could not get canvas webgpu context");
    }

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

  /**
   * @param {Model} model
   * @param {Model} stud
   */
  render(model, stud) {
    this.#renderFn(
      model.color,
      model.transformation.matrix,
      model.geometry,
      stud.geometry
    );
  }
}
