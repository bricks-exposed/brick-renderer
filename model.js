/** @import { PartGeometry } from "./ldraw.js" */
/** @import { Color } from "./ldraw.js" */
/** @import { Loader } from "./part-loader-worker.js" */
import * as matrix from "./matrix.js";
import { Transformation } from "./transformation.js";

export class Model {
  /** @type {Loader} */
  static loader;

  /** @readonly */
  fileName;

  /** @readonly */
  geometry;

  /**
   * @param {string} fileName
   * @param {PartGeometry} geometry
   * @param {Color} color
   */
  constructor(fileName, geometry, color) {
    this.fileName = fileName;

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

  /**
   * @param {Transformation} transformation
   */
  matrix(transformation) {
    return matrix.transform(
      [
        matrix.orthographic(
          -this.geometry.viewBox,
          this.geometry.viewBox,
          -this.geometry.viewBox,
          this.geometry.viewBox,
          -(this.geometry.viewBox * 5),
          this.geometry.viewBox * 5
        ),
        transformation.matrix,
        matrix.fromTranslation(
          -this.geometry.center[0],
          -this.geometry.center[1],
          -this.geometry.center[2]
        ),
      ],
      matrix.identity
    );
  }
}
