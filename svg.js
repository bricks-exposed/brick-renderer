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
  // .map((t, i) => (i % 3 === 0 ? t : undefined))
  // .filter((t) => !!t);
  // console.log(triangles.length, lines.length);

  const contents = [...newellsAlgorithm(triangles)].map(([t, i]) => draw(t, i));
  // console.log(contents.length);

  svg.innerHTML = contents.join("");
}

/**
 *
 * @param {Triangle | Line} geometry
 * @param {number} i
 */
function draw(geometry, i) {
  const { p1, p2 } = geometry;
  if ("p3" in geometry) {
    const p3 = geometry.p3;
    return `<polygon points="${p1[0]}, ${p1[1]} ${p2[0]}, ${p2[1]} ${p3[0]}, ${
      p3[1]
    }" fill="rgba(${244 * Math.random()} ${244 * Math.random()} ${
      244 * Math.random()
    })" stroke="green" stroke-width="0.0" stroke-linejoin="round" data-i="${i}" />`;
  } else {
    return `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="black" stroke-width="0.01" stroke-linecap="round" />`;
  }
}

/**
 * @param {Triangle[]} triangles
 * @returns {[Triangle, number][]}
 */
function newellsAlgorithm(triangles) {
  const out = triangles
    .map((t) => ({ ...t, boundingBox: boundingBox(t), plane: getPlane(t) }))
    .sort((a, b) => a.boundingBox.minZ - b.boundingBox.minZ);

  // console.log(out);

  /** @type {Map<number, Set<number>>} */
  const edges = new Map();

  const FACE_INDEX = 22;
  const STUD_INDEX = 12;

  /*
    Draw 0 before 10, 11, 16
    Draw 10 before 11, 16
    Draw 11 before 16
    Draw 16 before nothing
    Draw 25 before 0, 10, 11
  */

  for (let i = 0; i < out.length; i++) {
    edges.set(i, new Set());
  }

  // console.log(edges.size);

  for (let i = 0; i < out.length; i++) {
    const a = out[i];

    for (let j = i + 1; j < out.length; j++) {
      const b = out[j];

      const shouldLog =
        false &&
        i === Math.min(FACE_INDEX, STUD_INDEX) &&
        j === Math.max(FACE_INDEX, STUD_INDEX);

      // The two triangles definitely don't overlap,
      // so we don't need to sort them.
      if (!boundsOverlap(a.boundingBox, b.boundingBox)) {
        console.assert(!shouldLog, "bounds don't overlap", a, b);
        continue;
      }

      if (!trianglesOverlap(a, b)) {
        console.assert(!shouldLog, "triangles don't overlap", a, b);
        continue;
      }

      // A is fully in front of B, so draw B first
      if (a.boundingBox.minZ > b.boundingBox.maxZ) {
        console.assert(!shouldLog, `${i} is fully in front of ${j}`);
        edges.get(j)?.add(i);
        continue;
      }

      // B is fully in front of A, so draw A first
      if (b.boundingBox.minZ > a.boundingBox.maxZ) {
        console.assert(!shouldLog, `${j} is fully in front of ${i}`);
        edges.get(i)?.add(j);
        continue;
      }

      const aSideOfB = compareSideOfPlaneToCamera(b.plane, a);
      const bSideOfA = compareSideOfPlaneToCamera(a.plane, b);

      console.assert(!shouldLog, a, b, aSideOfB, bSideOfA);

      if (aSideOfB === bSideOfA) {
        if (aSideOfB === 0) {
          // Coplanar, doesn't matter
          continue;
        }

        // console.log(aSideOfB, bSideOfA);
        continue;
        if (a.boundingBox.minZ > b.boundingBox.minZ) {
          edges.get(j)?.add(i);

          continue;
        } else {
          edges.get(i)?.add(j);

          continue;
        }
      }

      if (aSideOfB === 1 || bSideOfA === -1) {
        edges.get(j)?.add(i);
        continue;
      }

      if (aSideOfB === -1 || bSideOfA === 1) {
        edges.get(i)?.add(j);
        continue;
      }
    }
  }

  for (const [i, e] of edges) {
    const targets = [...e.values()];
    if (
      i === FACE_INDEX ||
      i === STUD_INDEX ||
      targets.includes(FACE_INDEX) ||
      targets.includes(STUD_INDEX)
    ) {
      // console.log(`${i} -> [${targets}]`);
    }
  }

  const sorted = topologicalSort(edges, out.length);

  return sorted.map((i) => [out[i], i]);
}

/**
 * @param {Triangle} a
 * @param {Triangle} b
 */
function trianglesOverlap(a, b) {
  const pointsA = [a.p1, a.p3, a.p2];
  const pointsB = [b.p1, b.p3, b.p2];

  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;

    const triangles = [
      [pointsA[i], pointsA[j], pointsB[0]],
      [pointsA[i], pointsA[j], pointsB[1]],
      [pointsA[i], pointsA[j], pointsB[2]],
    ];

    if (triangles.every(collision)) {
      return false;
    }
  }

  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const triangles = [
      [pointsB[i], pointsB[j], pointsA[0]],
      [pointsB[i], pointsB[j], pointsA[1]],
      [pointsB[i], pointsB[j], pointsA[2]],
    ];

    if (triangles.every(collision)) {
      return false;
    }
  }

  return true;
}

/**
 * @param {number[][]} triangle
 */
function determinant([p1, p2, p3]) {
  return (
    p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1])
  );
}

/**
 * @param {number[][]} triangle
 */
function collision(triangle) {
  return determinant(triangle) < 1e-12;
}

/**
 * @typedef {[number, number, number]} Vertex
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
 * @param {Map<number, Set<number>>} edges
 * @param {number} count
 */
function topologicalSort(edges, count) {
  const inDegree = new Array(count).fill(0);
  for (const [, targets] of edges) {
    for (const t of targets) inDegree[t]++;
  }
  // console.log(JSON.stringify(inDegree));

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
      // console.log(inDegree[target]);
      inDegree[target]--;
      if (inDegree[target] === 0) queue.push(target);
    }
  }

  if (added.size !== count) {
    console.warn(`Cycle detected! Sorted ${added.size}/${count}. `);
    for (let i = 0; i < inDegree.length; i++) {
      if (!added.has(i)) {
        // console.log(i);
        result.push(i);
      }
    }
  }

  return result;
}

/**
 * Topological sort that accounts for cycles:
 * First, we compute all strongly connected components (cycles, effectivelu)
 * Then, we topologically sort each cycle
 * Then sort the full graph and expand each strongly connected component
 *
 * @param {Map<number, Set<number>>} edges
 * @param {number} count
 *
 * @returns {number[]}
 */
function topoSortWithSCC(edges, count) {
  const { compOf, comps } = tarjanSCC(edges, count);
  const compCount = comps.length;

  // Build condensed DAG over components
  const compEdges = Array.from({ length: compCount }, () => new Set());
  const compInDeg = new Array(compCount).fill(0);

  for (let u = 0; u < count; u++) {
    const cu = compOf[u];
    const targets = edges.get(u);
    if (!targets) continue;
    for (const v of targets) {
      const cv = compOf[v];
      if (cu === cv) continue; // internal SCC edge
      if (!compEdges[cu].has(cv)) {
        compEdges[cu].add(cv);
        compInDeg[cv]++;
      }
    }
  }

  // Tie-break components by smallest node index in the component (keeps your Z-order feel)
  const compKey = comps.map((nodes) => Math.min(...nodes));

  // Kahn on component DAG
  /** @type {number[]} */
  const queue = [];
  for (let c = 0; c < count; c++) {
    if (compInDeg[c] === 0) queue.push(c);
  }
  queue.sort((a, b) => compKey[a] - compKey[b]);

  const compOrder = [];
  let qh = 0;
  while (qh < queue.length) {
    const c = queue[qh++];
    compOrder.push(c);
    for (const nxt of compEdges[c]) {
      compInDeg[nxt]--;
      if (compInDeg[nxt] === 0) {
        queue.push(nxt);
        // keep queue ordered by tie-break key (simple insertion sort step)
        for (let i = queue.length - 1; i > qh; i--) {
          if (compKey[queue[i]] < compKey[queue[i - 1]]) {
            const tmp = queue[i];
            queue[i] = queue[i - 1];
            queue[i - 1] = tmp;
          } else break;
        }
      }
    }
  }

  // Expand components into node ordering
  const result = [];
  for (const c of compOrder) {
    const nodes = comps[c].slice().sort((a, b) => a - b); // your Z/index order inside SCC
    for (const n of nodes) result.push(n);
  }

  return result;
}

/**
 * @typedef {{
 *   value: number;
 *   index: number | undefined;
 *   lowestReachable: number;
 *   visited: boolean;
 * }} Node
 */

/**
 * Tarjan's Strongly Connected Components algorithm
 *
 * For a directed graph finds all its strongly connected
 * components, which are basically cycles but the maximum
 * amount of nodes per cycle.
 *
 * https://en.wikipedia.org/wiki/Tarjan%27s_strongly_connected_components_algorithm
 *
 * @param {Map<number, Set<number>>} edges
 * @param {number} count
 */
function tarjanSCC(edges, count) {
  /** @type {Node[]} */
  const stack = [];

  /** @type {Node[]} */
  const nodes = Array.from({ length: count }, function (_, i) {
    return {
      value: i,
      visited: false,
      index: undefined,
      lowestReachable: Infinity,
    };
  });

  const compOf = new Array(count).fill(-1);

  /** @type {number[][]} */
  const allComponents = [];

  let index = 0;

  /**
   * @param {Node} node
   */
  function findStronglyConnectedNodes(node) {
    node.index = index;
    node.lowestReachable = index;
    index++;

    stack.push(node);
    node.visited = true;

    const targets = edges.get(node.value) ?? [];
    for (const target of targets) {
      const other = nodes[target];

      if (other.index == null) {
        // If we haven't seen the other node, check out its cycles
        // and check its lowest reachable node
        findStronglyConnectedNodes(other);
        node.lowestReachable = Math.min(
          node.lowestReachable,
          other.lowestReachable
        );
      } else if (other.visited) {
        // Otherwise, we've already seen this node and it's in our SCC
        node.lowestReachable = Math.min(node.lowestReachable, other.index);
      }
    }

    const isRootNode = node.lowestReachable === node.index;
    if (isRootNode) {
      const stronglyConnectedComponent = [];
      while (true) {
        const w = stack.pop();
        if (!w) {
          break;
        }

        w.visited = false;
        compOf[w.value] = allComponents.length;
        stronglyConnectedComponent.push(w.value);
        if (w.value === node.value) break;
      }
      allComponents.push(stronglyConnectedComponent);
    }
  }

  for (const node of nodes) {
    if (node.index == null) {
      findStronglyConnectedNodes(node);
    }
  }

  for (const comp of allComponents) {
    if (comp.length > 1) {
      console.warn("Cycle found", comp);
    }
  }

  return { compOf, comps: allComponents };
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
function boundingBox(triangle) {
  const minX = Math.min(triangle.p1[0], triangle.p2[0], triangle.p3[0]);
  const maxX = Math.max(triangle.p1[0], triangle.p2[0], triangle.p3[0]);
  const minY = Math.min(triangle.p1[1], triangle.p2[1], triangle.p3[1]);
  const maxY = Math.max(triangle.p1[1], triangle.p2[1], triangle.p3[1]);
  const minZ = Math.min(triangle.p1[2], triangle.p2[2], triangle.p3[2]);
  const maxZ = Math.max(triangle.p1[2], triangle.p2[2], triangle.p3[2]);
  const centroid = (triangle.p1[2] + triangle.p2[2] + triangle.p3[2]) / 3;

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
 * @typedef {{ p1: Vertex; p2: Vertex; colorCode: number }} Line
 */

/**
 *
 * @param {Triangle} triangle
 */
function isFrontFacing(triangle) {
  const ax = triangle.p1[0];
  const ay = triangle.p1[1];
  const bx = triangle.p2[0];
  const by = triangle.p2[1];
  const cx = triangle.p3[0];
  const cy = triangle.p3[1];

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

  return [mappedX, -mappedY, mappedZ];
}
