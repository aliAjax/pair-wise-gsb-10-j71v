// 数据迁移：把 localStorage 里的旧数据整理成当前可用的拓扑结构
// - 清除悬空连线（端点不存在或记录残缺）
// - 去除自连和重复连接
// - 给缺字段的设备记录补上默认值
import { NODE_TYPES, edgeKey } from './topology.js';

const seed = {
  nodes: [
    { id: 'gw', name: '核心路由器', type: 'router', x: 470, y: 220, ip: '10.0.0.1' },
    { id: 'sw1', name: '交换机 A', type: 'switch', x: 250, y: 370, ip: '10.0.1.1' },
    { id: 'sw2', name: '交换机 B', type: 'switch', x: 690, y: 370, ip: '10.0.2.1' },
    { id: 'web', name: 'Web Server', type: 'server', x: 100, y: 520, ip: '10.0.1.10' },
    { id: 'db', name: 'Database', type: 'server', x: 400, y: 550, ip: '10.0.1.20' },
    { id: 'user', name: '办公终端', type: 'device', x: 820, y: 530, ip: '10.0.2.22' },
  ],
  edges: [['gw', 'sw1'], ['gw', 'sw2'], ['sw1', 'web'], ['sw1', 'db'], ['sw2', 'user']],
};

export const createSeed = () => JSON.parse(JSON.stringify(seed));

const DEFAULT_NODE = { name: '未命名设备', type: 'device', x: 400, y: 300, ip: '0.0.0.0' };

const emptyFixes = () => ({
  dangling: 0,     // 悬空连线（端点缺失或设备不存在）
  duplicates: 0,   // 重复连接
  selfLoops: 0,    // 自连
  invalidNodes: 0, // 无法修复的设备记录
  fieldsFilled: 0, // 补过字段的设备数
});

function normalizeNode(raw, index, usedIds, fixes) {
  if (!raw || typeof raw !== 'object') {
    fixes.invalidNodes++;
    return null;
  }
  const node = { ...raw };
  let touched = false;

  let id = node.id === null || node.id === undefined || node.id === '' ? `node-${index}` : String(node.id);
  if (id !== node.id) touched = true;
  if (usedIds.has(id)) {
    let k = 2;
    while (usedIds.has(`${id}-${k}`)) k++;
    id = `${id}-${k}`;
    touched = true;
  }
  usedIds.add(id);
  node.id = id;

  if (typeof node.name !== 'string' || !node.name) {
    node.name = DEFAULT_NODE.name;
    touched = true;
  }
  if (!NODE_TYPES.includes(node.type)) {
    node.type = DEFAULT_NODE.type;
    touched = true;
  }
  const x = Number(node.x);
  if (Number.isFinite(x)) node.x = x;
  else {
    node.x = DEFAULT_NODE.x;
    touched = true;
  }
  const y = Number(node.y);
  if (Number.isFinite(y)) node.y = y;
  else {
    node.y = DEFAULT_NODE.y;
    touched = true;
  }
  if (typeof node.ip !== 'string' || !node.ip) {
    node.ip = DEFAULT_NODE.ip;
    touched = true;
  }

  if (touched) fixes.fieldsFilled++;
  return node;
}

// 兼容旧版连线格式：[a, b] 或 {from,to} / {source,target}
function normalizeEdge(raw) {
  let a, b;
  if (Array.isArray(raw)) [a, b] = raw;
  else if (raw && typeof raw === 'object') {
    a = raw.from ?? raw.source;
    b = raw.to ?? raw.target;
  }
  if (a === null || a === undefined || b === null || b === undefined) return null;
  return [String(a), String(b)];
}

export function migrateTopology(raw) {
  const fixes = emptyFixes();

  // 没有存过数据：首次使用，静默给种子数据
  if (raw === null || raw === undefined) {
    return { data: createSeed(), fixes, changed: false };
  }
  // 数据损坏：回退到种子数据并提示
  if (typeof raw !== 'object' || !Array.isArray(raw.nodes)) {
    return { data: createSeed(), fixes, changed: true };
  }

  const usedIds = new Set();
  const nodes = [];
  raw.nodes.forEach((n, i) => {
    const node = normalizeNode(n, i, usedIds, fixes);
    if (node) nodes.push(node);
  });

  const ids = new Set(nodes.map(n => n.id));
  const seen = new Set();
  const edges = [];
  (Array.isArray(raw.edges) ? raw.edges : []).forEach(rawEdge => {
    const e = normalizeEdge(rawEdge);
    if (!e || !ids.has(e[0]) || !ids.has(e[1])) {
      fixes.dangling++;
      return;
    }
    if (e[0] === e[1]) {
      fixes.selfLoops++;
      return;
    }
    const key = edgeKey(e[0], e[1]);
    if (seen.has(key)) {
      fixes.duplicates++;
      return;
    }
    seen.add(key);
    edges.push(e);
  });

  const changed = Object.values(fixes).some(v => v > 0);
  return { data: { nodes, edges }, fixes, changed };
}
