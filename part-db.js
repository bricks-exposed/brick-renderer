/** @import { FileContentsCache } from "./file-loader.js" */

/**
 * @implements {FileContentsCache}
 */
export class PartDb {
  /**
   * @param {IDBDatabase} db
   */
  constructor(db) {
    this.db = db;
  }

  static async open(indexedDB = globalThis.indexedDB) {
    const openRequest = indexedDB.open("parts", 1);

    openRequest.addEventListener("upgradeneeded", function () {
      const db = openRequest.result;
      db.createObjectStore("ldraw");
    });

    const openPromise = new Promise(function (resolve, reject) {
      openRequest.onsuccess = resolve;
      openRequest.onerror = reject;
    });

    await openPromise;
    const db = openRequest.result;

    return new PartDb(db);
  }

  /**
   * @param {string} fileName
   */
  get(fileName) {
    return this.#getFromStore("ldraw", fileName);
  }

  /**
   * @param {string} fileName
   * @param {string} contents
   */
  set(fileName, contents) {
    return this.#setInStore("ldraw", fileName, contents);
  }

  /**
   * @param {string} name
   * @param {string} key
   * @returns {Promise<string | undefined>}
   */
  #getFromStore(name, key) {
    const transaction = this.db.transaction(name, "readonly");
    const store = transaction.objectStore(name);

    const cachedRequest = store.get(key);
    const cachedPromise = new Promise(function (resolve, reject) {
      cachedRequest.onsuccess = () => resolve(cachedRequest.result);
      cachedRequest.onerror = reject;
    });
    return cachedPromise;
  }

  /**
   * @param {string} name
   * @param {string} key
   * @param {unknown} contents
   */
  #setInStore(name, key, contents) {
    const transaction = this.db.transaction(name, "readwrite");
    const store = transaction.objectStore(name);

    const cachedRequest = store.add(contents, key);
    const cachedPromise = new Promise(function (resolve, reject) {
      cachedRequest.onsuccess = resolve;
      cachedRequest.onerror = reject;
    });

    return cachedPromise;
  }
}
