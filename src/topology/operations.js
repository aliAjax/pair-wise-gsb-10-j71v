// 拓扑操作模块：节点 / 连线的结构性变更，全部为纯函数。
// 入参拓扑视为已通过 migrateTopology 归一化。
// 返回 { topo, ok, error }：ok 为 false 时 topo 为原拓扑。

const clone = (topo) => ({ nodes: topo.nodes, edges: topo.edges.map((e) => [...e]) });

export const sameEdge = (edge, a, b) =>
  (edge[0] === a && edge[1] === b) || (edge[0] === b && edge[1] === a);

// 是否允许建立 a-b 连线（端点必须存在、不能自连、不能重复）
export function canConnect(topo, a, b, ignoreIndex = -1) {
  if (!a || !b) return { ok: false, error: '需要选择两个端点' };
  if (a === b) return { ok: false, error: '不能连接设备自身' };
  const exists = topo.nodes.some((n) => n.id === a);
  const other = topo.nodes.some((n) => n.id === b);
  if (!exists || !other) return { ok: false, error: '端点设备不存在' };
  const dup = topo.edges.some((e, i) => i !== ignoreIndex && sameEdge(e, a, b));
  if (dup) return { ok: false, error: '这两台设备之间已经存在连接' };
  return { ok: true, error: '' };
}

export function addNode(topo, node) {
  const nodes = [...topo.nodes, node];
  return { topo: { ...topo, nodes }, ok: true, error: '' };
}

// 设备退出画布：移除节点并一并清理相关连接
export function removeNode(topo, id) {
  if (!topo.nodes.some((n) => n.id === id)) {
    return { topo, ok: false, error: '设备不存在' };
  }
  return {
    topo: {
      nodes: topo.nodes.filter((n) => n.id !== id),
      edges: topo.edges.filter((e) => e[0] !== id && e[1] !== id),
    },
    ok: true,
    error: '',
  };
}

export function addEdge(topo, a, b) {
  const check = canConnect(topo, a, b);
  if (!check.ok) return { topo, ...check };
  const next = clone(topo);
  next.edges.push([a, b]);
  return { topo: next, ok: true, error: '' };
}

export function removeEdge(topo, index) {
  if (index < 0 || index >= topo.edges.length) {
    return { topo, ok: false, error: '连接不存在' };
  }
  const next = clone(topo);
  next.edges.splice(index, 1);
  return { topo: next, ok: true, error: '' };
}

// 改接某条连线的一个端点（anchor = 0/1 表示改动连线数组的哪一端）。
// 不能留下自连或重复连接；另一端必须仍在画布上。
export function reconnectEdge(topo, index, anchor, newId) {
  const edge = topo.edges[index];
  if (!edge) return { topo, ok: false, error: '连接不存在' };
  const keep = edge[anchor === 0 ? 1 : 0];
  const check = canConnect(topo, keep, newId, index);
  if (!check.ok) return { topo, ...check };
  const next = clone(topo);
  next.edges[index] = anchor === 0 ? [newId, keep] : [keep, newId];
  return { topo: next, ok: true, error: '' };
}

// 删除设备后选出仍存在的设备：优先原邻接设备，其次画布上剩余的第一台。
// prevTopo 为删除前拓扑（邻接连线还在），topo 为删除后拓扑。
export function pickNodeAfterRemoval(prevTopo, topo, removedId, preferredId) {
  if (preferredId && topo.nodes.some((n) => n.id === preferredId)) return preferredId;
  const neighbor = prevTopo.edges.find((e) => e.includes(removedId));
  if (neighbor) {
    const id = neighbor[0] === removedId ? neighbor[1] : neighbor[0];
    if (topo.nodes.some((n) => n.id === id)) return id;
  }
  return topo.nodes[0]?.id ?? null;
}
