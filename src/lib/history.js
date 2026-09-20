// 撤销/重做历史栈：每次拓扑变更压入一条记录，支持合并连续的同类变更
const LIMIT = 100;

export function createHistory(present) {
  return { past: [], present, future: [], mergeKey: null };
}

// mergeKey 相同的连续变更合并为一条（如拖动过程、逐字输入）
export function pushHistory(history, next, mergeKey = null) {
  if (mergeKey && mergeKey === history.mergeKey) {
    return { ...history, present: next };
  }
  return {
    past: [...history.past, history.present].slice(-LIMIT),
    present: next,
    future: [],
    mergeKey,
  };
}

export function undo(history) {
  if (!history.past.length) return history;
  const { past, present, future } = history;
  return {
    past: past.slice(0, -1),
    present: past[past.length - 1],
    future: [present, ...future],
    mergeKey: null,
  };
}

export function redo(history) {
  if (!history.future.length) return history;
  const { past, present, future } = history;
  return {
    past: [...past, present],
    present: future[0],
    future: future.slice(1),
    mergeKey: null,
  };
}

export const canUndo = history => history.past.length > 0;
export const canRedo = history => history.future.length > 0;
