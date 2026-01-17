/**
 * Triangle sorting for LDraw SVG rendering
 * Conservative version - limits splitting to avoid triangle explosion
 */

const EPSILON = 1e-8;

/**
 * @typedef {{ x: number; y: number; z: number }} Vertex
 * @typedef {{ p1: Vertex; p2: Vertex; p3: Vertex; colorCode: number }} Triangle
 * @typedef {[number, number, number, number]} Plane
 */

// ============================================================
// Core geometry functions
// ============================================================

function getPlane({ p1, p2, p3 }) {
  const ax = p2.x - p1.x,
    ay = p2.y - p1.y,
    az = p2.z - p1.z;
  const bx = p3.x - p1.x,
    by = p3.y - p1.y,
    bz = p3.z - p1.z;

  const a = ay * bz - az * by;
  const b = az * bx - ax * bz;
  const c = ax * by - ay * bx;
  const len = Math.sqrt(a * a + b * b + c * c);

  if (len < EPSILON) return [0, 0, 1, 0];

  const na = a / len,
    nb = b / len,
    nc = c / len;
  return [na, nb, nc, -(na * p1.x + nb * p1.y + nc * p1.z)];
}

function classifyPoint([a, b, c, d], point) {
  const dist = a * point.x + b * point.y + c * point.z + d;
  if (dist > EPSILON) return 1;
  if (dist < -EPSILON) return -1;
  return 0;
}

function classifyTriangle(plane, tri) {
  const c1 = classifyPoint(plane, tri.p1);
  const c2 = classifyPoint(plane, tri.p2);
  const c3 = classifyPoint(plane, tri.p3);

  const pos = (c1 === 1) + (c2 === 1) + (c3 === 1);
  const neg = (c1 === -1) + (c2 === -1) + (c3 === -1);

  if (pos > 0 && neg > 0) return { side: 0, straddles: true };
  if (pos > 0) return { side: 1, straddles: false };
  if (neg > 0) return { side: -1, straddles: false };
  return { side: 0, straddles: false };
}

function linePlaneIntersection([a, b, c, d], p1, p2) {
  const d1 = a * p1.x + b * p1.y + c * p1.z + d;
  const d2 = a * p2.x + b * p2.y + c * p2.z + d;
  const denom = d1 - d2;

  if (Math.abs(denom) < EPSILON) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, z: (p1.z + p2.z) / 2 };
  }

  const t = d1 / denom;
  return {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
    z: p1.z + t * (p2.z - p1.z),
  };
}

function splitTriangle(tri, plane) {
  const points = [
    { v: tri.p1, c: classifyPoint(plane, tri.p1) },
    { v: tri.p2, c: classifyPoint(plane, tri.p2) },
    { v: tri.p3, c: classifyPoint(plane, tri.p3) },
  ];

  const front = [],
    back = [];

  for (let i = 0; i < 3; i++) {
    const curr = points[i];
    const next = points[(i + 1) % 3];

    if (curr.c >= 0) front.push(curr.v);
    if (curr.c <= 0) back.push(curr.v);

    if ((curr.c === 1 && next.c === -1) || (curr.c === -1 && next.c === 1)) {
      const inter = linePlaneIntersection(plane, curr.v, next.v);
      front.push(inter);
      back.push(inter);
    }
  }

  return {
    front: triangulate(front, tri.colorCode),
    back: triangulate(back, tri.colorCode),
  };
}

function triangulate(verts, colorCode) {
  if (verts.length < 3) return [];
  const tris = [];
  for (let i = 1; i < verts.length - 1; i++) {
    tris.push({ p1: verts[0], p2: verts[i], p3: verts[i + 1], colorCode });
  }
  return tris;
}

/**
 * @param {Triangle} triangle
 */
function centroidZ({ p1, p2, p3 }) {
  return (p1.z + p2.z + p3.z) / 3;
}

/**
 * @param {Triangle[]} triangles
 */
function sortByZ(triangles) {
  return [...triangles].sort((a, b) => centroidZ(a) - centroidZ(b));
}

// ============================================================
// Option 1: Simple Z-sort (no splitting, fastest)
// ============================================================

// ============================================================
// Option 2: Limited BSP (caps triangle growth)
// ============================================================

class BSPNode {
  constructor() {
    this.plane = null;
    this.triangles = [];
    this.front = null;
    this.back = null;
  }
}

function scorePlane(plane, triangles) {
  let front = 0,
    back = 0,
    split = 0;

  for (const tri of triangles) {
    const { side, straddles } = classifyTriangle(plane, tri);
    if (straddles) split++;
    else if (side > 0) front++;
    else back++;
  }

  return { front, back, split, score: split * 10 + Math.abs(front - back) };
}

/**
 * BSP with strict limits on splitting
 * @param {Triangle[]} triangles
 * @param {number} maxTriangles - Stop splitting if we'd exceed this
 * @param {number} maxGrowthRatio - Stop if triangles would grow by more than this ratio
 */
function sortLimitedBSP(
  triangles,
  maxTriangles = Infinity,
  maxGrowthRatio = 1.5
) {
  const originalCount = triangles.length;
  const maxAllowed = Math.min(
    maxTriangles,
    Math.floor(originalCount * maxGrowthRatio)
  );

  let currentCount = originalCount;

  function buildBSP(tris, depth) {
    if (tris.length === 0) return null;

    const node = new BSPNode();

    // Stop conditions
    if (tris.length <= 3 || depth > 30) {
      node.triangles = sortByZ(tris);
      return node;
    }

    // Find best splitting plane (sample fewer for speed)
    let bestPlane = null;
    let bestScore = Infinity;
    let bestSplit = Infinity;

    const step = Math.max(1, Math.floor(tris.length / 10));
    for (let i = 0; i < tris.length; i += step) {
      const plane = getPlane(tris[i]);
      if (Math.abs(plane[2]) < 0.1) continue;

      const { score, split } = scorePlane(plane, tris);
      if (score < bestScore) {
        bestScore = score;
        bestSplit = split;
        bestPlane = plane;
      }
    }

    // Check if splitting would exceed our limit
    const projectedCount = currentCount + bestSplit; // Each split adds ~1 triangle
    if (
      !bestPlane ||
      projectedCount > maxAllowed ||
      bestSplit > tris.length * 0.3
    ) {
      // Too many splits - just Z-sort this group
      node.triangles = sortByZ(tris);
      return node;
    }

    currentCount += bestSplit;
    node.plane = bestPlane;

    const frontList = [],
      backList = [];

    for (const tri of tris) {
      const { side, straddles } = classifyTriangle(bestPlane, tri);

      if (straddles) {
        const { front, back } = splitTriangle(tri, bestPlane);
        frontList.push(...front);
        backList.push(...back);
      } else if (side > 0) {
        frontList.push(tri);
      } else if (side < 0) {
        backList.push(tri);
      } else {
        node.triangles.push(tri);
      }
    }

    node.triangles = sortByZ(node.triangles);
    node.front = buildBSP(frontList, depth + 1);
    node.back = buildBSP(backList, depth + 1);

    return node;
  }

  function traverse(node, result) {
    if (!node) return;
    if (!node.plane) {
      result.push(...node.triangles);
      return;
    }

    if (node.plane[2] > 0) {
      traverse(node.back, result);
      result.push(...node.triangles);
      traverse(node.front, result);
    } else {
      traverse(node.front, result);
      result.push(...node.triangles);
      traverse(node.back, result);
    }
  }

  const bsp = buildBSP(triangles, 0);
  const result = [];
  traverse(bsp, result);
  return result;
}

// ============================================================
// Main export - choose your strategy
// ============================================================

/**
 * Sort triangles for painter's algorithm
 *
 * @param {Triangle[]} triangles
 * @param {Object} options
 * @param {'simple' | 'topological' | 'bsp'} options.method - Sorting method
 * @param {number} options.maxGrowthRatio - For BSP: max triangle growth (default 1.3)
 */
export function sort(
  triangles,
  { method, maxGrowthRatio } = { method: "topological", maxGrowthRatio: 1.3 }
) {
  return sortLimitedBSP(triangles, Infinity, maxGrowthRatio);
}
