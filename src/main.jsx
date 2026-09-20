import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import {
  addNode, updateNode, moveNode, removeNode, nextSelection,
  addEdge, reconnectEdge, removeEdge,
} from './lib/topology.js';
import { migrateTopology } from './lib/migration.js';
import { loadRawTopology, saveTopology } from './lib/storage.js';
import {
  createHistory, pushHistory, undo as undoHistory, redo as redoHistory,
  canUndo, canRedo,
} from './lib/history.js';

function fixNotice(fixes) {
  const parts = [];
  if (fixes.dangling) parts.push(`清理 ${fixes.dangling} 条悬空连线`);
  if (fixes.duplicates) parts.push(`去除 ${fixes.duplicates} 条重复连接`);
  if (fixes.selfLoops) parts.push(`移除 ${fixes.selfLoops} 条自连连接`);
  if (fixes.invalidNodes) parts.push(`丢弃 ${fixes.invalidNodes} 条无效设备记录`);
  if (fixes.fieldsFilled) parts.push(`补全 ${fixes.fieldsFilled} 个设备的缺失字段`);
  return parts.length ? `已修复旧数据：${parts.join('，')}` : '已修复旧数据';
}

function App() {
  // 启动时只做一次：读取本地数据并迁移到可用状态
  const boot = useRef(null);
  if (!boot.current) boot.current = migrateTopology(loadRawTopology());

  const [history, setHistory] = useState(() => createHistory(boot.current.data));
  const [selected, setSelected] = useState(() => boot.current.data.nodes[0]?.id ?? null);
  const [tool, setTool] = useState('select');
  const [notice, setNotice] = useState(() => (boot.current.changed ? fixNotice(boot.current.fixes) : ''));
  const [drag, setDrag] = useState(null);
  const dragSession = useRef(0);
  const board = useRef();

  const data = history.present;
  // 每次状态变化（含撤销/重做）都持久化，刷新后仍停在最近状态
  useEffect(() => saveTopology(data), [data]);

  const node = data.nodes.find(n => n.id === selected) || null;
  const ensureSelection = (d, sel) => (d.nodes.some(n => n.id === sel) ? sel : d.nodes[0]?.id ?? null);
  const commit = (next, mergeKey) => setHistory(h => pushHistory(h, next, mergeKey));

  const undo = () => {
    const next = undoHistory(history);
    if (next === history) return;
    setHistory(next);
    setSelected(s => ensureSelection(next.present, s));
    setNotice('已撤销');
  };
  const redo = () => {
    const next = redoHistory(history);
    if (next === history) return;
    setHistory(next);
    setSelected(s => ensureSelection(next.present, s));
    setNotice('已重做');
  };

  useEffect(() => {
    const onKey = e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const updateNodeField = (k, v) =>
    commit(updateNode(data, selected, { [k]: v }), `prop:${selected}:${k}`);

  const addDevice = partial => {
    const next = addNode(data, { id: 'node' + Date.now(), ...partial });
    commit(next);
    setSelected(next.nodes[next.nodes.length - 1].id);
  };

  const addNodeFromToolbar = () => {
    addDevice({ name: '新设备', type: 'device', x: 500, y: 300, ip: '192.168.0.10' });
    setTool('select');
    setNotice('已添加设备');
  };

  const connect = () => {
    if (!selected) return;
    const other = prompt('输入要连接的设备 ID（例如 sw1）');
    if (!other) return;
    const result = addEdge(data, selected, other.trim());
    if (!result.ok) { setNotice(result.reason); return; }
    commit(result.data);
    setNotice('连接已创建');
  };

  const reconnect = (index, otherName) => {
    const target = prompt(`将「${otherName}」改接到哪个设备？输入目标设备 ID`);
    if (!target) return;
    const result = reconnectEdge(data, index, selected, target.trim());
    if (!result.ok) { setNotice(result.reason); return; }
    commit(result.data);
    setNotice('连接已改接');
  };

  const disconnect = index => {
    commit(removeEdge(data, index));
    setNotice('连接已断开');
  };

  const remove = () => {
    if (!selected) return;
    const next = nextSelection(data.nodes, selected);
    commit(removeNode(data, selected));
    setSelected(next);
    setNotice('设备已删除');
  };

  const save = () => { saveTopology(data); setNotice('拓扑图已保存'); };

  const exportJson = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'network-topology.json';
    a.click();
    setNotice('JSON 已导出');
  };

  const validate = () => {
    const linked = new Set(data.edges.flat());
    const isolated = data.nodes.filter(n => !linked.has(n.id));
    setNotice(isolated.length ? `发现 ${isolated.length} 个孤立节点` : '拓扑检查通过：没有孤立节点');
  };

  const move = e => {
    if (!drag) return;
    const r = board.current.getBoundingClientRect();
    commit(
      moveNode(data, drag, Math.max(35, e.clientX - r.left), Math.max(35, e.clientY - r.top)),
      `drag:${drag}:${dragSession.current}`
    );
  };

  const typeIcon = t => (t === 'router' ? '◉' : t === 'switch' ? '▦' : t === 'server' ? '▣' : '▱');

  return (
    <div className="app">
      <header>
        <div className="brand"><span className="brand-mark">⌁</span><div><strong>NETSCAPE</strong><small>TOPOLOGY STUDIO</small></div></div>
        <div className="file"><span className="dot"></span><div><strong>office-network.json</strong><small>最近保存：刚刚</small></div></div>
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
          <button className={tool === 'connect' ? 'on' : ''} onClick={() => { setTool('connect'); connect(); }}>⌁ 连接</button>
          <button onClick={addNodeFromToolbar}>＋ 设备</button>
          <button onClick={undo} disabled={!canUndo(history)} title="Ctrl+Z">↶ 撤销</button>
          <button onClick={redo} disabled={!canRedo(history)} title="Ctrl+Shift+Z">↷ 重做</button>
        </div>
        <div className="tool-group zoom"><button>−</button><span>100%</span><button>＋</button><button onClick={() => setNotice('画布已居中')}>⌗</button></div>
      </div>
      <div className="workspace">
        <aside className="inventory">
          <div className="section-title"><span>设备库</span><small>{data.nodes.length} 个节点</small></div>
          <div className="device-types">
            {[['router', '◉', '路由器'], ['switch', '▦', '交换机'], ['server', '▣', '服务器'], ['device', '▱', '终端设备']].map(([t, i, l]) => (
              <button onClick={() => addDevice({ name: l, type: t, x: 500, y: 320, ip: '192.168.0.2' })} key={t}><i className={t}>{i}</i>{l}<span>＋</span></button>
            ))}
          </div>
          <div className="section-title nodes-head"><span>图中节点</span><small>点击查看</small></div>
          <div className="node-list">
            {data.nodes.map(n => (
              <button className={selected === n.id ? 'sel' : ''} onClick={() => setSelected(n.id)} key={n.id}>
                <i className={n.type}>{typeIcon(n.type)}</i>
                <span><strong>{n.name}</strong><small>{n.ip}</small></span>
                <b>›</b>
              </button>
            ))}
          </div>
        </aside>
        <section className="canvas-wrap">
          <div className="canvas" ref={board} onMouseMove={move} onMouseUp={() => setDrag(null)}>
            {data.edges.map(([a, b], i) => {
              const n1 = data.nodes.find(n => n.id === a), n2 = data.nodes.find(n => n.id === b);
              if (!n1 || !n2) return null;
              const dx = n2.x - n1.x, dy = n2.y - n1.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
              return <div className="edge" key={i} style={{ left: n1.x, top: n1.y, width: len, transform: `rotate(${ang}deg)` }}><span></span></div>;
            })}
            {data.nodes.map(n => (
              <button
                className={'node ' + n.type + (selected === n.id ? ' picked' : '')}
                style={{ left: n.x - 42, top: n.y - 31 }}
                onMouseDown={e => { e.stopPropagation(); setSelected(n.id); dragSession.current += 1; setDrag(n.id); }}
                onClick={() => setSelected(n.id)}
                key={n.id}
              >
                <i>{typeIcon(n.type)}</i>
                <strong>{n.name}</strong>
                <small>{n.ip}</small>
              </button>
            ))}
            <div className="legend"><span><i className="router"></i>路由器</span><span><i className="switch"></i>交换机</span><span><i className="server"></i>服务器</span></div>
          </div>
          <div className="canvas-footer"><span>拖动节点调整位置 · {data.edges.length} 条连接</span><span>坐标系：画布局部</span></div>
        </section>
        <aside className="inspector">
          <div className="section-title"><span>属性</span><small>{node?.type}</small></div>
          {node ? (
            <>
              <label>设备名称<input value={node.name} onChange={e => updateNodeField('name', e.target.value)} /></label>
              <label>IP 地址<input value={node.ip} onChange={e => updateNodeField('ip', e.target.value)} /></label>
              <label>设备类型
                <select value={node.type} onChange={e => updateNodeField('type', e.target.value)}>
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
                <div className="section-title"><span>连接</span><small>{data.edges.filter(e => e.includes(node.id)).length} 条</small></div>
                {data.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.includes(node.id)).map(({ e, i }) => {
                  const other = data.nodes.find(n => n.id === (e[0] === node.id ? e[1] : e[0]));
                  return (
                    <div className="connection" key={i}>
                      <span className={'mini ' + other?.type}></span>
                      <strong>{other?.name}</strong>
                      <button onClick={() => reconnect(i, other?.name)}>改接</button>
                      <button className="drop" onClick={() => disconnect(i)}>断开</button>
                      <small>在线</small>
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
