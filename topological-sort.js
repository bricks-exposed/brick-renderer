/**
 * @template {{}} T
 * @param {Map<T, Set<T>>} edges
 * @param {number} count
 *
 * @returns {T[]}
 */
export function topologicalSort(edges, count) {
  /** @type {Map<T, number>} */
  const inDegree = new Map();

  for (const [node] of edges) {
    inDegree.set(node, 0);
  }

  for (const [, targets] of edges) {
    for (const t of targets) {
      const currentDegree = inDegree.get(t) ?? 0;
      inDegree.set(t, currentDegree + 1);
    }
  }

  const queue = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  let node;
  const result = [];
  const added = new Set();
  while ((node = queue.shift()) != null) {
    result.push(node);
    added.add(node);
    for (const target of edges.get(node) || []) {
      const currentDegree = inDegree.get(target) ?? 0;
      const newDegree = currentDegree - 1;
      inDegree.set(target, newDegree);
      if (newDegree === 0) queue.push(target);
    }
  }

  if (added.size < count) {
    console.warn("Cycle detected", added.size, count);
    for (const [node] of edges) {
      if (!added.has(node)) {
        console.log(node);
        // result.push(node);
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
export function topoSortWithSCC(edges, count) {
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
