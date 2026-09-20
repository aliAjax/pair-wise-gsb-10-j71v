import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  addEdge,
  addNode as addNodeOp,
  pickNodeAfterRemoval,
  reconnectEdge,
  removeEdge,
  removeNode,
} from './topology/operations.js';
import {
  amend,
  commit,
  redo as redoOp,
  undo as undoOp,
} from './topology/history.js';
import {
  loadHistory,
  loadSelection,
  saveHistory,
  saveSelection,
} from './topology/persistence.js';

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

const TYPE_ENTRIES = [['router', '◉', '路由器'], ['switch', '▦', '交换机'], ['server', '▣', '服务器'], ['device', '▱', '终端设备']];
const TYPE_ICON = (t) => (t === 'router' ? '◉' : t === 'switch' ? '▦' : t === 'server' ? '▣' : '▱');

// 启动时一次性迁移旧数据：清除悬空/重复/自连连线，补齐节点缺失字段
const boot = () => {
  const history = loadHistory(seed);
  const savedSel = loadSelection();
  const selection = history.present.nodes.some((n) => n.id === savedSel)
    ? savedSel
    : (history.present.nodes[0]?.id ?? null);
  return { history, selection };
};

const newId = () => `node${Date.now()}${Math.floor(Math.random() * 1e4)}`;

function App() {
  const [{ history: initialHistory, selection: initialSelection }] = useState(boot);
  const [history, setHistory] = useState(initialHistory);
  const [selected, setSelected] = useState(initialSelection);
  const [tool, setTool] = useState('select');
  const [notice, setNotice] = useState('');
  const [drag, setDrag] = useState(null);
  const board = useRef();

  const data = history.present;

  // 每次拓扑变更（含撤销/重做）都写入本地，刷新后仍停在最近状态
  useEffect(() => saveHistory(history), [history]);
  useEffect(() => saveSelection(selected), [selected]);

  // 选中设备因任何原因不存在时（删节点、撤销等），回落到仍存在的设备
  useEffect(() => {
    if (selected && !data.nodes.some((n) => n.id === selected)) {
      setSelected(data.nodes[0]?.id ?? null);
    }
  }, [data, selected]);

  const undo = useCallback(() => {
    if (!history.past.length) return;
    setNotice('已撤销');
    setHistory((h) => undoOp(h));
  }, [history.past.length]);

  const redo = useCallback(() => {
    if (!history.future.length) return;
    setNotice('已重做');
    setHistory((h) => redoOp(h));
  }, [history.future.length]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const node = data.nodes.find((n) => n.id === selected) || data.nodes[0] || null;

  // 属性编辑保持原有即时生效方式，不新增历史步骤
  const updateNode = (k, v) =>
    setHistory((h) =>
      amend(h, { ...h.present, nodes: h.present.nodes.map((n) => (n.id === selected ? { ...n, [k]: v } : n)) })
    );

  const addNode = (preset) => {
    const n = {
      id: newId(),
      name: preset?.label ?? '新设备',
      type: preset?.type ?? 'device',
      x: 500,
      y: preset ? 320 : 300,
      ip: '192.168.0.10',
    };
    setHistory((h) => commit(h, addNodeOp(h.present, n).topo));
    setSelected(n.id);
    setTool('select');
    setNotice('已添加设备');
  };

  const connect = () => {
    if (!selected) return;
    const other = prompt('输入要连接的设备 ID（例如 sw1）');
    if (other == null) return;
    const result = addEdge(data, selected, other.trim());
    if (result.ok) {
      setHistory((h) => commit(h, result.topo));
      setNotice('连接已创建');
    } else {
      setNotice(result.error);
    }
  };

  // 改接连线端点：自连 / 重复 / 目标不存在一律拒绝，不产生脏数据
  const rewire = (edgeIndex, anchor, value) => {
    const result = reconnectEdge(data, edgeIndex, anchor, value);
    if (result.ok) {
      setHistory((h) => commit(h, result.topo));
      setNotice('连接已改接');
    } else {
      setNotice(result.error);
    }
  };

  const disconnect = (edgeIndex) => {
    const result = removeEdge(data, edgeIndex);
    if (result.ok) {
      setHistory((h) => commit(h, result.topo));
      setNotice('连接已删除');
    }
  };

  const remove = () => {
    if (!selected) return;
    const prev = data;
    const result = removeNode(prev, selected);
    if (!result.ok) return;
    // 选择仍存在的设备（优先原邻接设备）
    setSelected(pickNodeAfterRemoval(prev, result.topo, selected));
    setHistory((h) => commit(h, result.topo));
    setNotice('设备已删除，相关连接一并清理');
  };

  const save = () => setNotice('拓扑图已保存');

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'network-topology.json';
    a.click();
    setNotice('JSON 已导出');
  };

  const validate = () => {
    const linked = new Set(data.edges.flat());
    const isolated = data.nodes.filter((n) => !linked.has(n.id));
    setNotice(isolated.length ? `发现 ${isolated.length} 个孤立节点` : '拓扑检查通过：没有孤立节点');
  };

  // 拖动保持原样：移动过程实时生效，不产生历史步骤
  const move = (e) => {
    if (!drag || !board.current) return;
    const r = board.current.getBoundingClientRect();
    setHistory((h) =>
      amend(h, {
        ...h.present,
        nodes: h.present.nodes.map((n) =>
          n.id === drag ? { ...n, x: Math.max(35, e.clientX - r.left), y: Math.max(35, e.clientY - r.top) } : n
        ),
      })
    );
  };

  const nodeEdges = node ? data.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.includes(node.id)) : [];

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <div>
            <strong>NETSCAPE</strong>
            <small>TOPOLOGY STUDIO</small>
          </div>
        </div>
        <div className="file">
          <span className="dot"></span>
          <div>
            <strong>office-network.json</strong>
            <small>最近保存：刚刚</small>
          </div>
        </div>
        <div className="top-actions">
          <button onClick={validate}>✓ 检查</button>
          <button onClick={exportJson}>↓ 导出</button>
          <button className="save" onClick={save}>保存更改</button>
        </div>
      </header>
      <div className="toolbar">
        <div className="tool-group">
          <span>工具</span>
          <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')}>↖ 选择</button>
          <button
            className={tool === 'connect' ? 'on' : ''}
            onClick={() => { setTool('connect'); connect(); }}
          >⌁ 连接</button>
          <button onClick={() => addNode()}>＋ 设备</button>
        </div>
        <div className="tool-group">
          <span>历史</span>
          <button disabled={!history.past.length} onClick={undo} title="撤销 (Ctrl+Z)">↶ 撤销</button>
          <button disabled={!history.future.length} onClick={redo} title="重做 (Ctrl+Shift+Z)">↷ 重做</button>
        </div>
        <div className="tool-group zoom">
          <button>−</button>
          <span>100%</span>
          <button>＋</button>
          <button onClick={() => setNotice('画布已居中')}>⌗</button>
        </div>
      </div>
      <div className="workspace">
        <aside className="inventory">
          <div className="section-title"><span>设备库</span><small>{data.nodes.length} 个节点</small></div>
          <div className="device-types">
            {TYPE_ENTRIES.map(([t, i, l]) => (
              <button onClick={() => addNode({ type: t, label: l })} key={t}>
                <i className={t}>{i}</i>{l}<span>＋</span>
              </button>
            ))}
          </div>
          <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
          <div className="node-list">
            {data.nodes.map((n) => (
              <button className={selected === n.id ? 'sel' : ''} onClick={() => setSelected(n.id)} key={n.id}>
                <i className={n.type}>{TYPE_ICON(n.type)}</i>
                <span><strong>{n.name}</strong><small>{n.ip}</small></span>
                <b>›</b>
              </button>
            ))}
          </div>
        </aside>
        <section className="canvas-wrap">
          <div className="canvas" ref={board} onMouseMove={move} onMouseUp={() => setDrag(null)}>
            {data.edges.map(([a, b], i) => {
              const n1 = data.nodes.find((n) => n.id === a);
              const n2 = data.nodes.find((n) => n.id === b);
              if (!n1 || !n2) return null;
              const dx = n2.x - n1.x, dy = n2.y - n1.y;
              const len = Math.hypot(dx, dy);
              const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
              return (
                <div className="edge" key={i} style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}>
                  <span></span>
                </div>
              );
            })}
            {data.nodes.map((n) => (
              <button
                className={'node ' + n.type + (selected === n.id ? ' picked' : '')}
                style={{ left: n.x - 42, top: n.y - 31 }}
                onMouseDown={(e) => { e.stopPropagation(); setSelected(n.id); setDrag(n.id); }}
                onClick={() => setSelected(n.id)}
                key={n.id}
              >
                <i>{TYPE_ICON(n.type)}</i>
                <strong>{n.name}</strong>
                <small>{n.ip}</small>
              </button>
            ))}
            <div className="legend">
              <span><i className="router"></i>路由器</span>
              <span><i className="switch"></i>交换机</span>
              <span><i className="server"></i>服务器</span>
            </div>
          </div>
          <div className="canvas-footer">
            <span>拖动节点调整位置 · {data.edges.length} 条连接</span>
            <span>坐标系：画布局部</span>
          </div>
        </section>
        <aside className="inspector">
          <div className="section-title"><span>属性</span><small>{node?.type}</small></div>
          {node ? (
            <>
              <label>设备名称
                <input value={node.name} onChange={(e) => updateNode('name', e.target.value)} />
              </label>
              <label>IP 地址
                <input value={node.ip} onChange={(e) => updateNode('ip', e.target.value)} />
              </label>
              <label>设备类型
                <select value={node.type} onChange={(e) => updateNode('type', e.target.value)}>
                  <option value="router">路由器</option>
                  <option value="switch">交换机</option>
                  <option value="server">服务器</option>
                  <option value="device">终端设备</option>
                </select>
              </label>
              <div className="inspector-actions">
                <button onClick={connect}>⌁ 添加连接</button>
                <button className="danger" onClick={remove}>删除设备</button>
              </div>
              <div className="connections">
                <div className="section-title"><span>连接</span><small>{nodeEdges.length} 条</small></div>
                {nodeEdges.map(({ e, i }) => {
                  const anchor = e[0] === node.id ? 1 : 0;
                  const otherId = e[anchor];
                  const other = data.nodes.find((n) => n.id === otherId);
                  return (
                    <div className="connection" key={`${e[0]}-${e[1]}-${i}`}>
                      <span className={'mini ' + (other?.type || 'device')}></span>
                      <select
                        className="connection-select"
                        value={otherId}
                        onChange={(ev) => rewire(i, anchor, ev.target.value)}
                        title="改接对端设备"
                      >
                        {!other && <option value={otherId}>{otherId}（已失效）</option>}
                        {data.nodes
                          .filter((n) => n.id !== node.id)
                          .map((n) => <option value={n.id} key={n.id}>{n.name}</option>)}
                      </select>
                      <small>在线</small>
                      <button className="unlink" onClick={() => disconnect(i)} title="删除该连接">✕</button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : <p>选择一个设备</p>}
        </aside>
      </div>
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
