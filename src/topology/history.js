// 撤销 / 重做模块：纯粹的历史栈状态机，可作用于任意状态类型，
// 不感知拓扑结构，也不接触 localStorage。

export const createHistory = (present) => ({ past: [], present, future: [] });

// 结构变更：当前状态压入 past，清空 future
export function commit(history, next) {
  return { past: [...history.past, history.present], present: next, future: [] };
}

// 拖动、属性编辑等连续修改：原地替换 present，不动 past / future
export function amend(history, next) {
  return { past: history.past, present: next, future: history.future };
}

export function undo(history) {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history) {
  if (!history.future.length) return history;
  const next = history.future[0];
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

// 限制历史长度，避免长期使用后存档膨胀
export function capHistory(history, maxPast = 100) {
  if (history.past.length <= maxPast) return history;
  return { ...history, past: history.past.slice(history.past.length - maxPast) };
}
