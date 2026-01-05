/** @import { PartGeometry } from "./part-geometry.js" */
/** @import { Color } from "./ldraw.js" */
import { loadPartGeometry } from "./part-loader-worker.js";
import * as matrix from "./matrix.js";

export class Model {
  static #INITIAL_TRANSFORMATION = {
    rotateX: 60,
    rotateY: 0,
    rotateZ: 45,
    scale: 0.6,
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
    const geometry = await loadPartGeometry(fileName);

    return new Model(fileName, geometry, color);
  }
}

class Transformation {
  #defaultTransformation;

  #transformation;

  #viewBox;

  #center;

  /**
   * @param {Transform} defaultTransformation
   * @param {number} viewBox
   * @param {[number, number, number]} center
   */
  constructor(defaultTransformation, viewBox, center) {
    this.#defaultTransformation = defaultTransformation;
    this.#transformation = defaultTransformation;
    this.#viewBox = viewBox;
    this.#center = center;
  }

  /**
   * @param {Partial<Transform>} transformation
   */
  transform(transformation) {
    this.#transformation = { ...this.#transformation, ...transformation };
    return this;
  }

  /**
   * @param {Partial<Record<"x" | "y" | "z", number>>} degrees
   */
  rotateBy(degrees) {
    this.transform({
      rotateX: (this.#transformation.rotateX + (degrees.x || 0)) % 360,
      rotateY: (this.#transformation.rotateY + (degrees.y || 0)) % 360,
      rotateZ: (this.#transformation.rotateZ + (degrees.z || 0)) % 360,
    });
  }

  /**
   * @param {number} to
   */
  scale(to) {
    this.transform({
      scale: to,
    });
  }

  reset() {
    this.#transformation = this.#defaultTransformation;
  }

  /**
   * @returns {Readonly<Transform>}
   */
  get transformation() {
    return this.#transformation;
  }

  get matrix() {
    const { rotateX, rotateY, rotateZ } = this.transformation;

    const transformation = {
      ...this.transformation,
      rotateX: (rotateX * Math.PI) / 180,
      rotateY: (rotateY * Math.PI) / 180,
      rotateZ: (rotateZ * Math.PI) / 180,
    };

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
        matrix.fromRotationX(transformation.rotateX),
        matrix.fromRotationY(transformation.rotateY),
        matrix.fromRotationZ(transformation.rotateZ),
        matrix.fromScaling(transformation.scale),
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
