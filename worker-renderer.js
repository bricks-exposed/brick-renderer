/** @import {RenderWorker} from "./render-worker.js" */
/** @import {Transform} from "./ldraw.js" */

/** @type {RenderWorker} */
const worker = new Worker(new URL("render-worker.js", import.meta.url), {
  type: "module",
  name: "brick-renderer-worker",
});

await new Promise(function (resolve) {
  worker.addEventListener("message", resolve, { once: true });
});

export class WorkerRenderer {
  #id;

  /**
   * @param {string} id
   */
  constructor(id) {
    this.#id = id;
  }

  /**
   * @param {string} fileName
   */
  async load(fileName) {
    worker.postMessage({
      type: "load",
      id: this.#id,
      fileName,
    });

    const id = this.#id;

    await new Promise(function (resolve, reject) {
      worker.addEventListener("message", function ({ data }) {
        if (data.type === "load" && data.id === id) {
          data.status === "success" ? resolve(id) : reject(data.error);
        }
      });
    });
  }

  /**
   * @param {string} color
   * @param {Transform} transform
   */
  render(color, transform) {
    worker.postMessage({
      type: "render",
      id: this.#id,
      color,
      transform,
    });
  }

  /**
   * @param {HTMLCanvasElement} canvas
   */
  static async attach(canvas) {
    const id = crypto.randomUUID();
    const offscreen = canvas.transferControlToOffscreen();

    worker.postMessage(
      {
        type: "attach",
        id,
        canvas: offscreen,
      },
      [offscreen]
    );

    await new Promise(function (resolve, reject) {
      worker.addEventListener("message", function ({ data }) {
        if (data.type === "attach" && data.id === id) {
          data.status === "success" ? resolve(id) : reject(data.error);
        }
      });
    });

    return new WorkerRenderer(id);
  }
}
