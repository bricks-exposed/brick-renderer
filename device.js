export class Device {
  /**
   * The base GPUDevice returned by the browser.
   *
   * @type {GPUDevice}
   * @readonly
   */
  #device;

  /**
   * @param {GPUDevice} gpuDevice
   */
  constructor(gpuDevice) {
    this.#device = gpuDevice;
  }

  /**
   * Creates and populates a {@link GPUBufferUsage.STORAGE} buffer
   * with the given label and data.
   *
   * @param {string} label
   * @param {GPUAllowSharedBufferSource} source
   */
  storageBufferWith(label, source) {
    return this.#createBufferWith(label, GPUBufferUsage.STORAGE, source);
  }

  /**
   * Creates and populates a {@link GPUBufferUsage.UNIFORM} buffer
   * with the given label and data.
   *
   * @param {string} label
   * @param {GPUAllowSharedBufferSource} source
   */
  uniformBufferWith(label, source) {
    return this.#createBufferWith(label, GPUBufferUsage.UNIFORM, source);
  }

  /**
   * Creates and populates a {@link GPUBufferUsage.VERTEX} buffer
   * with the given label and data.
   *
   * @param {string} label
   * @param {GPUAllowSharedBufferSource} source
   */
  vertexBufferWith(label, source) {
    return this.#createBufferWith(label, GPUBufferUsage.VERTEX, source);
  }

  /**
   * Creates and populates a {@link GPUBufferUsage.INDEX} buffer
   * with the given label and data.
   *
   * @param {string} label
   * @param {GPUAllowSharedBufferSource} source
   */
  indexBufferWith(label, source) {
    return this.#createBufferWith(label, GPUBufferUsage.INDEX, source);
  }

  /**
   * @param {string} label
   * @param {number} usage {@link GPUBufferUsage}
   * @param {GPUAllowSharedBufferSource} array
   */
  #createBufferWith(label, usage, array) {
    const buffer = this.#device.createBuffer({
      label,
      size: array.byteLength,
      usage: GPUBufferUsage.COPY_DST | usage,
    });
    this.#device.queue.writeBuffer(buffer, 0, array);

    return buffer;
  }
}
