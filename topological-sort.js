/**
 * @param {Map<number, Set<number>>} edges
 * @param {number} count
 */
export function topologicalSort(edges, count) {
  const inDegree = new Array(count).fill(0);
  for (const [, targets] of edges) {
    for (const t of targets) inDegree[t]++;
  }

  const queue = [];
  for (let i = 0; i < inDegree.length; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

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

  return result;
}
