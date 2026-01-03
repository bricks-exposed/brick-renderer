import { WorkerRenderer } from "./worker-renderer.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLFormElement} form
 * @param {string} fileName
 */
export async function initialize(canvas, form, fileName) {
  // Smoother lines on high resolution displays
  const devicePixelRatio = window.devicePixelRatio;
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const renderer = await WorkerRenderer.create(canvas, fileName);

  function update() {
    const { color, transform } = inputs(form);

    renderer.render(color, transform);
  }

  form.addEventListener("input", update);
  form.addEventListener("reset", update);

  update();
}

/**
 * @param {HTMLFormElement} form
 */
function inputs(form) {
  const data = new FormData(form);

  const rotateX = Number.parseFloat(data.get("rotateX")?.toString() ?? "0");
  const rotateY = Number.parseFloat(data.get("rotateY")?.toString() ?? "0");
  const rotateZ = Number.parseFloat(data.get("rotateZ")?.toString() ?? "0");
  const scale = Number.parseFloat(data.get("scale")?.toString() ?? "0");

  const transform = {
    rotateX: (rotateX * Math.PI) / 180,
    rotateY: (rotateY * Math.PI) / 180,
    rotateZ: (rotateZ * Math.PI) / 180,
    scale,
  };

  const color = data.get("color")?.toString() ?? "#e04d4d";
  return { color, transform };
}
