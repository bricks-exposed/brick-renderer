/** @import { PartGeometry } from "./part-geometry.js" */
/** @import { PartWorker } from "./part-worker.js" */
import { Colors } from "./ldraw.js";

/** @type {PartWorker} */
const worker = new Worker(new URL("part-worker.js", import.meta.url), {
  type: "module",
  name: "part-loader-worker",
});

await new Promise((resolve) => {
  worker.addEventListener("message", resolve, { once: true });
});

/** @type {Promise<Colors> | undefined} */
let cachedColorRequest;

/** @type {Map<string, Promise<PartGeometry>>} */
const cachedPartRequests = new Map();

/**
 * @param {string} fileName
 *
 * @returns {Promise<PartGeometry>}
 */
export async function loadPartGeometry(fileName) {
  const cachedPartRequest = cachedPartRequests.get(fileName);

  if (cachedPartRequest) {
    return cachedPartRequest;
  }

  const id = crypto.randomUUID();

  /** @type {Promise<PartGeometry>} */
  const promise = new Promise((resolve, reject) => {
    worker.addEventListener("message", function handler({ data }) {
      if (data.type === "load:part" && data.id === id) {
        worker.removeEventListener("message", handler);
        if (data.status === "success") {
          resolve(data.geometry);
        } else {
          reject(data.error);
        }
      }
    });
  });

  cachedPartRequests.set(fileName, promise);

  worker.postMessage({
    type: "load:part",
    id,
    fileName,
  });

  return promise;
}

/**
 * @returns {Promise<Colors>}
 */
export async function loadColors() {
  if (cachedColorRequest) {
    return cachedColorRequest;
  }

  const id = crypto.randomUUID();

  /** @type {Promise<Colors>} */
  const promise = new Promise((resolve, reject) => {
    worker.addEventListener("message", function handler({ data }) {
      if (data.type === "load:colors" && data.id === id) {
        worker.removeEventListener("message", handler);
        resolve(data.colors);
      }
    });
  }).then((c) => new Colors(c));

  cachedColorRequest = promise;

  worker.postMessage({
    type: "load:colors",
    id,
  });

  return promise;
}
