/** @import { PartGeometry } from "./ldraw.js" */
/** @import { Color } from "./ldraw.js" */
/** @import { Loader } from "./part-loader-worker.js" */
import * as matrix from "./matrix.js";

export class Model {
  /** @type {Loader} */
  static loader;

  static #INITIAL_TRANSFORMATION = {
    rotateX: 90,
    rotateY: 0,
    rotateZ: 45,
    scale: 0.8,
  };

  /** @readonly */
  fileName;

  /** @readonly */
  geometry;

  /** @readonly */
  transformation;

  /**
   * @param {string} fileName
   * @param {PartGeometry} geometry
   * @param {Color} color
   */
  constructor(fileName, geometry, color) {
    this.fileName = fileName;

    this.transformation = new Transformation(
      Model.#INITIAL_TRANSFORMATION,
      geometry.viewBox,
      geometry.center
    );

    this.geometry = geometry;

    this.color = color;
  }

  /**
   * @param {string} fileName
   * @param {Color} color
   */
  static async for(fileName, color) {
    const geometry = await Model.loader.loadPartGeometry(fileName);

    return new Model(fileName, geometry, color);
  }
}

class Transformation {
  #defaultScale;

  #defaultRotation;

  #scale;

  #viewBox;

  #center;

  #pitch;

  #yaw;

  /**
   * @param {Transform} defaultTransformation
   * @param {number} viewBox
   * @param {[number, number, number]} center
   */
  constructor(defaultTransformation, viewBox, center) {
    this.#defaultScale = defaultTransformation.scale;
    this.#defaultRotation = matrix.quaternionFromEuler(
      (defaultTransformation.rotateX * Math.PI) / 180,
      (defaultTransformation.rotateY * Math.PI) / 180,
      (defaultTransformation.rotateZ * Math.PI) / 180
    );
    this.#pitch = 0;
    this.#yaw = 0;
    this.#scale = this.#defaultScale;
    this.#viewBox = viewBox;
    this.#center = center;
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
      [
        matrix.orthographic(
          -this.#viewBox,
          this.#viewBox,
          -this.#viewBox,
          this.#viewBox,
          -(this.#viewBox * 5),
          this.#viewBox * 5
        ),
        matrix.fromQuaternion(rotation),
        matrix.fromScaling(this.#scale),
        matrix.fromTranslation(
          -this.#center[0],
          -this.#center[1],
          -this.#center[2]
        ),
      ],
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
