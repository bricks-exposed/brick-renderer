/**
 * @typedef {{ x: number; y: number; z: number }} Vertex
 * @typedef {{ p1: Vertex; p2: Vertex; p3: Vertex; colorCode: number }} Triangle
 *
 * @typedef {{
 *   minX: number;
 *   minY: number;
 *   maxX: number;
 *   maxY: number;
 *   minZ: number;
 *   maxZ: number;
 *   centroid: number;
 * }} BoundingBox
 *
 * @typedef {Triangle & {
 *   boundingBox: BoundingBox;
 *   plane: Plane;
 * }} TriangleData
 *
 * @typedef {{ x: number; y: number }} Point2
 * @typedef {[number, number, number, number]} Plane
 */

const EPSILON = 1e-10;

/**
 * Sort triangles using BSP tree (handles all cases, no cycles)
 * @param {Triangle[]} triangles
 * @returns {Triangle[]}
 */
export function sortWithBSP(triangles) {
  const bsp = buildBSP(triangles);

  /** @type {Triangle[]} */
  const result = [];
  traverseBSPBackToFront(bsp, result);

  return result;
}

/**
 * Classify a point relative to a plane
 * @param {Plane} plane
 * @param {Vertex} point
 * @returns {number} 1 = front (positive), -1 = back (negative), 0 = on plane
 */
function classifyPoint(plane, point) {
  const [a, b, c, d] = plane;
  const distance = a * point.x + b * point.y + c * point.z + d;
  if (distance > EPSILON) return 1;
  if (distance < -EPSILON) return -1;
  return 0;
}

/**
 * Compute intersection point of an edge with a plane
 * @param {Plane} plane
 * @param {Vertex} p1 - Start point
 * @param {Vertex} p2 - End point
 * @returns {Vertex}
 */
function planeEdgeIntersection(plane, p1, p2) {
  const [a, b, c, d] = plane;

  // Distance from each point to the plane
  const d1 = a * p1.x + b * p1.y + c * p1.z + d;
  const d2 = a * p2.x + b * p2.y + c * p2.z + d;

  // Parameter t where the line crosses the plane
  const t = d1 / (d1 - d2);

  return {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
    z: p1.z + t * (p2.z - p1.z),
  };
}

/**
 * Split a triangle by a plane
 * @param {Triangle} triangle
 * @param {Plane} plane
 * @returns {{ front: Triangle[]; back: Triangle[]; onPlane: Triangle[] }}
 */
function splitTriangle(triangle, plane) {
  const { p1, p2, p3, colorCode } = triangle;

  const c1 = classifyPoint(plane, p1);
  const c2 = classifyPoint(plane, p2);
  const c3 = classifyPoint(plane, p3);

  const points = [
    { vertex: p1, classification: c1 },
    { vertex: p2, classification: c2 },
    { vertex: p3, classification: c3 },
  ];

  const frontCount = points.filter((p) => p.classification === 1).length;
  const backCount = points.filter((p) => p.classification === -1).length;
  const onCount = points.filter((p) => p.classification === 0).length;

  // All on one side or on the plane
  if (backCount === 0 && onCount < 3) {
    return { front: [triangle], back: [], onPlane: [] };
  }
  if (frontCount === 0 && onCount < 3) {
    return { front: [], back: [triangle], onPlane: [] };
  }
  if (onCount === 3) {
    return { front: [], back: [], onPlane: [triangle] };
  }

  // Triangle straddles the plane - need to split
  const frontVerts = [];
  const backVerts = [];

  for (let i = 0; i < 3; i++) {
    const current = points[i];
    const next = points[(i + 1) % 3];

    // Add current vertex to appropriate list(s)
    if (current.classification === 1) {
      frontVerts.push(current.vertex);
    } else if (current.classification === -1) {
      backVerts.push(current.vertex);
    } else {
      // On the plane - add to both
      frontVerts.push(current.vertex);
      backVerts.push(current.vertex);
    }

    // Check if edge crosses the plane
    if (
      (current.classification === 1 && next.classification === -1) ||
      (current.classification === -1 && next.classification === 1)
    ) {
      const intersection = planeEdgeIntersection(
        plane,
        current.vertex,
        next.vertex
      );
      frontVerts.push(intersection);
      backVerts.push(intersection);
    }
  }

  // Convert vertex lists to triangles (triangulate if more than 3 vertices)
  const front = triangulatePolygon(frontVerts, colorCode);
  const back = triangulatePolygon(backVerts, colorCode);

  return { front, back, onPlane: [] };
}

/**
 * Convert a convex polygon (3-4 vertices) into triangles
 * @param {Vertex[]} vertices
 * @param {number} colorCode
 * @returns {Triangle[]}
 */
function triangulatePolygon(vertices, colorCode) {
  if (vertices.length < 3) return [];

  const triangles = [];

  // Fan triangulation from first vertex
  for (let i = 1; i < vertices.length - 1; i++) {
    triangles.push({
      p1: vertices[0],
      p2: vertices[i],
      p3: vertices[i + 1],
      colorCode,
    });
  }

  return triangles;
}

/**
 * Get the plane equation for a triangle
 * @param {Triangle} triangle
 * @returns {Plane}
 */
function getPlane({ p1, p2, p3 }) {
  const a = (p2.y - p1.y) * (p3.z - p1.z) - (p2.z - p1.z) * (p3.y - p1.y);
  const b = (p2.z - p1.z) * (p3.x - p1.x) - (p2.x - p1.x) * (p3.z - p1.z);
  const c = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const d = -(a * p1.x + b * p1.y + c * p1.z);

  // Normalize the plane equation for consistent comparisons
  const len = Math.sqrt(a * a + b * b + c * c);
  if (len < EPSILON) {
    // Degenerate triangle
    return [0, 0, 1, 0];
  }

  return [a / len, b / len, c / len, d / len];
}

/**
 * Compute bounding box for a triangle
 * @param {Triangle} triangle
 * @returns {BoundingBox}
 */
function boundingBox(triangle) {
  const minX = Math.min(triangle.p1.x, triangle.p2.x, triangle.p3.x);
  const maxX = Math.max(triangle.p1.x, triangle.p2.x, triangle.p3.x);
  const minY = Math.min(triangle.p1.y, triangle.p2.y, triangle.p3.y);
  const maxY = Math.max(triangle.p1.y, triangle.p2.y, triangle.p3.y);
  const minZ = Math.min(triangle.p1.z, triangle.p2.z, triangle.p3.z);
  const maxZ = Math.max(triangle.p1.z, triangle.p2.z, triangle.p3.z);
  const centroid = (triangle.p1.z + triangle.p2.z + triangle.p3.z) / 3;

  return { minX, maxX, minY, maxY, minZ, maxZ, centroid };
}

/**
 * Check if two bounding boxes overlap in X and Y
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

/**
 * BSP Tree Node
 * @typedef {{
 *   plane: Plane;
 *   triangles: Triangle[];
 *   front: BSPNode | null;
 *   back: BSPNode | null;
 * }} BSPNode
 */

/**
 * Build a BSP tree from triangles
 * @param {Triangle[]} triangles
 * @returns {BSPNode | null}
 */
function buildBSP(triangles) {
  if (triangles.length === 0) return null;

  // Choose a splitting plane - use the first triangle's plane
  // (More sophisticated heuristics exist but this works for most cases)
  const splitter = triangles[0];
  const plane = getPlane(splitter);

  /** @type {Triangle[]} */
  const nodeTriangles = [];
  /** @type {Triangle[]} */
  const frontList = [];
  /** @type {Triangle[]} */
  const backList = [];

  for (const tri of triangles) {
    const { front, back, onPlane } = splitTriangle(tri, plane);

    nodeTriangles.push(...onPlane);
    frontList.push(...front);
    backList.push(...back);
  }

  // The splitter itself should be in nodeTriangles, but splitTriangle
  // might have put it in front. Let's handle this more carefully.
  // Actually, the splitter will be classified as "onPlane" since all its
  // vertices are on its own plane.

  return {
    plane,
    triangles: nodeTriangles,
    front: buildBSP(frontList),
    back: buildBSP(backList),
  };
}

/**
 * Traverse BSP tree in back-to-front order for a camera looking down +Z
 * @param {BSPNode | null} node
 * @param {Triangle[]} result
 */
function traverseBSPBackToFront(node, result) {
  if (!node) return;

  // Camera is on the back (negative) side
  // Draw front first, then node, then back
  traverseBSPBackToFront(node.front, result);
  result.push(...node.triangles);
  traverseBSPBackToFront(node.back, result);
}
