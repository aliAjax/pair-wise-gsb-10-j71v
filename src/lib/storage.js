// 本地持久化：只负责 localStorage 读写，不理解数据结构（清洗交给 migration）
const KEY = 'topology';

export function loadRawTopology() {
  try {
    const text = localStorage.getItem(KEY);
    if (text === null) return null; // 首次使用
    try {
      return JSON.parse(text);
    } catch {
      return text; // JSON 损坏：原样返回，由迁移层识别并回退
    }
  } catch {
    return null; // localStorage 不可用
  }
}

export function saveTopology(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 存储不可用（隐私模式/配额满）时静默失败，不影响编辑
  }
}
