// 本地持久化模块：只负责拓扑数据（含撤销栈）与 localStorage 的互转。
// 读入的任何数据都先经数据迁移模块归一化，本模块不含拓扑业务规则。

import { migrateTopology } from './migrate.js';
import { createHistory, capHistory } from './history.js';

export const STORAGE_KEY = 'topology';
const VERSION = 2;

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const isEnvelope = (v) =>
  isObject(v) &&
  (Array.isArray(v.past) || 'present' in v) &&
  !Array.isArray(v.nodes);

export function loadHistory(fallback, storage = localStorage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return createHistory(migrateTopology(fallback));
  }
  if (!raw) return createHistory(migrateTopology(fallback));

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createHistory(migrateTopology(fallback));
  }

  // 旧版本是裸拓扑（{ nodes, edges }），作为初始快照，无历史栈
  if (!isEnvelope(parsed)) {
    return createHistory(migrateTopology(parsed));
  }

  const past = (Array.isArray(parsed.past) ? parsed.past : [])
    .map(migrateTopology);
  const future = (Array.isArray(parsed.future) ? parsed.future : [])
    .map(migrateTopology);
  const present = migrateTopology(parsed.present ?? fallback);

  return capHistory({ past, present, future });
}

export function loadSelection(storage = localStorage) {
  try {
    const v = storage.getItem(`${STORAGE_KEY}:selection`);
    return v || null;
  } catch {
    return null;
  }
}

export function saveHistory(history, storage = localStorage) {
  const payload = JSON.stringify({
    version: VERSION,
    past: history.past,
    present: history.present,
    future: history.future,
  });
  try {
    storage.setItem(STORAGE_KEY, payload);
  } catch {
    /* 存储不可用时静默降级，编辑仍可继续 */
  }
}

export function saveSelection(id, storage = localStorage) {
  try {
    if (id) storage.setItem(`${STORAGE_KEY}:selection`, id);
    else storage.removeItem(`${STORAGE_KEY}:selection`);
  } catch {
    /* 忽略 */
  }
}
