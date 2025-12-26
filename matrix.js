/**
 * @typedef {[
 *  number, number, number, number, // column 1
 *  number, number, number, number, // column 2
 *  number, number, number, number, // column 3
 *  number, number, number, number, // column 4
 * ]} Matrix
 */

/** @type {Matrix} */
export const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Apply a series of transforms to a matrix.
 *
 * @param {Matrix[]} transforms
 * @param {Matrix} matrix
 *
 * @returns {Matrix}
 */
export function transform(transforms, matrix) {
  return transforms.reduce(multiply, matrix);
}

/**
 * @param {number} fieldOfViewYInRadians
 * @param {number} aspect
 * @param {number} near
 * @param {number} far
 *
 * @returns {Matrix}
 */
export function perspective(fieldOfViewYInRadians, aspect, near, far) {
  const f = Math.tan(Math.PI * 0.5 - 0.5 * fieldOfViewYInRadians);
  const rangeInv = 1 / (near - far);

  return [
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    far * rangeInv,
    -1,
    0,
    0,
    near * far * rangeInv,
    0,
  ];
}

/**
 * @param {number} left
 * @param {number} right
 * @param {number} bottom
 * @param {number} top
 * @param {number} near
 * @param {number} far
 *
 * @returns {Matrix}
 */
export function orthographic(left, right, bottom, top, near, far) {
  return [
    2 / (right - left),
    0,
    0,
    0,
    0,
    2 / (top - bottom),
    0,
    0,
    0,
    0,
    1 / (near - far),
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    near / (near - far),
    1,
  ];
}

/**
 * @param {number} radians
 * @param {Matrix} matrix
 *
 * @returns {Matrix}
 */
export function rotateX(radians, matrix) {
  return multiply(matrix, fromRotationX(radians));
}

/**
 * @param {number} radians
 * @param {Matrix} matrix
 *
 * @returns {Matrix}
 */
export function rotateY(radians, matrix) {
  return multiply(matrix, fromRotationY(radians));
}

/**
 * @param {number} radians
 * @param {Matrix} matrix
 *
 * @returns {Matrix}
 */
export function rotateZ(radians, matrix) {
  return multiply(matrix, fromRotationZ(radians));
}

/**
 * @param {number | [number, number, number]} factor
 * @param {Matrix} matrix
 *
 * @returns {Matrix}
 */
export function scale(factor, matrix) {
  return multiply(matrix, fromScaling(factor));
}

/**
 * @param {number} moveX
 * @param {number} moveY
 * @param {number} moveZ
 *
 * @returns {Matrix}
 */
export function fromTranslation(moveX, moveY, moveZ) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, moveX, moveY, moveZ, 1];
}

/**
 * @param {number} radians
 *
 * @returns {Matrix}
 */
export function fromRotationX(radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);

  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

/**
 * @param {number} radians
 *
 * @returns {Matrix}
 */
export function fromRotationY(radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);

  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/**
 * @param {number} radians
 *
 * @returns {Matrix}
 */
export function fromRotationZ(radians) {
  const c = Math.cos(radians);
  const s = Math.sin(radians);

  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * @param {number | [number, number, number]} factor
 *
 * @returns {Matrix}
 */
export function fromScaling(factor) {
  const [scaleX, scaleY, scaleZ] =
    typeof factor === "number" ? [factor, factor, factor] : factor;

  return [
    scaleX,
    0,
    0,
    0,
    0,
    scaleY ?? scaleX,
    0,
    0,
    0,
    0,
    scaleZ ?? scaleX,
    0,
    0,
    0,
    0,
    1,
  ];
}

/**
 * @param {Matrix | undefined} matrix
 * @param {number[]} vector
 *
 * @returns {number[]}
 */
export function apply(matrix, vector) {
  if (!matrix) {
    return vector;
  }

  const [u, v, w] = vector;

  const [a, b, c, x, d, e, f, y, g, h, i, z] = matrix;

  return [
    a * u + b * v + c * w + x,
    d * u + e * v + f * w + y,
    g * u + h * v + i * w + z,
  ];
}

/**
 * @param {number[]} matrix3x3
 */
export function determinant([a, d, g, b, e, h, c, f, i]) {
  return a * e * i + b * f * g + c * d * h - c * e * g - b * d * i - a * f * h;
}

/**
 *
 * @param {Matrix} a
 * @param {Matrix | undefined} b
 *
 * @returns {Matrix}
 */
export function multiply(a, b) {
  if (!b) {
    return a;
  }

  const [
    a00,
    a01,
    a02,
    a03,
    a10,
    a11,
    a12,
    a13,
    a20,
    a21,
    a22,
    a23,
    a30,
    a31,
    a32,
    a33,
  ] = a;
  const [
    b00,
    b01,
    b02,
    b03,
    b10,
    b11,
    b12,
    b13,
    b20,
    b21,
    b22,
    b23,
    b30,
    b31,
    b32,
    b33,
  ] = b;

  return [
    b00 * a00 + b01 * a10 + b02 * a20 + b03 * a30,
    b00 * a01 + b01 * a11 + b02 * a21 + b03 * a31,
    b00 * a02 + b01 * a12 + b02 * a22 + b03 * a32,
    b00 * a03 + b01 * a13 + b02 * a23 + b03 * a33,

    b10 * a00 + b11 * a10 + b12 * a20 + b13 * a30,
    b10 * a01 + b11 * a11 + b12 * a21 + b13 * a31,
    b10 * a02 + b11 * a12 + b12 * a22 + b13 * a32,
    b10 * a03 + b11 * a13 + b12 * a23 + b13 * a33,

    b20 * a00 + b21 * a10 + b22 * a20 + b23 * a30,
    b20 * a01 + b21 * a11 + b22 * a21 + b23 * a31,
    b20 * a02 + b21 * a12 + b22 * a22 + b23 * a32,
    b20 * a03 + b21 * a13 + b22 * a23 + b23 * a33,

    b30 * a00 + b31 * a10 + b32 * a20 + b33 * a30,
    b30 * a01 + b31 * a11 + b32 * a21 + b33 * a31,
    b30 * a02 + b31 * a12 + b32 * a22 + b33 * a32,
    b30 * a03 + b31 * a13 + b32 * a23 + b33 * a33,
  ];
}
