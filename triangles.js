import { topologicalSort } from "./topological-sort.js";

/**
 * @typedef {[number, number, number]} Vertex
 *
 * @typedef {{ p1: Vertex; p2: Vertex; }} Line
 *
 * @typedef {{
 *   p1: Vertex;
 *   p2: Vertex;
 *   p3: Vertex;
 * }} Triangle
 *
 * @typedef {{
 *   minX: number;
 *   minY: number;
 *   maxX: number;
 *   maxY: number;
 *   minZ: number;
 *   maxZ: number;
 * }} BoundingBox
 *
 * @typedef {[number, number, number, number]} Plane
 */

/**
 *
 * @param {Triangle} triangle
 */
export function isFrontFacing({ p1, p2, p3 }) {
  const ax = p1[0];
  const ay = p1[1];
  const bx = p2[0];
  const by = p2[1];
  const cx = p3[0];
  const cy = p3[1];

  const crossProductZ = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

  return crossProductZ < 0;
}

/**
 * @template {Triangle} T
 * @param {T[]} triangles
 * @returns {T[]}
 */
export function depthSortTriangles(triangles) {
  const out = triangles.map((t) => ({
    ...t,
    boundingBox: boundingBox(t),
    plane: getPlane(t),
  }));

  /** @type {Map<number, Set<number>>} */
  const edges = new Map();

  for (let i = 0; i < out.length; i++) {
    edges.set(i, new Set());
  }

  for (let i = 0; i < out.length; i++) {
    const a = out[i];

    for (let j = i + 1; j < out.length; j++) {
      const b = out[j];

      // The two triangles definitely don't overlap
      // as their rectangular bounding boxes don't
      // so we don't need to sort them.
      // This is faster than checking if the triangles
      // themselves overlap.
      if (!boundsOverlap(a.boundingBox, b.boundingBox)) {
        continue;
      }

      // The two triangles don't overlap
      // so we don't need to sort them.
      if (!trianglesOverlap(a, b)) {
        continue;
      }

      function drawABehindB() {
        edges.get(i)?.add(j);
      }
      function drawBBehindA() {
        edges.get(j)?.add(i);
      }

      // A is fully in front of B, so draw B first
      if (a.boundingBox.minZ > b.boundingBox.maxZ) {
        drawBBehindA();
        continue;
      }

      // B is fully in front of A, so draw A first
      if (b.boundingBox.minZ > a.boundingBox.maxZ) {
        drawABehindB();
        continue;
      }

      const aSideOfB = compareSideOfPlaneToCamera(b.plane, a);
      const bSideOfA = compareSideOfPlaneToCamera(a.plane, b);

      if (aSideOfB === 1 || bSideOfA === -1) {
        drawBBehindA();
        continue;
      }

      if (aSideOfB === -1 || bSideOfA === 1) {
        drawABehindB();
        continue;
      }
    }
  }

  const sorted = topologicalSort(edges, out.length);

  return sorted.map((i) => triangles[i]);
}

/**
 * Adapted from https://rosettacode.org/wiki/Determine_if_two_triangles_overlap
 *
 * @param {Triangle} a
 * @param {Triangle} b
 */
function trianglesOverlap(a, b) {
  const triangles = [
    [a.p1, a.p3, a.p2],
    [b.p1, b.p3, b.p2],
  ];

  for (let t = 0; t < 2; t++) {
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;

      const thisTriangle = triangles[t];
      const otherTriangle = triangles[(t + 1) % 2];

      const tests = [
        [thisTriangle[i], thisTriangle[j], otherTriangle[0]],
        [thisTriangle[i], thisTriangle[j], otherTriangle[1]],
        [thisTriangle[i], thisTriangle[j], otherTriangle[2]],
      ];

      if (tests.every(collision)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * @param {number[][]} triangle
 */
function collision([p1, p2, p3]) {
  return (
    Number.EPSILON >
    p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1])
  );
}

/**
 *
 * @param {Plane} plane
 * @param {Triangle} triangle
 */
function compareSideOfPlaneToCamera([a, b, c, d], triangle) {
  const p1Side =
    a * triangle.p1[0] + b * triangle.p1[1] + c * triangle.p1[2] + d;
  const p2Side =
    a * triangle.p2[0] + b * triangle.p2[1] + c * triangle.p2[2] + d;
  const p3Side =
    a * triangle.p3[0] + b * triangle.p3[1] + c * triangle.p3[2] + d;

  const p1Sign = epsilonSign(p1Side);
  const p2Sign = epsilonSign(p2Side);
  const p3Sign = epsilonSign(p3Side);

  const hasPositive = p1Sign === 1 || p2Sign === 1 || p3Sign === 1;
  const hasNegative = p1Sign === -1 || p2Sign === -1 || p3Sign === -1;

  // Triangle straddles the plane - can't determine order this way
  if (hasPositive && hasNegative) {
    return NaN;
  }

  // All on plane (coplanar)
  if (!hasPositive && !hasNegative) {
    return 0;
  }

  const side = hasPositive ? 1 : -1;

  // The plane normal is (a, b, c).
  // "Toward camera" in orthographic looking down +Z is the direction (0, 0, 1).
  // The positive side of the plane is in the direction of the normal.
  // If c > 0, positive side is toward +Z (camera).
  // If c < 0, negative side is toward +Z (camera).
  const cameraSideSign = Math.sign(c);

  if (side === cameraSideSign) {
    return 1; // Triangle is on camera side of plane
  } else {
    return -1; // Triangle is on far side of plane
  }
}

/**
 * @param {number} number
 */
function epsilonSign(number) {
  const epsilon = 1e-10;
  return number > epsilon ? 1 : number < -epsilon ? -1 : 0;
}

/**
 * @param {Triangle} triangle
 *
 * @returns {Plane}
 */
function getPlane({ p1, p2, p3 }) {
  const a =
    (p2[1] - p1[1]) * (p3[2] - p1[2]) - (p2[2] - p1[2]) * (p3[1] - p1[1]);
  const b =
    (p2[2] - p1[2]) * (p3[0] - p1[0]) - (p2[0] - p1[0]) * (p3[2] - p1[2]);
  const c =
    (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
  const d = -(a * p1[0] + b * p1[1] + c * p1[2]);

  return [a, b, c, d];
}

/**
 * @param {Triangle} triangle
 *
 * @returns {BoundingBox}
 */
function boundingBox({ p1, p2, p3 }) {
  const minX = Math.min(p1[0], p2[0], p3[0]);
  const maxX = Math.max(p1[0], p2[0], p3[0]);
  const minY = Math.min(p1[1], p2[1], p3[1]);
  const maxY = Math.max(p1[1], p2[1], p3[1]);
  const minZ = Math.min(p1[2], p2[2], p3[2]);
  const maxZ = Math.max(p1[2], p2[2], p3[2]);

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * @param {BoundingBox} a
 * @param {BoundingBox} b
 */
function boundsOverlap(a, b) {
  return !(
    a.maxX < b.minX ||
    b.maxX < a.minX ||
    a.maxY < b.minY ||
    b.maxY < a.minY
  );
}
