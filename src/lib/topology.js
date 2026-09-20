// 拓扑操作：纯函数，输入 {nodes, edges}，返回新数据；会失败的操作返回 {ok:false, reason}
export const NODE_TYPES = ['router', 'switch', 'server', 'device'];

// 无向连接的唯一键，用于判重
export const edgeKey = (a, b) => [String(a), String(b)].sort().join('↔');

export const hasEdge = (edges, a, b) =>
  edges.some(e => edgeKey(e[0], e[1]) === edgeKey(a, b));

const ok = data => ({ ok: true, data });
const fail = reason => ({ ok: false, reason });

export function addNode(data, node) {
  let id = String(node.id);
  while (data.nodes.some(n => n.id === id)) {
    id = `${node.id}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return { ...data, nodes: [...data.nodes, { ...node, id }] };
}

export function updateNode(data, id, patch) {
  return { ...data, nodes: data.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)) };
}

export function moveNode(data, id, x, y) {
  return updateNode(data, id, { x, y });
}

// 设备退出画布：节点和相关连接一并移除
export function removeNode(data, id) {
  return {
    nodes: data.nodes.filter(n => n.id !== id),
    edges: data.edges.filter(e => e[0] !== id && e[1] !== id),
  };
}

// 删除设备后，挑选一个仍然存在的设备作为新选中项（优先原位置附近的节点）
export function nextSelection(nodes, removedId) {
  const idx = nodes.findIndex(n => n.id === removedId);
  const rest = nodes.filter(n => n.id !== removedId);
  if (!rest.length) return null;
  return rest[Math.min(Math.max(idx, 0), rest.length - 1)].id;
}

export function addEdge(data, a, b) {
  a = String(a);
  b = String(b);
  if (a === b) return fail('不能连接设备自身');
  if (!data.nodes.some(n => n.id === a) || !data.nodes.some(n => n.id === b)) {
    return fail('设备不存在');
  }
  if (hasEdge(data.edges, a, b)) return fail('连接已存在');
  return ok({ ...data, edges: [...data.edges, [a, b]] });
}

// 改接端点：保留 keepId 一端，把另一端换到 nextId，不产生自连或重复连接
export function reconnectEdge(data, index, keepId, nextId) {
  const edge = data.edges[index];
  if (!edge) return fail('连接不存在');
  nextId = String(nextId);
  if (!data.nodes.some(n => n.id === nextId)) return fail('目标设备不存在');
  if (nextId === keepId) return fail('不能连接到设备自身');
  const [a, b] = edge;
  const other = a === keepId ? b : b === keepId ? a : null;
  if (other === null) return fail('该连接不包含当前设备');
  if (other === nextId) return ok(data);
  const pair = a === keepId ? [keepId, nextId] : [nextId, keepId];
  const duplicated = data.edges.some(
    (e, i) => i !== index && edgeKey(e[0], e[1]) === edgeKey(pair[0], pair[1])
  );
  if (duplicated) return fail('改接后会与已有连接重复');
  return ok({ ...data, edges: data.edges.map((e, i) => (i === index ? pair : e)) });
}

export function removeEdge(data, index) {
  return { ...data, edges: data.edges.filter((_, i) => i !== index) };
}
