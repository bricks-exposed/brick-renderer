/** @import { Transform } from "./ldraw.js" */
import { Colors, Part } from "./ldraw.js";
import * as matrix from "./matrix.js";

/**
 * @typedef {{
 *   lines: Float32Array<ArrayBuffer>;
 *   optionalLines: Float32Array<ArrayBuffer>;
 *   opaqueTriangles: Float32Array<ArrayBuffer>;
 *   transparentTriangles: Float32Array<ArrayBuffer>;
 *   viewBox: number,
 *   center: [number, number, number],
 * }} PartGeometry
 */

/**
 * @param {Colors} colors
 * @param {Part} part
 *
 * @returns {PartGeometry}
 */
export function getPartGeometry(colors, part) {
  const {
    lines: rawLines,
    triangles: rawTriangles,
    viewBox,
    center,
  } = part.render();

  /** @type {number[]} */
  const lines = [];

  /** @type {number[]} */
  const optionalLines = [];

  /** @type {number[]} */
  const opaqueTriangles = [];

  /** @type {number[]} */
  const transparentTriangles = [];

  for (const line of rawLines) {
    const points = line.points.flat();
    if (line.controlPoints) {
      optionalLines.push(...points, ...line.controlPoints.flat());
    } else {
      lines.push(...points);
    }
  }

  for (const { vertices, color: colorCode } of rawTriangles) {
    const color = colors.for(colorCode);
    const array = color?.opaque ? opaqueTriangles : transparentTriangles;
    for (const vertex of vertices) {
      array.push(...vertex, colorCode ?? -1);
    }
  }

  return {
    lines: new Float32Array(lines),
    optionalLines: new Float32Array(optionalLines),
    opaqueTriangles: new Float32Array(opaqueTriangles),
    transparentTriangles: new Float32Array(transparentTriangles),
    viewBox,
    center,
  };
}

/**
 * @param {PartGeometry} geometry
 * @param {Transform} transform
 */
export function transformMatrix(geometry, transform) {
  return matrix.transform(
    [
      matrix.orthographic(
        -geometry.viewBox,
        geometry.viewBox,
        -geometry.viewBox,
        geometry.viewBox,
        -(geometry.viewBox * 5),
        geometry.viewBox * 5
      ),
      matrix.fromScaling(transform.scale),
      matrix.fromRotationX(transform.rotateX),
      matrix.fromRotationY(transform.rotateY),
      matrix.fromRotationZ(transform.rotateZ),
      // matrix.fromScaling(transform.scale),
      matrix.fromTranslation(
        -geometry.center[0],
        -geometry.center[1],
        -geometry.center[2]
      ),
    ],
    matrix.identity
  );
}
