/**
 * @param {HTMLCanvasElement} canvas
 */
export async function initialize(canvas) {
  const context = canvas.getContext("webgpu");
  if (!context) {
    throw new Error("Could not get canvas webgpu context");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
  }

  const device = await adapter.requestDevice();

  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({ device, format });

  return { device, format, canvasTexture: context.getCurrentTexture() };
}
