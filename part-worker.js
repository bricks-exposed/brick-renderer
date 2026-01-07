/** @import { PartGeometry } from "./ldraw.js" */
/** @import { TypedWorker, TypedInnerWorker } from "./async-worker.js" */
import { PartDb } from "./part-db.js";
import { FileLoader } from "./file-loader.js";
import { Colors, File } from "./ldraw.js";

/** @type {FileLoader} */
let fileLoader;

/** @type {Colors} */
let colors;

/** @type {TypedInnerWorker<Events>} */
// @ts-expect-error
const self = globalThis;

self.onmessage = async function ({ data: { type, data, id } }) {
  switch (type) {
    case "initialize": {
      const partDb = await PartDb.open();

      fileLoader = new FileLoader(fetchPart, partDb);

      const configFile = await fileLoader.load("LDCfgalt.ldr");

      if (!configFile) {
        self.postMessage({
          type: "initialize",
          id,
          success: false,
          error: "Could not find config file for colors",
        });

        return;
      }

      colors ??= configFile.colors;

      File.globalColors = colors.all;

      self.postMessage({
        type: "initialize",
        id,
        success: true,
        data: colors.all,
      });

      return;
    }
    case "load:part": {
      try {
        const file = await fileLoader.load(data);

        if (!file) {
          self.postMessage({
            type: "load:part",
            id,
            success: false,
            error: `Could not load part ${data}`,
          });

          return;
        }

        const geometry = file.geometry();

        self.postMessage(
          {
            type: "load:part",
            id,
            success: true,
            data: geometry,
          },
          [
            geometry.lines.buffer,
            geometry.optionalLines.buffer,
            geometry.triangles.buffer,
            geometry.studs.buffer,
          ]
        );
      } catch (e) {
        self.postMessage({
          type: "load:part",
          id,
          success: false,
          error: e instanceof Error ? e.toString() : "Unknown load error",
        });
      }

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

/**
 *
 * @typedef {{
 *   "load:part": {
 *     request: string;
 *     response: PartGeometry
 *   };
 *   "initialize": {
 *     request: undefined;
 *     response: readonly { code: number; rgba: [number, number, number, number] }[];
 *   }
 * }} Events
 *
 * @typedef {TypedWorker<Events>} PartWorker
 */
