/**
 * @typedef {[
 *  number, number, number, number, // column 1
 *  number, number, number, number, // column 2
 *  number, number, number, number, // column 3
 *  number, number, number, number, // column 4
 * ]} Matrix
 *
 * @typedef {[number, number, number, number]} Quaternion
 */

/** @type {Matrix} */
export const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** @type {Quaternion} */
export const identityQuaternion = [0, 0, 0, 1];

/**
 * @param {number} angle
 * @param {0 | 1 | 2} axis 0 = x, 1 = y, 2 = z
 *
 * @returns {Quaternion}
 */
export function angleToQuaternion(angle, axis) {
  const halfAngle = angle / 2;

  /** @type {Quaternion} */
  const q = [0, 0, 0, Math.cos(halfAngle)];

  q[axis] = Math.sin(halfAngle);

  return q;
}

/**
 * Create a quaternion from Euler angles (X-Y-Z order)
 * @param {number} rotateX - Radians
 * @param {number} rotateY - Radians
 * @param {number} rotateZ - Radians
 * @returns {Quaternion}
 */
export function quaternionFromEuler(rotateX, rotateY, rotateZ) {
  const cx = Math.cos(rotateX / 2);
  const cy = Math.cos(rotateY / 2);
  const cz = Math.cos(rotateZ / 2);
  const sx = Math.sin(rotateX / 2);
  const sy = Math.sin(rotateY / 2);
  const sz = Math.sin(rotateZ / 2);

  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
}

/**
 * @param {Quaternion} a
 * @param {Quaternion} b
 * @returns {Quaternion}
 */
export function multiplyQuaternion(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;

  return [
    ax * bw + aw * bx + ay * bz - az * by,
    ay * bw + aw * by + az * bx - ax * bz,
    az * bw + aw * bz + ax * by - ay * bx,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/**
 * Convert quaternion to rotation matrix
 * @param {Quaternion} q
 * @returns {Matrix}
 */
export function fromQuaternion(q) {
  const [x, y, z, w] = q;

  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;

  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return [
    1 - (yy + zz),
    xy + wz,
    xz - wy,
    0,
    xy - wz,
    1 - (xx + zz),
    yz + wx,
    0,
    xz + wy,
    yz - wx,
    1 - (xx + yy),
    0,
    0,
    0,
    0,
    1,
  ];
}

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
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @param {number} e
 * @param {number} f
 * @param {number} g
 * @param {number} h
 * @param {number} i
 */
export function determinant(a, b, c, d, e, f, g, h, i) {
  return a * e * i + b * f * g + c * d * h - c * e * g - b * d * i - a * f * h;
}

/**
 *
 * @param {Matrix} a
 * @param {Matrix} b
 *
 * @returns {Matrix}
 */
export function multiply(a, b) {
  if (a === identity) {
    return b;
  }

  if (b === identity) {
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
