/** @import { Color, Colors } from "./ldraw.js" */
/** @import { PartGeometry } from "./part-geometry.js" */
/** @import { TypedWorker, TypedInnerWorker } from "./async-worker.js" */
import { PartDb } from "./part-db.js";
import { ConfigurationLoader, FileLoader, PartLoader } from "./part-loader.js";
import { getPartGeometry } from "./part-geometry.js";

/** @type {FileLoader} */
let fileLoader;

/** @type {PartLoader} */
let partLoader;

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

      partLoader = new PartLoader(fileLoader);

      self.postMessage({
        type: "initialize",
        id,
        success: true,
        data: undefined,
      });

      return;
    }
    case "load:part": {
      try {
        const part = await partLoader.load(data);

        const geometry = getPartGeometry(colors, part);

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
            geometry.opaqueTriangles.buffer,
            geometry.transparentTriangles.buffer,
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
    case "load:colors": {
      colors ??= (await new ConfigurationLoader(fileLoader).load()).colors;

      self.postMessage({
        type: "load:colors",
        id,
        success: true,
        data: colors.all,
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

/**
 *
 * @typedef {{
 *   "load:part": {
 *     request: string;
 *     response: PartGeometry
 *   };
 *   "load:colors": {
 *     request: undefined;
 *     response: readonly Color[];
 *   };
 *   "initialize": {
 *     request: undefined;
 *     response: undefined;
 *   }
 * }} Events
 *
 * @typedef {TypedWorker<Events>} PartWorker
 */
