import * as matrix from "./matrix.js";

export class Transformation {
  #defaultScale;

  #defaultRotation;

  #scale;

  #pitch;

  #yaw;

  /**
   * @param {Transform} defaultTransformation
   */
  constructor(
    defaultTransformation = {
      rotateX: 60,
      rotateY: 0,
      rotateZ: 50,
      scale: 0.8,
    }
  ) {
    this.#defaultScale = defaultTransformation.scale;
    this.#defaultRotation = matrix.quaternionFromEuler(
      (defaultTransformation.rotateX * Math.PI) / 180,
      (defaultTransformation.rotateY * Math.PI) / 180,
      (defaultTransformation.rotateZ * Math.PI) / 180
    );
    this.#pitch = 0;
    this.#yaw = 0;
    this.#scale = this.#defaultScale;
  }

  /**
   * @param {number} pitch
   * @param {number} yaw
   */
  orbit(pitch, yaw) {
    this.#pitch += (pitch * Math.PI) / 180;
    this.#yaw += (yaw * Math.PI) / 180;
  }

  /**
   * @param {number} to
   */
  scale(to) {
    this.#scale = to;
  }

  reset() {
    this.#scale = this.#defaultScale;
    this.#pitch = 0;
    this.#yaw = 0;
  }

  get matrix() {
    const rotation = matrix.multiplyQuaternion(
      matrix.quaternionFromEuler(this.#pitch, this.#yaw, 0),
      this.#defaultRotation
    );

    return matrix.transform(
      [matrix.fromQuaternion(rotation), matrix.fromScaling(this.#scale)],
      matrix.identity
    );
  }
}

/**
 * @typedef {{
 *   rotateX: number;
 *   rotateY: number;
 *   rotateZ: number;
 *   scale: number;
 * }} Transform
 */
