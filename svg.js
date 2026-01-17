import { Loader } from "./part-loader-worker.js";
import { Model } from "./model.js";
import { Color } from "./ldraw.js";
import { Transformation } from "./transformation.js";
import { orbitControls } from "./orbit.js";

const worker = new Worker(new URL("part-worker.js", import.meta.url), {
  type: "module",
  name: "part-loader-worker",
});

const loader = new Loader(worker);

const colors = await loader.initialize();

Model.loader = loader;

/**
 * @param {string} fileName
 */
export async function createSvg(fileName) {
  const defaultColor = Color.custom("#e04d4d");
  const model = await Model.for(fileName, defaultColor);

  const transformation = new Transformation();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttributeNS(null, "viewBox", `-1 -1 2 2`);

  render(svg, model, transformation);

  orbitControls(svg, transformation, () => render(svg, model, transformation));

  return svg;
}

/**
 *
 * @param {SVGSVGElement} svg
 * @param {Model} model
 * @param {Transformation} transformation
 */
function render(svg, model, transformation) {
  const [a, b, c, , d, e, f, , g, h, ii, , tx, ty, tz] =
    model.matrix(transformation);

  const lines = getLines(
    model.geometry.lines,
    a,
    b,
    c,
    d,
    e,
    f,
    g,
    h,
    ii,
    tx,
    ty,
    tz
  );

  const triangles = getTriangles(
    model.geometry.triangles,
    a,
    b,
    c,
    d,
    e,
    f,
    g,
    h,
    ii,
    tx,
    ty,
    tz
  );
  console.log(triangles.length, lines.length);

  const contents = [...sortTriangles(triangles)].map(draw);
  console.log(contents.length);

  svg.innerHTML = contents.join("");
}

/**
 *
 * @param {Triangle | Line} geometry
 */
function draw(geometry) {
  const { p1, p2 } = geometry;
  if ("p3" in geometry) {
    const p3 = geometry.p3;
    return `<polygon points="${p1.x}, ${p1.y} ${p2.x}, ${p2.y} ${p3.x}, ${
      p3.y
    }" fill="rgba(${
      244 * Math.random()
    } 72 72)" stroke="green" stroke-width="0.0" stroke-linejoin="round"" />`;
  } else {
    return `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="black" stroke-width="0.01" stroke-linecap="round" />`;
  }
}

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
 * }} TriangleData
 *
 * @typedef {{ x: number; y: number }} Point2
 */

/**
 * @param {Triangle[]} triangles
 * @returns {Triangle[]}
 */
function sort(triangles) {
  /** @type {Map<number, Set<number>>} */
  const edges = new Map();

  const preSorted = triangles
    .map(function (a) {
      return {
        ...a,
        boundingBox: boundingBox(a),
        plane: getPlane(a),
      };
    })
    .sort((a, b) => b.boundingBox.minZ - a.boundingBox.minZ);

  for (let i = 0; i < preSorted.length; i++) {
    const a = preSorted[i];

    for (let j = i + 1; j < preSorted.length; j++) {
      const b = preSorted[j];

      if (!boundsOverlap(a.boundingBox, b.boundingBox)) {
        continue;
      }

      const order = compareTriangles(a, b);

      if (order > 0) {
        if (!edges.get(i)) {
          edges.set(i, new Set());
        }
        edges.get(i)?.add(j);
      }

      if (order < 0) {
        if (!edges.get(j)) {
          edges.set(j, new Set());
        }
        edges.get(j)?.add(i);
      }

      if (order === 0) {
        // console.warn("Either a cycle or coplanar", a, b);
      }
    }
  }

  for (const [from, tos] of edges) {
    if (tos.size > 0) {
      // console.log(`${from} -> [${[...tos].join(", ")}]`);
    }
  }

  const sorted = topologicalSort(edges, triangles.length);
  // console.log(sorted);

  return sorted.map((i) => preSorted[i]).reverse();
}

/**
 * @param {Map<number, Set<number>>} edges
 * @param {number} count
 */
function topologicalSort(edges, count) {
  const inDegree = new Array(count).fill(0);
  for (const [, targets] of edges) {
    for (const t of targets) inDegree[t]++;
  }
  // console.log(inDegree);

  const queue = [];
  for (let i = 0; i < inDegree.length; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }
  // console.log(queue);

  let node;
  const result = [];
  const added = new Set();
  while ((node = queue.shift()) != null) {
    result.push(node);
    added.add(node);
    for (const target of edges.get(node) || []) {
      inDegree[target]--;
      if (inDegree[target] === 0) queue.push(target);
    }
  }

  // Handle cycles: add remaining nodes in index order (which is Z-sorted)
  if (added.size !== count) {
    console.warn(
      `Cycle detected! Only sorted ${added.size} of ${count} triangles`
    );
    for (let i = 0; i < count; i++) {
      if (!added.has(i)) {
        result.push(i);
      }
    }
  }

  return result;
}

/**
 *
 * @param {Triangle & { plane: Plane; boundingBox: BoundingBox }} a
 * @param {Triangle & { plane: Plane; boundingBox: BoundingBox }} b
 */
function compareTriangles(a, b) {
  const bRelativeToA = compareSideOfPlaneToCamera(a.plane, b);
  const aRelativeToB = compareSideOfPlaneToCamera(b.plane, a);

  // Use whichever test gave a definitive answer
  if (bRelativeToA === 1) return -1; // b in front, draw a first
  if (bRelativeToA === -1) return 1; // b behind, draw b first
  if (aRelativeToB === 1) return 1; // a in front, draw b first
  if (aRelativeToB === -1) return -1; // a behind, draw a first

  // Both tests inconclusive - use centroid Z as tiebreaker
  // This won't cause cycles because it's a total order
  return b.boundingBox.centroid - a.boundingBox.centroid;
}

/**
 *
 * @param {Plane} plane
 * @param {Triangle} triangle
 */
function compareSideOfPlaneToCamera([a, b, c, d], triangle) {
  const p1Side = a * triangle.p1.x + b * triangle.p1.y + c * triangle.p1.z + d;
  const p2Side = a * triangle.p2.x + b * triangle.p2.y + c * triangle.p2.z + d;
  const p3Side = a * triangle.p3.x + b * triangle.p3.y + c * triangle.p3.z + d;

  const p1Sign = epsilonSign(p1Side);
  const p2Sign = epsilonSign(p2Side);
  const p3Sign = epsilonSign(p3Side);

  const hasPositive = p1Sign === 1 || p2Sign === 1 || p3Sign === 1;
  const hasNegative = p1Sign === -1 || p2Sign === -1 || p3Sign === -1;

  // Triangle straddles the plane - can't determine order this way
  if (hasPositive && hasNegative) {
    // console.warn("cycle");
    return NaN;
  }

  // All on plane (coplanar)
  if (!hasPositive && !hasNegative) {
    // console.warn("Coplanar");
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

/** @typedef {[number, number, number, number]} Plane */

/**
 * @param {Triangle} triangle
 *
 * @returns {Plane}
 */
function getPlane({ p1, p2, p3 }) {
  const a = (p2.y - p1.y) * (p3.z - p1.z) - (p2.z - p1.z) * (p3.y - p1.y);
  const b = (p2.z - p1.z) * (p3.x - p1.x) - (p2.x - p1.x) * (p3.z - p1.z);
  const c = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const d = -(a * p1.x + b * p1.y + c * p1.z);

  return [a, b, c, d];
}

/**
 * @param {Triangle} triangle
 *
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
 * Sort back-to-front (far first), using overlap-based constraints + topo sort.
 * Assumptions:
 *  - x/y are already in screen space
 *  - orthographic depth; larger z is closer
 *  - triangles don't truly intersect in 3D (but may overlap in 2D)
 *
 * @param {Triangle[]} triangles
 * @returns {Triangle[]}
 */
function sortTriangles(triangles) {
  const boundingBoxes = triangles.map((t, index) => ({
    ...boundingBox(t),
    idx: index,
  }));

  /** @type {number[][]} */
  const out = Array.from({ length: triangles.length }, () => []);

  /** @type {number[]} */
  const indeg = Array.from({ length: triangles.length }, () => 0);

  const EPSILON = 1e-8;

  for (let i = 0; i < triangles.length; i++) {
    const a = triangles[i];
    const aBoundingBox = boundingBoxes[i];

    for (let j = i + 1; j < triangles.length; j++) {
      const b = triangles[j];
      const bBoundingBox = boundingBoxes[j];

      if (!boundsOverlap(aBoundingBox, bBoundingBox)) continue;

      const samples = overlappingPoints(a, aBoundingBox, b, bBoundingBox);
      if (samples.length === 0) continue;

      let aCloser = 0;
      let bCloser = 0;

      for (const p of samples) {
        // Ensure p is truly in BOTH triangles (robustness)
        if (!pointInTri2(p, b)) continue;
        if (!pointInTri2(p, b)) continue;

        const zA = depthAt(p, a);
        const zB = depthAt(p, b);

        // larger z is closer
        if (zA > zB + EPSILON) aCloser++;
        else if (zB > zA + EPSILON) bCloser++;
      }

      // If consistent: add a hard ordering constraint.
      if (aCloser > 0 && bCloser === 0) {
        // A closer => draw B before A
        out[j].push(i);
        indeg[i]++;
      } else if (bCloser > 0 && aCloser === 0) {
        // B closer => draw A before B
        out[i].push(j);
        indeg[j]++;
      } else {
        console.log("ambiguous", aCloser, bCloser);
        // else ambiguous -> no edge; let fallback handle it stably
      }
    }
  }

  const order = stableTopologicalSort(out, indeg, boundingBoxes);
  return order.map((k) => triangles[k]);
}

/**
 * @param {number[][]} out
 * @param {number[]} incomingEdges
 * @param {(BoundingBox & { idx: number })[]} indexed
 */
function stableTopologicalSort(out, incomingEdges, indexed) {
  const n = incomingEdges.length;
  const ready = [];
  for (let i = 0; i < n; i++) if (incomingEdges[i] === 0) ready.push(i);

  // We want far first => smaller avgZ first
  ready.sort(
    (i, j) =>
      indexed[i].centroid - indexed[j].centroid ||
      indexed[i].idx - indexed[j].idx
  );

  const result = [];
  const inResult = new Array(n).fill(false);

  let u;
  while ((u = ready.shift())) {
    result.push(u);
    inResult[u] = true;

    for (const v of out[u]) {
      incomingEdges[v]--;
      if (incomingEdges[v] > 0) {
        continue;
      }

      // Insert v into ready maintaining the same ordering
      const keyZ = indexed[v].centroid;
      const keyIdx = indexed[v].idx;
      let k = 0;
      while (
        k < ready.length &&
        (indexed[ready[k]].centroid < keyZ ||
          (indexed[ready[k]].centroid === keyZ &&
            indexed[ready[k]].idx < keyIdx))
      )
        k++;
      ready.splice(k, 0, v);
    }
  }

  // Cycle fallback: append remaining in far-first order.
  if (result.length !== n) {
    const remaining = [];
    for (let i = 0; i < n; i++) if (!inResult[i]) remaining.push(i);
    remaining.sort(
      (i, j) =>
        indexed[i].centroid - indexed[j].centroid ||
        indexed[i].idx - indexed[j].idx
    );
    result.push(...remaining);
  }

  return result;
}

/**
 * Depth at 2D point p via barycentric interpolation of vertex z.
 * Orthographic => this is correct.
 *
 * @param {Point2} p
 * @param {Triangle} triangle
 */
function depthAt(p, triangle) {
  const w = barycentric(p, triangle);
  return w.w1 * triangle.p1.z + w.w2 * triangle.p2.z + w.w3 * triangle.p3.z;
}

/**
 *
 * @param {Point2} p
 * @param {Triangle} triangle
 */
function barycentric(p, { p1, p2, p3 }) {
  const v0x = p2.x - p1.x;
  const v0y = p2.y - p1.y;
  const v1x = p3.x - p1.x;
  const v1y = p3.y - p1.y;
  const v2x = p.x - p1.x;
  const v2y = p.y - p1.y;

  const d00 = v0x * v0x + v0y * v0y;
  const d01 = v0x * v1x + v0y * v1y;
  const d11 = v1x * v1x + v1y * v1y;
  const d20 = v2x * v0x + v2y * v0y;
  const d21 = v2x * v1x + v2y * v1y;

  const denom = d00 * d11 - d01 * d01;
  if (denom === 0) return { w1: 1, w2: 0, w3: 0 };

  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  const u = 1 - v - w;
  return { w1: u, w2: v, w3: w };
}

/**
 *
 * @param {Point2} p
 * @param {Triangle} triangle
 * @returns
 */
function pointInTri2(p, triangle) {
  const w = barycentric(p, triangle);
  const eps = -1e-9;
  return w.w1 >= eps && w.w2 >= eps && w.w3 >= eps;
}

/**
 * Sample points in the overlap region:
 * - vertices of each triangle inside the other
 * - 2D edge intersections
 *
 * @param {Triangle} A
 * @param {BoundingBox} aBounds
 * @param {Triangle} B
 * @param {BoundingBox} bBounds
 */
function overlappingPoints(A, aBounds, B, bBounds) {
  const pts = [];

  if (pointInTri2(A.p1, B)) pts.push(A.p1);
  if (pointInTri2(A.p2, B)) pts.push(A.p2);
  if (pointInTri2(A.p3, B)) pts.push(A.p3);

  if (pointInTri2(B.p1, A)) pts.push(B.p1);
  if (pointInTri2(B.p2, A)) pts.push(B.p2);
  if (pointInTri2(B.p3, A)) pts.push(B.p3);

  const aSegments = [
    [A.p1, A.p2],
    [A.p2, A.p3],
    [A.p3, A.p1],
  ];
  const bSegments = [
    [B.p1, B.p2],
    [B.p2, B.p3],
    [B.p3, B.p1],
  ];

  for (const [p1, p2] of aSegments) {
    for (const [q1, q2] of bSegments) {
      const ip = segIntersect2(p1, p2, q1, q2);
      if (ip) pts.push(ip);
    }
  }
  // const ox1 = Math.max(aBounds.minX, bBounds.minX);
  // const ox2 = Math.min(aBounds.maxX, bBounds.maxX);
  // const oy1 = Math.max(aBounds.minY, bBounds.minY);
  // const oy2 = Math.min(aBounds.maxY, bBounds.maxY);

  // const w = ox2 - ox1;
  // const h = oy2 - oy1;

  // if (w > 0 && h > 0) {
  //   const cx = (ox1 + ox2) / 2;
  //   const cy = (oy1 + oy2) / 2;

  //   // 3x3-ish, but only 5 points (fast) — enough to catch slivers
  //   const candidates = [
  //     { x: cx, y: cy },
  //     { x: cx - w * 0.25, y: cy },
  //     { x: cx + w * 0.25, y: cy },
  //     { x: cx, y: cy - h * 0.25 },
  //     { x: cx, y: cy + h * 0.25 },
  //   ];

  //   for (const p of candidates) {
  //     if (pointInTri2(p, A) && pointInTri2(p, B)) {
  //       pts.push(p);
  //     }
  //   }

  //   // If overlap is extremely thin, w or h might be tiny; add a fixed nudge set.
  //   const N = 1e-3; // screen units; tweak if your coordinates are huge/small
  //   const nudges = [
  //     { x: cx + N, y: cy },
  //     { x: cx - N, y: cy },
  //     { x: cx, y: cy + N },
  //     { x: cx, y: cy - N },
  //     { x: cx + N, y: cy + N },
  //     { x: cx - N, y: cy + N },
  //     { x: cx + N, y: cy - N },
  //     { x: cx - N, y: cy - N },
  //   ];
  //   for (const p of nudges) {
  //     if (pointInTri2(p, A) && pointInTri2(p, B)) {
  //       pts.push(p);
  //     }
  //   }
  //   return uniquePoints([...pts, ...nudges], 1e-6);
  // }

  return uniquePoints(pts, 1e-6);
}

/**
 *
 * @param {Point2[]} pts
 * @param {number} eps
 *
 * @returns {Point2[]}
 */
function uniquePoints(pts, eps) {
  const out = [];
  const eps2 = eps * eps;
  for (const p of pts) {
    let ok = true;
    for (const q of out) {
      const dx = p.x - q.x,
        dy = p.y - q.y;
      if (dx * dx + dy * dy < eps2) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(p);
  }
  return out;
}

/**
 *
 * @param {Point2} p1
 * @param {Point2} p2
 * @param {Point2} q1
 * @param {Point2} q2
 *
 * @returns {Point2 | null}
 */
function segIntersect2(p1, p2, q1, q2) {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const rxs = cross2(r, s);
  const q_p = { x: q1.x - p1.x, y: q1.y - p1.y };

  if (Math.abs(rxs) < 1e-12) return null; // parallel (ignore collinear)

  const t = cross2(q_p, s) / rxs;
  const u = cross2(q_p, r) / rxs;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: p1.x + t * r.x, y: p1.y + t * r.y };
  }
  return null;
}

/**
 * @param {Point2} a
 * @param {Point2} b
 */
function cross2(a, b) {
  return a.x * b.y - a.y * b.x;
}

/**
 * @typedef {{ p1: Vertex; p2: Vertex; colorCode: number }} Line
 */

/**
 *
 * @param {Triangle} triangle
 */
function isFrontFacing(triangle) {
  const ax = triangle.p1.x;
  const ay = triangle.p1.y;
  const bx = triangle.p2.x;
  const by = triangle.p2.y;
  const cx = triangle.p3.x;
  const cy = triangle.p3.y;

  const crossProductZ = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

  return crossProductZ < 0;
}

/**
 * @param {number[] | Float32Array} lineData
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @param {number} e
 * @param {number} f
 * @param {number} g
 * @param {number} h
 * @param {number} ii
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 *
 * @returns {Line[]}
 */
function getLines(lineData, a, b, c, d, e, f, g, h, ii, tx, ty, tz) {
  const lines = [];
  for (let i = 0; i < lineData.length; i += 2 * 4) {
    const points = [];
    let colorCode = 16;

    for (let j = 0; j < 12; j += 4) {
      const x = lineData[i + j];
      const y = lineData[i + j + 1];
      const z = lineData[i + j + 2];
      colorCode = lineData[i + j + 3];

      const point = transformPoint(
        x,
        y,
        z,
        a,
        b,
        c,
        d,
        e,
        f,
        g,
        h,
        ii,
        tx,
        ty,
        tz
      );

      points.push(point);
    }

    const line = {
      p1: points[0],
      p2: points[1],
      colorCode,
    };

    lines.push(line);
  }

  return lines;
}

/**
 * @param {number[] | Float32Array} triangleData
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @param {number} e
 * @param {number} f
 * @param {number} g
 * @param {number} h
 * @param {number} ii
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 *
 * @returns {Triangle[]}
 */
function getTriangles(triangleData, a, b, c, d, e, f, g, h, ii, tx, ty, tz) {
  const triangles = [];
  for (let i = 0; i < triangleData.length; i += 3 * 4) {
    const points = [];
    let colorCode = 16;

    for (let j = 0; j < 12; j += 4) {
      const x = triangleData[i + j];
      const y = triangleData[i + j + 1];
      const z = triangleData[i + j + 2];
      colorCode = triangleData[i + j + 3];

      const point = transformPoint(
        x,
        y,
        z,
        a,
        b,
        c,
        d,
        e,
        f,
        g,
        h,
        ii,
        tx,
        ty,
        tz
      );

      points.push(point);
    }

    const triangle = {
      colorCode,
      p1: points[0],
      p2: points[1],
      p3: points[2],
    };

    // Back-face culling
    if (!isFrontFacing(triangle)) {
      continue;
    }

    triangles.push(triangle);
  }

  return triangles;
}
/**
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @param {number} d
 * @param {number} e
 * @param {number} f
 * @param {number} g
 * @param {number} h
 * @param {number} i
 * @param {number} tx
 * @param {number} ty
 * @param {number} tz
 *
 * @returns {Vertex}
 */
function transformPoint(x, y, z, a, b, c, d, e, f, g, h, i, tx, ty, tz) {
  const mappedX = a * x + d * y + g * z + tx;
  const mappedY = b * x + e * y + h * z + ty;
  const mappedZ = c * x + f * y + i * z + tz;

  return { x: mappedX, y: -mappedY, z: mappedZ };
}
