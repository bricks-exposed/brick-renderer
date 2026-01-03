/** @import {Transform} from "./ldraw.js" */
import { Color } from "./ldraw.js";
import { PartDb } from "./part-db.js";
import { ConfigurationLoader, FileLoader, PartLoader } from "./part-loader.js";
import { GpuRenderer, CanvasRenderer } from "./renderer.js";

/** @type {Map<string, CanvasRenderer>} */
const renderers = new Map();

const { partLoader, gpuRenderer } = await setup();

/** @type {(event: MessageEvent<Message>) => Promise<void>} */
globalThis.onmessage = async function ({ data }) {
  switch (data.type) {
    case "attach": {
      try {
        const renderer = gpuRenderer.to(data.canvas);
        renderers.set(data.id, renderer);

        sendMessage({ type: "attach", id: data.id, status: "success" });
      } catch (e) {
        sendMessage({
          type: "attach",
          id: data.id,
          status: "error",
          error: e instanceof Error ? e.toString() : "Unknown attach error",
        });
      }
      return;
    }
    case "load": {
      try {
        const renderer = renderers.get(data.id);

        if (!renderer) {
          throw new Error(`Unrecognized rendering id ${data.id}`);
        }

        const part = await partLoader.load(data.fileName);
        renderer?.load(part);

        sendMessage({ type: "load", id: data.id, status: "success" });
      } catch (e) {
        sendMessage({
          type: "load",
          id: data.id,
          status: "error",
          error: e instanceof Error ? e.toString() : "Unknown load error",
        });
      }

      return;
    }
    case "render": {
      const renderer = renderers.get(data.id);
      const color = Color.custom(data.color);
      renderer?.render(color, data.transform);

      return;
    }
  }
};

sendMessage({ type: "ready" });

/**
 * @typedef {{
 *   type: "attach";
 *   id: string;
 *   canvas: OffscreenCanvas;
 * } | {
 *   type: "load";
 *   id: string;
 *   fileName: string;
 * } | {
 *   type: "render";
 *   id: string;
 *   color: string;
 *   transform: Transform;
 * }} Message
 *
 * @typedef {{ status: "success" } | { status: "error"; error: string; }} Status
 *
 * @typedef {{
 *   type: "ready";
 * } | ({
 *   type: "attach";
 *   id: string;
 * } & Status) | ({
 *   type: "load";
 *   id: string;
 * } & Status)} Response
 *
 * @typedef {Omit<Worker, 'postMessage'>
 * & {
 *   postMessage(message: Message, transfer?: Transferable[]): void;
 *   addEventListener(
 *     type: "message",
 *     handler: (event: MessageEvent<Response>) => void,
 *     options?: boolean | AddEventListenerOptions
 *   ): void;
 * }} RenderWorker
 */

/**
 * @param {Response} response
 */
function sendMessage(response) {
  globalThis.postMessage(response);
}

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

async function setup() {
  const partDb = await PartDb.open();

  const fileLoader = new FileLoader(fetchPart, partDb);

  const configuration = await new ConfigurationLoader(fileLoader).load();

  const partLoader = new PartLoader(fileLoader);

  const gpuRenderer = await GpuRenderer.create(configuration.colors);

  return { partLoader, gpuRenderer };
}
