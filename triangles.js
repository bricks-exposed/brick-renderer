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

import { topologicalSort } from "./topological-sort.js";

/**
 * @template {(Triangle | Line)} T
 * @param {T[]} geometry
 * @returns {T[]}
 */
export function depthSortTrianglesAndLines(geometry) {
  const out = geometry.map(function (t) {
    return isTriangle(t)
      ? {
          ...t,
          isTriangle: /** @type {const} */ (true),
          boundingBox: boundingBox(t),
          plane: getPlane(t),
        }
      : {
          ...t,
          isTriangle: /** @type {const} */ (false),
          boundingBox: boundingBox(t),
        };
  });

  /** @type {Map<T, Set<T>>} */
  const edges = new Map();

  for (const geometry of out) {
    edges.set(geometry, new Set());
  }

  for (let i = 0; i < out.length; i++) {
    const a = out[i];

    for (let j = i + 1; j < out.length; j++) {
      const b = out[j];

      // No need to sort two lines
      // (assuming they're the same color)
      if (!a.isTriangle && !b.isTriangle) {
        continue;
      }

      // The two geometries definitely don't overlap
      // as their rectangular bounding boxes don't
      // so we don't need to sort them.
      // This is faster than checking if the geometries
      // themselves overlap.
      if (!boundsOverlap(a.boundingBox, b.boundingBox)) {
        continue;
      }

      /**
       * @param {number} direction
       */
      function draw(direction) {
        return direction === -1
          ? edges.get(b)?.add(a)
          : direction === 1
          ? edges.get(a)?.add(b)
          : false;
      }

      // Compare two triangles
      if (a.isTriangle && b.isTriangle) {
        const overlap = trianglesOverlap(a, b);

        if (!overlap) {
          continue;
        }

        const bSideOfA = compareSideOfPlaneToCamera(a.plane, b);

        if (bSideOfA) {
          draw(bSideOfA);
          continue;
        }

        const aSideOfB = compareSideOfPlaneToCamera(b.plane, a);

        if (aSideOfB) {
          draw(-1 * aSideOfB);
          continue;
        }
      } else if (a.isTriangle || b.isTriangle) {
        const line = a.isTriangle ? b : a;
        const direction = a.isTriangle ? 1 : -1;

        let triangle;
        if (a.isTriangle) {
          triangle = a;
        } else if (b.isTriangle) {
          triangle = b;
        } else {
          throw new Error();
        }

        const overlap = lineTriangleOverlap(line, triangle);

        if (overlap === false) {
          continue;
        }

        const boundingBox = zOverlap(a.boundingBox, b.boundingBox);

        if (boundingBox) {
          draw(boundingBox);
          continue;
        }

        if (overlap) {
          draw(direction * overlap);
          continue;
        }

        // If the line is coplanar with the triangle,
        // draw it on top so edges are clear.
        draw(direction);
      }
    }
  }

  const sorted = topologicalSort(edges, out.length);

  return sorted;
}

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
 * @param {Triangle | Line} geometry
 *
 * @returns {geometry is Triangle}
 */
function isTriangle(geometry) {
  return "p3" in geometry;
}

/**
 *
 * @param {BoundingBox} a
 * @param {BoundingBox} b
 */
function zOverlap(a, b) {
  if (a.minZ > b.maxZ) {
    return -1;
  }

  if (b.minZ > a.maxZ) {
    return 1;
  }

  return false;
}

/**
 * Check if a line and triangle overlap in 2D (XY projection)
 * @param {Line} line
 * @param {Triangle & { plane: Plane }} triangle
 */
function lineTriangleOverlap(line, triangle) {
  const p1Side =
    pointInTriangle(line.p1, triangle) &&
    pointSideOfPlane(triangle.plane, line.p1);
  if (p1Side) {
    return p1Side;
  }

  const p2Side =
    pointInTriangle(line.p2, triangle) &&
    pointSideOfPlane(triangle.plane, line.p2);
  if (p2Side) {
    return p2Side;
  }

  // Check if the line intersects any edge of the triangle
  const edges = [
    [triangle.p1, triangle.p2],
    [triangle.p2, triangle.p3],
    [triangle.p3, triangle.p1],
  ];

  let coplanarIntersection = false;

  for (const [e1, e2] of edges) {
    const overlap = lineIntersectionPoint2d(line.p1, line.p2, e1, e2);

    if (!overlap) {
      continue;
    }

    const [x, y] = overlap;

    // Ignore intersections that are just the line ending points
    // as those are covered by the above checks
    if (
      (x === line.p1[0] && y === line.p1[1]) ||
      x === line.p2[0] ||
      y === line.p2[0]
    ) {
      continue;
    }

    const intersection = pointOnLine(line, x, y);
    const side = pointSideOfPlane(triangle.plane, intersection);

    if (side === 0) {
      coplanarIntersection = true;
      continue;
    }

    // If an intersection point is definitively on one side of the triangle,
    // use that and ignore the other points even if they're coplanar.
    return side;
  }

  const side = compareSideOfPlaneToCamera(triangle.plane, line);

  const pointsOnTriangleCoplanar =
    (p2Side === 0 && !p1Side) || (p1Side === 0 && !p2Side);

  const coplanar =
    (pointsOnTriangleCoplanar || coplanarIntersection) && side === 0;

  return coplanar ? 0 : false;
}

/**
 * @param {Line} line
 * @param {number} x
 * @param {number} y
 *
 * @returns {Vertex}
 */
function pointOnLine(line, x, y) {
  const [x1, y1, z1] = line.p1;
  const [x2, y2, z2] = line.p2;

  const t = x2 - x1 === 0 ? (y - y1) / (y2 - y1) : (x - x1) / (x2 - x1);

  const zOfLineAtPoint = t * (z2 - z1) + z1;

  return [x, y, zOfLineAtPoint];
}

/**
 * @param {Vertex} point
 * @param {Triangle} triangle
 */
function pointInTriangle(point, { p1, p2, p3 }) {
  const d1 = crossSign(point, p1, p2);
  const d2 = crossSign(point, p2, p3);
  const d3 = crossSign(point, p3, p1);

  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

  return !(hasNeg && hasPos);
}

/**
 * @param {Vertex} p1
 * @param {Vertex} p2
 * @param {Vertex} p3
 */
function crossSign(p1, p2, p3) {
  return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
}

/**
 * https://en.wikipedia.org/wiki/Line–line_intersection#Given_two_points_on_each_line
 *
 * @param {Vertex} p1
 * @param {Vertex} p2
 * @param {Vertex} p3
 * @param {Vertex} p4
 */
function lineIntersectionPoint2d([x1, y1], [x2, y2], [x3, y3], [x4, y4]) {
  const tNumerator = (x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4);

  const uNumerator = -1 * ((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3));

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  const t = tNumerator / denominator;

  const u = uNumerator / denominator;

  const tIntersects = 0 <= t && t <= 1;

  const uIntersects = 0 <= u && u <= 1;

  if (tIntersects && uIntersects) {
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }

  return null;
}

/**
 * Adapted from https://rosettacode.org/wiki/Determine_if_two_triangles_overlap
 *
 * @param {Triangle & { boundingBox: BoundingBox }} a
 * @param {Triangle & { boundingBox: BoundingBox }} b
 */
function trianglesOverlap(a, b) {
  const triangles = [
    [a.p1, a.p3, a.p2], // Switch winding for this algorithm
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

  // Check z overlap after the geometry overlap, as
  // two overlapping z geometries shouldn't be sorted
  // unless they overlap in XY. Not just for performance —
  // it could cause a cycle in the graph.
  return zOverlap(a.boundingBox, b.boundingBox);
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
 * @param {Plane} plane
 * @param {Triangle | Line} triangle
 *
 * @returns {0 | 1 | -1 | false}
 */
function compareSideOfPlaneToCamera(plane, triangle) {
  const p1Sign = pointSideOfPlane(plane, triangle.p1);
  const p2Sign = pointSideOfPlane(plane, triangle.p2);
  const p3Sign =
    "p3" in triangle ? pointSideOfPlane(plane, triangle.p3) : undefined;

  const hasPositive = p1Sign === 1 || p2Sign === 1 || p3Sign === 1;
  const hasNegative = p1Sign === -1 || p2Sign === -1 || p3Sign === -1;

  // Triangle straddles the plane - can't determine order this way
  if (hasPositive && hasNegative) {
    return false;
  }

  // All on plane (coplanar)
  if (!hasPositive && !hasNegative) {
    return 0;
  }

  return hasPositive ? 1 : -1;
}

/**
 *
 * @param {Plane} plane
 * @param {Vertex} point
 */
function pointSideOfPlane(plane, point) {
  const [a, b, c, d] = plane;
  const p1Side = a * point[0] + b * point[1] + c * point[2] + d;

  // The plane normal is (a, b, c).
  // "Toward camera" in orthographic looking down +Z is the direction (0, 0, 1).
  // The positive side of the plane is in the direction of the normal.
  // If c > 0, positive side is toward +Z (camera).
  // If c < 0, negative side is toward +Z (camera).
  const cameraSideSign = Math.sign(c);

  const side = epsilonSign(p1Side);

  if (side === 0) {
    return 0;
  }

  if (side === cameraSideSign) {
    return 1; // point is on camera side of plane
  } else {
    return -1; // point is on far side of plane
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
 * @param {Triangle | Line} geometry
 *
 * @returns {BoundingBox}
 */
function boundingBox(geometry) {
  const { p1, p2 } = geometry;
  const p3 = isTriangle(geometry) ? geometry.p3 : undefined;
  const minX = Math.min(p1[0], p2[0], p3?.[0] ?? Number.POSITIVE_INFINITY);
  const maxX = Math.max(p1[0], p2[0], p3?.[0] ?? Number.NEGATIVE_INFINITY);
  const minY = Math.min(p1[1], p2[1], p3?.[1] ?? Number.POSITIVE_INFINITY);
  const maxY = Math.max(p1[1], p2[1], p3?.[1] ?? Number.NEGATIVE_INFINITY);
  const minZ = Math.min(p1[2], p2[2], p3?.[2] ?? Number.POSITIVE_INFINITY);
  const maxZ = Math.max(p1[2], p2[2], p3?.[2] ?? Number.NEGATIVE_INFINITY);

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
