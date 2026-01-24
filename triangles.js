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

import { topoSortWithSCC } from "./topological-sort.js";

/**
 * @template {(Triangle | Line)} T
 * @param {T[]} geometry
 * @returns {[T, number][]}
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

  /** @type {Map<number, Set<number>>} */
  const edges = new Map();

  for (let i = 0; i < out.length; i++) {
    edges.set(i, new Set());
  }

  const L_INDEX = 58;
  const T_INDEX = 8;

  for (let i = 0; i < out.length; i++) {
    const a = out[i];

    if (i === L_INDEX) {
      // @ts-ignore
      a.colorCode = 2;
    }
    if (i === T_INDEX) {
      // @ts-ignore
      a.colorCode = 3;
    }

    // console.assert(
    //   a.p1[1] !== 0.9727835860725456 || a.p2[1] !== 0.7499470291701398,
    //   i
    // );

    for (let j = i + 1; j < out.length; j++) {
      const b = out[j];

      const shouldLog = // i === L_INDEX || j === L_INDEX;
        false &&
        i === Math.min(T_INDEX, L_INDEX) &&
        j === Math.max(T_INDEX, L_INDEX);

      if (!a.isTriangle && !b.isTriangle) {
        continue;
      }

      if (shouldLog && i === T_INDEX && j === L_INDEX) {
        console.log(a);
        console.log(b);

        // @ts-ignore
        // console.log(compareSideOfPlaneToCamera(a.plane, b, shouldLog));
        // // @ts-ignore
        // console.log(compareSideOfPlaneToCamera(b.plane, a, shouldLog));
      }

      // The two triangles definitely don't overlap
      // as their rectangular bounding boxes don't
      // so we don't need to sort them.
      // This is faster than checking if the triangles
      // themselves overlap.
      if (!boundsOverlap(a.boundingBox, b.boundingBox)) {
        console.assert(!shouldLog, "Bounds do not overlap");
        continue;
      }

      function drawABehindB() {
        console.assert(!shouldLog, "drawing a behind b", i, j);
        edges.get(i)?.add(j);
      }

      function drawBBehindA() {
        console.assert(!shouldLog, "drawing b behind a", i, j);
        edges.get(j)?.add(i);
      }

      /**
       * @param {number} direction
       */
      function draw(direction) {
        return direction === -1
          ? drawBBehindA()
          : direction === 1
          ? drawABehindB()
          : false;
      }

      // Compare two triangles
      if (a.isTriangle && b.isTriangle) {
        const overlap = trianglesOverlap(a, b);

        if (!overlap) {
          continue;
        }

        const boundingBox = boundingBoxesOverlap(a.boundingBox, b.boundingBox);

        if (boundingBox) {
          draw(boundingBox);
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

        console.error("hmmmm, coplanar");
      } else if (a.isTriangle || b.isTriangle) {
        const line = a.isTriangle ? b : a;

        let triangle;
        if (a.isTriangle) {
          triangle = a;
        } else if (b.isTriangle) {
          triangle = b;
        } else {
          throw new Error();
        }

        const overlap = lineTriangleOverlap(line, triangle, shouldLog);

        if (overlap === false) {
          console.assert(!shouldLog, "they do not overlap");
          continue;
        }

        const boundingBox = boundingBoxesOverlap(a.boundingBox, b.boundingBox);

        if (boundingBox) {
          console.assert(!shouldLog, "bounding box", boundingBox);
          draw(boundingBox);
          continue;
        }

        const direction = a.isTriangle ? 1 : -1;

        if (overlap) {
          console.assert(!shouldLog, "overlap", overlap, i, j);
          draw(direction * overlap);
          continue;
        }

        console.assert(!shouldLog, "coplanar");
        // console.warn("coplanar line");
        draw(direction);
      } else {
        // Two lines don't need to be ordered
        continue;
      }
    }
  }

  for (const [edge, targets] of edges) {
    if (
      true ||
      edge === T_INDEX ||
      edge === L_INDEX ||
      targets.has(T_INDEX) ||
      targets.has(L_INDEX)
    ) {
      // console.log(`${edge} -> ${[...targets]}`);
    }
  }

  const sorted = topoSortWithSCC(edges, out.length);

  return sorted.map((i) => [out[i], i]);
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
function boundingBoxesOverlap(a, b) {
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
function lineTriangleOverlap(line, triangle, log = false) {
  const p1Side =
    pointInTriangle(line.p1, triangle) &&
    pointSideOfPlane(triangle.plane, line.p1);
  if (log) {
    console.error({ p1Side });
  }
  if (p1Side) {
    return p1Side;
  }

  const p2Side =
    pointInTriangle(line.p2, triangle) &&
    pointSideOfPlane(triangle.plane, line.p2);
  if (log) {
    console.error({ p2Side });
  }

  if (p2Side) {
    return p2Side;
  }

  // Check if the line intersects any edge of the triangle
  const edges = [
    [triangle.p1, triangle.p2],
    [triangle.p2, triangle.p3],
    [triangle.p3, triangle.p1],
  ];

  const coplanar2 = [];

  for (const [e1, e2] of edges) {
    const overlap = lineIntersectionPoint2d(line.p1, line.p2, e1, e2, log);

    if (!overlap) {
      continue;
    }

    const [x, y] = overlap;

    const [x1, y1, z1] = line.p1;
    const [x2, y2, z2] = line.p2;

    const t = x2 - x1 === 0 ? (y - y1) / (y2 - y1) : (x - x1) / (x2 - x1);

    const zOfLineAtPoint = t * (z2 - z1) + z1;

    const intersectionPoint = [x, y, zOfLineAtPoint];

    if (
      (x === line.p1[0] && y === line.p1[1]) ||
      x === line.p2[0] ||
      y === line.p2[0]
    ) {
      continue;
    }

    if (log) {
      console.error(overlap, x, y, zOfLineAtPoint);
      console.error(pointSideOfPlane(triangle.plane, [x, y, zOfLineAtPoint]));
    }

    const side = pointSideOfPlane(triangle.plane, [x, y, zOfLineAtPoint]);

    coplanar2.push([[x, y, zOfLineAtPoint], side === 0]);
    if (side === 0) {
      continue;
    }
    return side;
  }
  const side = compareSideOfPlaneToCamera(triangle.plane, line);

  const intersectionsOnTriangle = coplanar2.length && coplanar2.every((b) => b);

  const pointsOnTriangleCoplanar =
    (p2Side === 0 && !p1Side) || (p1Side === 0 && !p2Side);

  const coplanar =
    (pointsOnTriangleCoplanar || intersectionsOnTriangle) && side === 0;

  if (log) {
    console.log({
      coplanar,
      pointsOnTriangleCoplanar,
      coplanar2,
      intersectionsOnTriangle,
      side,
    });
  }

  return coplanar ? 0 : false;
}

/**
 * Check if a point is inside a triangle (2D, XY projection)
 * @param {Vertex} point
 * @param {Triangle} triangle
 * @returns {boolean}
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
function lineIntersectionPoint2d(
  [x1, y1],
  [x2, y2],
  [x3, y3],
  [x4, y4],
  log = false
) {
  const tNumerator = (x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4);

  const uNumerator = -1 * ((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3));

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  const t = tNumerator / denominator;

  const u = uNumerator / denominator;

  const tIntersects = 0 <= t && t <= 1;

  const uIntersects = 0 <= u && u <= 1;

  if (log) {
    console.error({
      tNumerator,
      uNumerator,
      denominator,
      t,
      u,
      tIntersects,
      uIntersects,
    });
  }

  if (tIntersects && uIntersects) {
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  }

  return null;
}

/**
 * Check if two line segments intersect in 2D
 * @param {Vertex} a1
 * @param {Vertex} a2
 * @param {Vertex} b1
 * @param {Vertex} b2
 */
function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = crossSign(a1, b1, b2);
  const d2 = crossSign(a2, b1, b2);
  const d3 = crossSign(b1, a1, a2);
  const d4 = crossSign(b2, a1, a2);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }

  return false;
}

/**
 * Adapted from https://rosettacode.org/wiki/Determine_if_two_triangles_overlap
 *
 * @param {Triangle} a
 * @param {Triangle} b
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
 * Get the point where a line crosses a plane
 * @param {Line} line
 * @param {Plane} plane
 * @returns {Vertex | null} The intersection point, or null if no intersection
 */
function linePlaneIntersection(line, plane) {
  const [a, b, c, d] = plane;
  const { p1, p2 } = line;

  // Direction vector of the line
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const dz = p2[2] - p1[2];

  // Check if line is parallel to plane
  const denominator = a * dx + b * dy + c * dz;
  if (Math.abs(denominator) < 1e-10) {
    return null; // Line is parallel to plane
  }

  // Calculate parameter t for the intersection point
  const t = -(a * p1[0] + b * p1[1] + c * p1[2] + d) / denominator;

  // Calculate intersection point
  const x = p1[0] + t * dx;
  const y = p1[1] + t * dy;
  const z = p1[2] + t * dz;

  return [x, y, z];
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
