// 数据迁移模块：只负责把任意历史版本 / 损坏的存档归一化为可用拓扑，
// 不感知拓扑操作规则，也不接触 localStorage。

export const NODE_TYPES = ['router', 'switch', 'server', 'device'];
export const DEFAULT_NODE_TYPE = 'device';

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const asText = (v) => {
  if (typeof v === 'string') return v.trim();
  return v == null ? '' : String(v).trim();
};

const asNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// 兼容旧版连线写法：['a','b'] 或 { source, target } / { from, to } / { a, b }
const readEnds = (edge) => {
  if (Array.isArray(edge)) {
    return edge.length >= 2 ? [edge[0], edge[1]] : null;
  }
  if (isObject(edge)) {
    const a = edge.source ?? edge.from ?? edge.a;
    const b = edge.target ?? edge.to ?? edge.b;
    if (a != null && b != null) return [a, b];
  }
  return null;
};

export function migrateTopology(raw) {
  const source = isObject(raw) ? raw : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];

  const nodes = [];
  const ids = new Set();
  let seq = 1;
  const genId = () => {
    let id;
    do {
      id = `node-${seq++}`;
    } while (ids.has(id));
    return id;
  };

  for (const item of rawNodes) {
    if (!isObject(item)) continue;
    const id = asText(item.id) || genId();
    if (ids.has(id)) continue; // 同 id 记录无法被连线区分，保留首条
    const type = NODE_TYPES.includes(item.type) ? item.type : DEFAULT_NODE_TYPE;
    const x = asNumber(item.x) ?? (160 + (nodes.length % 6) * 110);
    const y = asNumber(item.y) ?? (150 + Math.floor(nodes.length / 6) * 110);
    nodes.push({
      id,
      name: asText(item.name) || '未命名设备',
      type,
      x,
      y,
      ip: asText(item.ip),
    });
    ids.add(id);
  }

  const edges = [];
  const seen = new Set();
  for (const item of rawEdges) {
    const ends = readEnds(item);
    if (!ends) continue;
    const a = asText(ends[0]);
    const b = asText(ends[1]);
    if (!a || !b) continue;
    if (a === b) continue; // 自连不是合法连接
    if (!ids.has(a) || !ids.has(b)) continue; // 清除悬空连线
    const key = a < b ? `${a}⇄${b}` : `${b}⇄${a}`;
    if (seen.has(key)) continue; // 清除重复连接
    seen.add(key);
    edges.push([a, b]);
  }

  return { nodes, edges };
}
