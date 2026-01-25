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
  }

  return result;
}
