import { Part, File } from "./ldraw.js";

/**
 * @typedef {{
 *   get(fileName: string): Promise<string | undefined>;
 *   set(fileName: string, contents: string): Promise<void>;
 * }} FileContentsCache
 */

export class FileLoader {
  #getPaths;

  /** @type {Map<string, File>} */
  #fileCache = new Map();

  #fileContentsCache;

  /** @type {Map<string, Promise<string | undefined>>} */
  #requestCache = new Map();

  /**
   * @param {(fileName: string, paths: string[]) => Promise<string | undefined>} accessFile
   * @param {FileContentsCache} [fileContentsCache]
   */
  constructor(accessFile, fileContentsCache) {
    this.#getPaths = accessFile;
    this.#fileContentsCache = fileContentsCache;
  }

  /**
   * @param {string} fileName
   * @param {string[]} [paths]
   *
   * @returns {Promise<File | undefined>}
   */
  async load(fileName, paths) {
    const cachedFile = this.#fileCache.get(fileName);

    if (cachedFile) {
      return cachedFile;
    }

    const cachedContents = await this.#fileContentsCache?.get(fileName);

    try {
      const contents = cachedContents ?? (await this.#fetch(fileName, paths));

      if (contents == null) {
        return undefined;
      }

      if (!cachedContents) {
        this.#fileContentsCache?.set(fileName, contents);
      }

      const file = new File(fileName, contents);

      this.#fileCache.set(fileName, file);

      return file;
    } catch (e) {
      throw new Error(`Unable to load file ${fileName}`, { cause: e });
    }
  }

  /**
   * @param {string} fileName
   * @param {string[]} [directories]
   */
  async #fetch(fileName, directories = ["ldraw"]) {
    const cachedRequest = this.#requestCache.get(fileName);

    if (cachedRequest) {
      return cachedRequest;
    }

    const request = this.#getPaths(
      fileName,
      directories.map((d) => `${d}/${fileName.replaceAll("\\", "/")}`)
    );
    this.#requestCache.set(fileName, request);
    return request;
  }
}

export class PartLoader {
  #fileLoader;

  /** @type {Map<string, Promise<Part>>} */
  #partCache = new Map();

  /**
   * @param {FileLoader} fileLoader
   */
  constructor(fileLoader) {
    this.#fileLoader = fileLoader;
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
    const file = await this.#fileLoader.load(
      fileName,
      PartLoader.#paths(fileName)
    );

    if (!file) {
      throw new Error(`Could not find file for ${fileName}`);
    }

    const subParts = await Promise.all(
      file.subFiles.map((subFile) => this.load(subFile))
    );

    return new Part(file, subParts);
  }

  /**
   * @param {string} fileName
   */
  static #paths(fileName) {
    if (fileName.startsWith("s\\")) {
      return ["ldraw/parts"];
    } else if (fileName.startsWith("8\\") || fileName.startsWith("48\\")) {
      return ["ldraw/p"];
    } else if (/^\d\d\d/.test(fileName)) {
      return ["ldraw/parts"];
    } else if (/[.]ldr$/.test(fileName)) {
      return ["ldraw/models"];
    } else {
      return ["ldraw/p", "ldraw/parts", "ldraw/models"];
    }
  }
}
