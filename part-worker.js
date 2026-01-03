/** @import { Color } from "./ldraw.js" */
/** @import { PartGeometry } from "./part-geometry.js" */
import { PartDb } from "./part-db.js";
import { ConfigurationLoader, FileLoader, PartLoader } from "./part-loader.js";
import { getPartGeometry } from "./part-geometry.js";

const { partLoader, colors } = await setup();

/** @type {(event: MessageEvent<Message>) => Promise<void>} */
globalThis.onmessage = async function ({ data }) {
  switch (data.type) {
    case "load:part": {
      try {
        const part = await partLoader.load(data.fileName);

        const geometry = getPartGeometry(colors, part);

        sendMessage(
          {
            type: "load:part",
            id: data.id,
            status: "success",
            geometry,
          },
          [
            geometry.lines.buffer,
            geometry.optionalLines.buffer,
            geometry.opaqueTriangles.buffer,
            geometry.transparentTriangles.buffer,
          ]
        );
      } catch (e) {
        sendMessage({
          type: "load:part",
          id: data.id,
          status: "error",
          error: e instanceof Error ? e.toString() : "Unknown load error",
        });
      }

      return;
    }
    case "load:colors": {
      sendMessage({
        type: "load:colors",
        id: data.id,
        colors: colors.all,
      });

      return;
    }
  }
};

/**
 * @param {string} fileName
 * @param {string[]} paths
 */
function fetchPart(fileName, paths) {
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

sendMessage({ type: "ready" });

/**
 * @typedef {{
 *   type: "load:part";
 *   id: string;
 *   fileName: string;
 * } | {
 *   type: "load:colors";
 *   id: string;
 * }} Message
 *
 * @typedef {{
 *   type: "ready"
 * } | {
 *   type: "load:colors";
 *   id: string;
 *   colors: readonly Color[]
 * } | ({
 *   type: "load:part";
 *   id: string;
 * } & (
 * {
 *   status: "success"
 *   geometry: PartGeometry;
 * } | {
 *   status: "error";
 *   error: string;
 * })
 * )} Response
 *
 * @typedef {Omit<Worker, 'postMessage'>
 * & {
 *   postMessage(message: Message, transfer?: Transferable[]): void;
 *   addEventListener(
 *     type: "message",
 *     handler: (event: MessageEvent<Response>) => void,
 *     options?: boolean | AddEventListenerOptions
 *   ): void;
 * }} PartWorker
 */

/**
 * @param {Response} response
 * @param {Transferable[]} [transfer]
 */
function sendMessage(response, transfer) {
  // @ts-expect-error Typescript doesn't know we're in a worker file
  globalThis.postMessage(response, transfer);
}

async function setup() {
  const partDb = await PartDb.open();

  const fileLoader = new FileLoader(fetchPart, partDb);

  const partLoader = new PartLoader(fileLoader);

  const configuration = await new ConfigurationLoader(fileLoader).load();

  return { partLoader, colors: configuration.colors };
}
