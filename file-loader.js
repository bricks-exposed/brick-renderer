import { File, MultiPartDocument } from "./ldraw.js";

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

  /** @type {Map<string, Promise<File>>} */
  #fileRequestCache = new Map();

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
   *
   * @returns {Promise<File>}
   */
  async load(fileName) {
    const cachedFile = this.#fileCache.get(fileName);

    if (cachedFile) {
      return cachedFile;
    }

    const cachedRequest = this.#fileRequestCache.get(fileName);

    if (cachedRequest) {
      return cachedRequest;
    }

    const filePromise = this.#loadFile(fileName);

    this.#fileRequestCache.set(fileName, filePromise);

    try {
      const file = await filePromise;

      this.#fileCache.set(fileName, file);

      return file;
    } catch (e) {
      this.#fileRequestCache.delete(fileName);

      throw e;
    }
  }

  /**
   * @param {string} fileName
   *
   * @returns {Promise<File>}
   */
  async #loadFile(fileName) {
    const contents = await this.#loadFileContents(
      fileName,
      FileLoader.paths(fileName)
    );

    if (!contents) {
      throw new Error(`Could not find file ${fileName}`);
    }

    return fileName.includes(".mpd")
      ? this.#loadMpdFile(fileName, contents)
      : this.#loadNormalFile(fileName, contents);
  }

  /**
   * @param {string} fileName
   * @param {string} contents
   *
   * @returns {Promise<File>}
   */
  async #loadNormalFile(fileName, contents) {
    const parsed = File.parse(fileName, contents);

    const subFiles = await this.#fetchAndLoadSubfiles(parsed.subFilesToLoad);

    return File.from(fileName, parsed, subFiles);
  }

  /**
   * @param {string} fileName
   * @param {string} contents
   *
   * @returns {Promise<File>}
   */
  async #loadMpdFile(fileName, contents) {
    const parsed = MultiPartDocument.parse(fileName, contents);

    const subFiles = await this.#fetchAndLoadSubfiles(parsed.subFilesToLoad);

    return MultiPartDocument.from(fileName, parsed, subFiles);
  }

  /**
   * @param {Iterable<string>} names
   */
  async #fetchAndLoadSubfiles(names) {
    const promises = [];
    for (const subFile of names) {
      let request = this.#fileRequestCache.get(subFile);

      if (!request) {
        request = this.load(subFile);
        this.#fileRequestCache.set(subFile, request);
      }

      promises.push(request);
    }

    const subFiles = await Promise.all(promises);

    return subFiles;
  }

  /**
   * @param {string} fileName
   * @param {string[]} [paths]
   *
   * @returns {Promise<string | undefined>}
   */
  async #loadFileContents(fileName, paths) {
    const cachedRequest = this.#requestCache.get(fileName);

    if (cachedRequest) {
      return cachedRequest;
    }

    const cachedContents = await this.#fileContentsCache?.get(fileName);

    if (cachedContents) {
      return cachedContents;
    }

    const request = this.#fetch(fileName, paths);

    this.#requestCache.set(fileName, request);

    const contents = await request;

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
    const request = this.#getPaths(
      fileName,
      directories.map((d) => `${d}/${fileName.replaceAll("\\", "/")}`)
    );
    return request;
  }

  /**
   * @param {string} fileName
   */
  static paths(fileName) {
    if (fileName.startsWith("s\\")) {
      return ["ldraw/parts"];
    } else if (fileName.startsWith("8\\") || fileName.startsWith("48\\")) {
      return ["ldraw/p"];
    } else if (/[.]ldr$/.test(fileName) || /[.]mpd$/.test(fileName)) {
      return ["ldraw/models"];
    } else if (/^\d\d\d/.test(fileName)) {
      return ["ldraw/parts"];
    } else {
      return ["ldraw/p", "ldraw/parts", "ldraw/models"];
    }
  }
}
