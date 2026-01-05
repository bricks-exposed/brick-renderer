/**
 * @template {EventMap} Map
 */
export class AsyncWorker {
  /** @readonly */
  #worker;

  /**
   * @param {TypedWorker<Map>} worker
   */
  constructor(worker) {
    this.#worker = worker;
  }

  /**
   * @template {keyof Map} E
   * @param {E} type
   * @param {Map[E]["request"]} [data]
   *
   * @returns {Promise<Map[E]["response"]>}
   */
  run(type, data) {
    const id = crypto.randomUUID();
    const worker = this.#worker;

    const promise = new Promise(function (resolve, reject) {
      worker.addEventListener("message", function handler({ data }) {
        if (data.type === type && data.id === id) {
          worker.removeEventListener("message", handler);

          if (data.success) {
            resolve(data.data);
          } else {
            reject(data.error);
          }
        }
      });
    });

    worker.postMessage({
      type,
      id,
      data,
    });

    return promise;
  }
}

/**
 * @typedef {Record<string, { request: unknown, response: unknown }>} EventMap
 */

/**
 * @typedef {{ success: false; error: string; }} Error
 */

/**
 * @template T
 * @typedef {{ success: true; data: T } | Error} Status
 */

/**
 * @template Type
 * @template Data
 * @typedef {{
 *   type: Type;
 *   id: string;
 *   data: Data;
 * }} Request
 */

/**
 * @template {EventMap} Map
 * @typedef {{
 *   [k in keyof Map] : Request<k, Map[k]["request"]>
 * }[keyof Map]} Requests
 */

/**
 * @template Type
 * @template Data
 * @typedef {{
 *   type: Type;
 *   id: string;
 * } & Status<Data>} Response
 */

/**
 * @template {EventMap} Map
 * @typedef {{
 *   [k in keyof Map]: Response<k, Map[k]["response"]>
 * }[keyof Map]} Responses
 */

/**
 * @template {EventMap} Map
 * @typedef {Omit<Worker, 'postMessage'>
 * & {
 *   postMessage<E extends keyof Map>(
 *     message: Request<E, Map[E]["request"]>,
 *     transfer?: Transferable[]
 * ): void;
 *   addEventListener(
 *     type: "message",
 *     handler: (event: MessageEvent<Responses<Map>>) => void,
 *     options?: boolean | AddEventListenerOptions
 *   ): void;
 * }} TypedWorker
 */

/**
 * @template {EventMap} Map
 * @typedef {{
 *   postMessage<E extends keyof Map>(
 *     message: Response<E, Map[E]["response"]>,
 *     transfer?: Transferable[]
 *   ): void;
 *   onmessage<E extends keyof Map>(
 *     message: MessageEvent<Requests<Map>>
 *   ): void
 * }} TypedInnerWorker
 */
