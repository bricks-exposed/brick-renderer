/** @import { PartGeometry } from "./part-geometry.js" */
/** @import { PartWorker } from "./part-worker.js" */
import { AsyncWorker } from "./async-worker.js";

export class Loader {
  /** @type {Promise<readonly { code: number; rgba: number[] }[]> | undefined} */
  #cachedInitializeRequest;

  /** @readonly @type {Map<string, Promise<PartGeometry>>} */
  #cachedPartRequests = new Map();

  /** @readonly */
  #worker;

  /**
   * @param {PartWorker} worker
   */
  constructor(worker) {
    this.#worker = new AsyncWorker(worker);
  }

  initialize() {
    return (this.#cachedInitializeRequest ??= this.#worker.run("initialize"));
  }

  /**
   * @param {string} fileName
   */
  async loadPartGeometry(fileName) {
    const cachedPartRequest = this.#cachedPartRequests.get(fileName);

    if (cachedPartRequest) {
      return cachedPartRequest;
    }

    const promise = this.#worker.run("load:part", fileName);

    this.#cachedPartRequests.set(fileName, promise);

    return promise;
  }
}
