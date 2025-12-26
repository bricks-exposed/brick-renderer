import { PartLoader } from "./ldraw.js";
import { Renderer } from "./renderer.js";
import { getFileContents } from "./test-files.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLFormElement} form
 */
export async function initialize(canvas, form) {
  // Smoother lines on high resolution displays
  const devicePixelRatio = window.devicePixelRatio;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const partLoader = new PartLoader((name) =>
    Promise.resolve(getFileContents(name))
  );

  const part = await partLoader.load("3023.dat");

  if (!part) {
    throw new Error(`Part not found.`);
  }

  const renderer = await Renderer.for(canvas, part);

  let animationFrame = -1;

  async function update() {
    cancelAnimationFrame(animationFrame);

    animationFrame = requestAnimationFrame(async function () {
      const data = new FormData(form);

      const rotateX = Number.parseFloat(data.get("rotateX")?.toString() ?? "0");
      const rotateY = Number.parseFloat(data.get("rotateY")?.toString() ?? "0");
      const rotateZ = Number.parseFloat(data.get("rotateZ")?.toString() ?? "0");
      const scale = Number.parseFloat(data.get("scale")?.toString() ?? "0");

      const transforms = {
        rotateX: (rotateX * Math.PI) / 180,
        rotateY: (rotateY * Math.PI) / 180,
        rotateZ: (rotateZ * Math.PI) / 180,
        scale,
      };

      renderer.render(transforms);
    });
  }

  form.addEventListener("input", update);
  form.addEventListener("reset", update);

  await update();
}
