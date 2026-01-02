import { Part, File, Configuration } from "./ldraw.js";

/**
 * @typedef {{
 *   get(fileName: string): Promise<string | undefined>;
 *   set(fileName: string, contents: string): Promise<void>;
 * }} FileContentsCache
 */

export class FileLoader {
  #getPaths;

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
   */
  async load(fileName, paths) {
    const cachedContents = await this.#fileContentsCache?.get(fileName);

    const contents = cachedContents ?? (await this.#fetch(fileName, paths));

    if (contents == null) {
      return undefined;
    }

    if (!cachedContents) {
      this.#fileContentsCache?.set(fileName, contents);
    }

    return contents;
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

export class ConfigurationLoader {
  #fileLoader;

  /**
   * @param {FileLoader} fileLoader
   */
  constructor(fileLoader) {
    this.#fileLoader = fileLoader;
  }

  async load(fileName = "LDCfgalt.ldr") {
    const fileContents = await this.#fileLoader.load(fileName);

    if (!fileContents) {
      throw new Error(`Could not find config file ${fileName}`);
    }

    return Configuration.from(fileContents);
  }
}

export class PartLoader {
  #fileLoader;

  /** @type {Map<string, File>} */
  #fileCache = new Map();

  /** @type {Map<string, Promise<Part>>} */
  #partCache = new Map();

  #configuration;

  /**
   * @param {FileLoader} fileLoader
   * @param {Configuration} configuration
   */
  constructor(fileLoader, configuration) {
    this.#fileLoader = fileLoader;
    this.#configuration = configuration;
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
    let file =
      this.#fileCache.get(fileName) ??
      (await this.#fileLoader.load(fileName, PartLoader.#paths(fileName)));

    if (!file) {
      throw new Error(`Could not find file for ${fileName}`);
    }

    if (typeof file === "string") {
      file = new File(fileName, file, this.#configuration.colors);

      this.#fileCache.set(fileName, file);
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
