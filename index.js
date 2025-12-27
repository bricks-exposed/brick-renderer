import { PartLoader } from "./ldraw.js";
import { PartDb } from "./partdb.js";
import { Renderer } from "./renderer.js";

/**
 * @param {string} fileName
 * @param {string[]} paths
 */
async function fetchPart(fileName, paths) {
  return Promise.any(
    paths.map(async function (path) {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error(`Could not load ${path}: ${response.status}`);
      }

      return response.text();
    })
  );
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLFormElement} form
 */
export async function initialize(canvas, form) {
  // Smoother lines on high resolution displays
  const devicePixelRatio = window.devicePixelRatio;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const partDb = await PartDb.open();

  const partLoader = new PartLoader(fetchPart, partDb);

  const part = await partLoader.load("3005.dat");

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
