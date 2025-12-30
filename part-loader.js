import { Part, File } from "./ldraw.js";

/**
 * @typedef {{
 *   get(fileName: string): Promise<string | undefined>;
 *   set(fileName: string, contents: string): Promise<void>;
 * }} FileContentsCache
 */

export class PartLoader {
  #getPaths;

  /** @type {Map<string, Promise<string | undefined>>} */
  #requestCache;

  /** @type {Map<string, File>} */
  #fileCache;

  /** @type {Map<string, Promise<Part>>} */
  #partCache;

  #fileContentsCache;

  /**
   * @param {(fileName: string, paths: string[]) => Promise<string | undefined>} accessFile
   * @param {FileContentsCache} [fileContentsCache]
   */
  constructor(accessFile, fileContentsCache) {
    this.#getPaths = accessFile;
    this.#fileCache = new Map();
    this.#partCache = new Map();
    this.#requestCache = new Map();
    this.#fileContentsCache = fileContentsCache;
  }

  /**
   * @param {string} fileName
   *
   * @returns {Promise<Part>}
   */
  async load(fileName) {
    const cachedPart = this.#partCache.get(fileName);
    if (cachedPart) {
      return cachedPart;
    }

    const promise = this.#loadPart(fileName);
    this.#partCache.set(fileName, promise);

    try {
      return await promise;
    } catch (error) {
      this.#partCache.delete(fileName);
      throw error;
    }
  }

  /**
   * @param {string} fileName
   *
   * @returns {Promise<Part>}
   */
  async #loadPart(fileName) {
    const file =
      this.#fileCache.get(fileName) ?? (await this.#loadFile(fileName));

    if (!file) {
      throw new Error(`Could not find file for ${fileName}`);
    }

    this.#fileCache.set(fileName, file);

    const subParts = await Promise.all(
      file.subFiles.map((subFile) => this.load(subFile))
    );

    return new Part(file, subParts);
  }

  /**
   * @param {string} fileName
   */
  async #loadFile(fileName) {
    const cachedContents = await this.#fileContentsCache?.get(fileName);

    const contents = cachedContents ?? (await this.#fetch(fileName));

    if (contents == null) {
      return undefined;
    }

    if (!cachedContents) {
      this.#fileContentsCache?.set(fileName, contents);
    }

    return new File(fileName, contents);
  }

  /**
   * @param {string} fileName
   */
  async #fetch(fileName) {
    const cachedRequest = this.#requestCache.get(fileName);

    if (cachedRequest) {
      return cachedRequest;
    }

    const request = this.#getPaths(fileName, PartLoader.#paths(fileName));
    this.#requestCache.set(fileName, request);
    return request;
  }

  /**
   * @param {string} fileName
   */
  static #paths(fileName) {
    let prefixes;

    if (fileName.startsWith("s\\")) {
      prefixes = ["ldraw/parts"];
    } else if (fileName.startsWith("8\\") || fileName.startsWith("48\\")) {
      prefixes = ["ldraw/p"];
    } else if (/^\d\d\d/.test(fileName)) {
      prefixes = ["ldraw/parts"];
    } else if (/[.]ldr$/.test(fileName)) {
      prefixes = ["ldraw/models"];
    } else {
      prefixes = ["ldraw/p", "ldraw/parts", "ldraw/models"];
    }

    const options = prefixes.map(
      (d) => `${d}/${fileName.replaceAll("\\", "/")}`
    );

    return options;
  }
}
