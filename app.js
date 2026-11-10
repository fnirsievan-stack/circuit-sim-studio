/* app.js — 电路仿真动画工作台 主逻辑
 * 依赖 components.js (window.CS) 与 custom.js (window.CustomStore)
 */
(function () {
  'use strict';
  const RES = { '1080p': [1920, 1080], '2k': [2560, 1440], '4k': [3840, 2160] };
  const PKG_CLASS = { th: 'pkg-th', smd: 'pkg-smd', ic: 'pkg-ic', other: 'pkg-other' };

  const state = {
    components: [],
    wires: [],
    selectedId: null,
    selectedWireId: null,
    pendingType: null,
    pendingCustomId: null,
    tool: 'select',
    pendingWireFrom: null,
    settings: {
      resolution: '1080p', duration: 5, entrance: 'fade', exit: 'fade',
      speed: 1, density: 14, bg: '#0b1020', accent: '#36e0c8', current: '#ffd54a',
      labels: true, showGrid: true
    }
  };
  let uid = 1;
  const nid = () => 'e' + (uid++);
  const genCustomId = () => 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let flow = { wireDir: {}, liveWires: new Set(), poweredComps: new Set() };
  let playing = false, playStart = 0, clock = 0, exporting = false;
  let mouseLogical = { x: 0, y: 0 };
  let pinEdit = false, dragPin = null, addingPin = false;
  let wireDrag = false;                 // 左键拖拽连线中
  let view = { scale: 1, tx: 0, ty: 0 }; // 画布视图变换（仅编辑时生效）
  let panning = false, lastPan = { x: 0, y: 0 };
  let dragMoved = false;
  let history = [], hi = -1;            // 撤销/重做快照栈

  function worldToLocal(c, wx, wy) {
    const ang = -(c.rotation || 0) * Math.PI / 180;
    const dx = wx - c.x, dy = wy - c.y;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    return { x: Math.round(dx * cos - dy * sin), y: Math.round(dx * sin + dy * cos) };
  }
  function localToWorld(c, lx, ly) {
    const ang = (c.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    return { x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos };
  }

  const canvas = document.getElementById('stage');
  const pctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const selectedComp = () => state.components.find(c => c.id === state.selectedId) || null;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function setStatus(s) { $('status').textContent = s; }
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2400);
  }

  // ---------- 元件 / 导线 ----------
  function addComponent(type, x, y, customDef) {
    let params;
    if (type === 'custom') params = { label: '', value: '' };
    else params = Object.assign({}, CS.COMPONENTS[type].defaults);
    const c = { id: nid(), type, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10, rotation: 0, params };
    if (type === 'custom') c.custom = JSON.parse(JSON.stringify(customDef));
    state.components.push(c); state.selectedId = c.id; state.selectedWireId = null; computeFlow(); renderProps();
    return c;
  }
  function deleteComponent(id) {
    state.components = state.components.filter(c => c.id !== id);
    state.wires = state.wires.filter(w => w.from.id !== id && w.to.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    state.selectedWireId = null;
    computeFlow(); renderProps(); commit();
  }
  function deleteWire(id) {
    state.wires = state.wires.filter(w => w.id !== id);
    if (state.selectedWireId === id) state.selectedWireId = null;
    computeFlow(); renderProps(); commit();
  }
  function addWire(from, to) {
    const bothTerm = from.id != null && to.id != null;
    if (bothTerm && from.id === to.id && from.term === to.term) return;
    if (!bothTerm && from.x != null && to.x != null && from.x === to.x && from.y === to.y) return;
    const dup = state.wires.some(w =>
      (w.from.id === from.id && w.from.term === from.term && w.to.id === to.id && w.to.term === to.term) ||
      (w.from.id === to.id && w.from.term === to.term && w.to.id === from.id && w.to.term === from.term));
    if (dup) return;
    state.wires.push({ id: nid(), from, to });
    computeFlow();
  }

  // ---------- 电流方向计算 (BFS) ----------
  function termWorld(ref) {
    if (ref.x != null) return { x: ref.x, y: ref.y };
    const c = state.components.find(c => c.id === ref.id);
    if (!c) return null;
    return CS.getTerminals(c)[ref.term];
  }
  function getEdges(c) {
    const count = CS.getTerminals(c).length;
    if (c.type === 'custom') {
      if (!c.custom || count < 2 || c.custom.conducts === false) return [];
      return [[0, 1]];
    }
    const def = CS.COMPONENTS[c.type];
    let edges = def && def.edges ? def.edges.slice() : (count >= 2 && CS.conducts(c) ? [[0, 1]] : []);
    return edges.filter(([a, b]) => a < count && b < count);
  }
  function computeFlow() {
    const termPos = {};
    state.components.forEach(c => { CS.getTerminals(c).forEach((t, i) => { termPos[c.id + '_' + i] = { x: t.x, y: t.y }; }); });
    const keyToJ = {}, junctions = [];
    const adj = [];
    const junc = (x, y) => {
      const key = Math.round(x / 6) + ',' + Math.round(y / 6);
      if (keyToJ[key] != null) return keyToJ[key];
      const id = junctions.length; keyToJ[key] = id; junctions.push({}); adj.push([]); return id;
    };
    const termJ = {};
    Object.keys(termPos).forEach(k => { termJ[k] = junc(termPos[k].x, termPos[k].y); });
    const endJ = (ref) => {
      if (ref.x != null) return junc(ref.x, ref.y);
      const c = state.components.find(c => c.id === ref.id);
      if (!c) return null;
      const ts = CS.getTerminals(c);
      if (ref.term >= ts.length) return null;
      return termJ[c.id + '_' + ref.term];
    };
    const edges = [];
    state.wires.forEach(w => {
      const a = endJ(w.from), b = endJ(w.to);
      if (a == null || b == null || a === b) return;
      const e = { a, b, kind: 'wire', ref: w }; edges.push(e); adj[a].push(e); adj[b].push(e);
    });
    state.components.forEach(c => {
      getEdges(c).forEach(([a, b]) => {
        const ja = termJ[c.id + '_' + a], jb = termJ[c.id + '_' + b];
        if (ja != null && jb != null && ja !== jb) {
          const e = { a: ja, b: jb, kind: 'comp', ref: c }; edges.push(e); adj[ja].push(e); adj[jb].push(e);
        }
      });
    });
    const wireDir = {}, liveWires = new Set(), poweredComps = new Set();
    const src = state.components.find(c => { const d = CS.COMPONENTS[c.type]; return d && d.isSource; });
    let start = null;
    if (src) {
      const d = CS.COMPONENTS[src.type];
      const pt = d.posTerm != null ? d.posTerm : 0;
      start = termJ[src.id + '_' + pt]; // 从电源正极出发：电流由 + 流出（符合常规电流方向）
    }
    if (start != null) {
      // BFS 距离（层级）：以电源正极为根，层级越小越靠近正极
      const level = new Array(junctions.length).fill(-1);
      level[start] = 0; const q = [start];
      while (q.length) {
        const cur = q.shift();
        (adj[cur] || []).forEach(e => {
          if (e.kind === 'comp' && e.ref && e.ref.id === src.id) return; // 跳过电源内部边，否则 - 极会被拉到 + 极附近导致方向反
          const nxt = e.a === cur ? e.b : e.a;
          if (level[nxt] < 0) { level[nxt] = level[cur] + 1; q.push(nxt); }
        });
      }
      // 电流方向 = 由低层级节点流向高层级节点（由电源 + 流出，绕回路回到 -）
      state.wires.forEach(w => {
        const a = endJ(w.from), b = endJ(w.to);
        if (a == null || b == null || a === b) return;
        if (level[a] < 0 || level[b] < 0) return; // 不在连通回路内
        let dir;
        if (level[a] < level[b]) dir = 1;       // from -> to
        else if (level[b] < level[a]) dir = -1;  // to -> from
        else dir = (a === endJ(w.from)) ? 1 : -1; // 同层级（极少数环弦）兜底
        wireDir[w.id] = dir; liveWires.add(w.id);
      });
      state.components.forEach(c => {
        getEdges(c).forEach(([a, b]) => {
          const ja = termJ[c.id + '_' + a], jb = termJ[c.id + '_' + b];
          if (ja != null && jb != null && ja !== jb && level[ja] >= 0 && level[jb] >= 0) poweredComps.add(c.id);
        });
      });
    }
    flow = { wireDir, liveWires, poweredComps };
  }

  // ---------- 撤销 / 重做 ----------
  function snapshot() { return JSON.stringify({ components: state.components, wires: state.wires }); }
  function restoreSnapshot(s) {
    const o = JSON.parse(s);
    state.components = o.components; state.wires = o.wires;
    let mx = 0; state.components.concat(state.wires).forEach(o2 => { const m = /(\d+)/.exec(o2.id); if (m) mx = Math.max(mx, +m[1]); });
    uid = mx + 1;
    state.selectedId = null; state.pendingType = null; state.pendingWireFrom = null; wireDrag = false;
    computeFlow(); renderProps();
  }
  function commit() {
    const s = snapshot();
    if (hi >= 0 && history[hi] === s) return;
    history = history.slice(0, hi + 1);
    history.push(s);
    if (history.length > 120) history.shift();
    hi = history.length - 1;
    updateUndoUI();
  }
  function undo() { if (hi <= 0) { toast('没有可撤销的操作'); return; } hi--; restoreSnapshot(history[hi]); updateUndoUI(); setStatus('已撤销'); }
  function redo() { if (hi >= history.length - 1) { toast('没有可重做的操作'); return; } hi++; restoreSnapshot(history[hi]); updateUndoUI(); setStatus('已重做'); }
  function updateUndoUI() {
    const u = $('btnUndo'), r = $('btnRedo');
    if (u) u.disabled = hi <= 0;
    if (r) r.disabled = hi >= history.length - 1;
  }

  // ---------- 渲染 ----------
  function drawGrid(ctx) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    for (let x = 0; x <= 1920; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1080); ctx.stroke(); }
    for (let y = 0; y <= 1080; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1920, y); ctx.stroke(); }
    ctx.restore();
  }
  function drawWire(ctx, w) {
    const a = termWorld(w.from), b = termWorld(w.to);
    if (!a || !b) return;
    const live = flow.liveWires.has(w.id);
    ctx.save();
    ctx.strokeStyle = state.settings.accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.globalAlpha = live ? 1 : 0.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.globalAlpha = 1;
    if (live) {
      const dir = flow.wireDir[w.id] || 1, col = state.settings.current;
      const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const spacing = Math.max(12, 760 / Math.max(4, state.settings.density)); // 由密度推导间距，保证疏密均匀
      const n = Math.max(2, Math.round(len / spacing));
      const PXPS = 90; // 逻辑像素/秒（速度=1），所有导线一致 → 运动速度均匀
      const phase = (clock * state.settings.speed * PXPS) / len;
      for (let i = 0; i < n; i++) {
        let u = ((i / n) + phase) % 1; if (u < 0) u += 1;
        if (dir < 0) u = 1 - u;
        const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
        ctx.fillStyle = col; ctx.globalAlpha = 0.28;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  function drawComponent(ctx, c) {
    if (c.type === 'custom') {
      CustomStore.draw(ctx, c, {
        accent: state.settings.accent, current: state.settings.current,
        powered: flow.poweredComps.has(c.id), labels: state.settings.labels
      });
      return;
    }
    const def = CS.COMPONENTS[c.type];
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((c.rotation || 0) * Math.PI / 180);
    def.draw(ctx, c.params, {
      accent: state.settings.accent, current: state.settings.current,
      powered: flow.poweredComps.has(c.id), labels: state.settings.labels
    });
    ctx.restore();
  }
  function drawTerminals(ctx) {
    const sel = selectedComp();
    state.components.forEach(c => {
      const isSel = sel && c.id === sel.id;
      CS.getTerminals(c).forEach((t, i) => {
        const isP = state.pendingWireFrom && state.pendingWireFrom.id === c.id && state.pendingWireFrom.term === i;
        ctx.save(); ctx.translate(t.x, t.y);
        if (pinEdit && isSel) {
          const on = dragPin === i;
          ctx.fillStyle = on ? '#ffd54a' : '#ffb020';
          ctx.beginPath(); ctx.arc(0, 0, on ? 11 : 9, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#1c2333'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), 0, 0);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, on ? 15 : 13, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillStyle = isP ? '#ffd54a' : state.settings.accent;
          ctx.beginPath(); ctx.arc(0, 0, isP ? 9 : 6, 0, Math.PI * 2); ctx.fill();
          if (isP) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke(); }
        }
        ctx.restore();
      });
    });
  }
  function drawSelection(ctx) {
    if (state.selectedWireId) {
      const w = state.wires.find(x => x.id === state.selectedWireId);
      if (w) {
        const a = termWorld(w.from), b = termWorld(w.to);
        if (a && b) {
          ctx.save(); ctx.strokeStyle = '#2f6bff'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.globalAlpha = 0.35;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
        }
      }
    }
    const c = selectedComp(); if (!c) return;
    ctx.save(); ctx.translate(c.x, c.y);
    ctx.strokeStyle = '#2f6bff'; ctx.lineWidth = 3; ctx.setLineDash([9, 6]);
    ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function drawPendingWire(ctx) {
    if (!state.pendingWireFrom || !mouseLogical) return;
    const a = termWorld(state.pendingWireFrom); if (!a) return;
    ctx.save(); ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouseLogical.x, mouseLogical.y); ctx.stroke();
    ctx.restore();
  }
  function computeEnvelope(t, entrance, exit, W, H) {
    const eDur = 0.16, xDur = 0.16;
    const o = { alpha: 1, sx: 1, sy: 1, tx: 0, ty: 0, rot: 0 };
    const easeIO = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const back = k => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
    const ent = k => {
      k = easeIO(k);
      if (entrance === 'fade') { o.alpha = k; }
      else if (entrance === 'zoom') { o.alpha = Math.min(1, k * 1.5); o.sx = o.sy = 0.6 + 0.4 * k; }
      else if (entrance === 'pop') { o.alpha = Math.min(1, k * 1.5); const b = back(k); o.sx = o.sy = b; }
      else if (entrance === 'slide-left') { o.alpha = Math.min(1, k * 1.4); o.tx = (1 - k) * -W * 0.35; }
      else if (entrance === 'slide-right') { o.alpha = Math.min(1, k * 1.4); o.tx = (1 - k) * W * 0.35; }
      else if (entrance === 'slide-up') { o.alpha = Math.min(1, k * 1.4); o.ty = (1 - k) * H * 0.35; }
      else if (entrance === 'slide-down') { o.alpha = Math.min(1, k * 1.4); o.ty = (1 - k) * -H * 0.35; }
      else if (entrance === 'rotate') { o.alpha = Math.min(1, k * 1.4); o.rot = (1 - k) * -200; }
      else if (entrance === 'drop') { o.alpha = Math.min(1, k * 2); o.ty = (1 - Math.pow(k, 1.6)) * -H * 0.4; }
      else if (entrance === 'flip') { o.alpha = Math.min(1, k * 1.6); o.sx = Math.max(0.02, k); }
    };
    const ex = k => {
      k = easeIO(k);
      if (exit === 'fade') { o.alpha = 1 - k; }
      else if (exit === 'zoom') { o.alpha = 1 - k * 0.6; o.sx = o.sy = 1 + 0.5 * k; }
      else if (exit === 'shrink') { o.alpha = 1 - k; o.sx = o.sy = 1 - 0.5 * k; }
      else if (exit === 'slide-left') { o.alpha = 1 - k * 0.6; o.tx = k * W * 0.35; }
      else if (exit === 'slide-right') { o.alpha = 1 - k * 0.6; o.tx = k * -W * 0.35; }
      else if (exit === 'slide-up') { o.alpha = 1 - k * 0.6; o.ty = k * -H * 0.35; }
      else if (exit === 'slide-down') { o.alpha = 1 - k * 0.6; o.ty = k * H * 0.35; }
      else if (exit === 'rotate') { o.alpha = 1 - k * 0.6; o.rot = k * 200; }
      else if (exit === 'flip') { o.alpha = 1 - k * 0.6; o.sx = Math.max(0.02, 1 - 0.98 * k); }
    };
    if (t < eDur) ent(t / eDur);
    else if (t > 1 - xDur) ex((1 - t) / xDur);
    return o;
  }
  function renderScene(ctx, W, H, t, editing) {
    const s = state.settings;
    ctx.save();
    ctx.fillStyle = s.bg; ctx.fillRect(0, 0, W, H);
    let env = null;
    if (t >= 0) env = computeEnvelope(t, s.entrance, s.exit, W, H);
    ctx.translate(W / 2, H / 2);
    if (env) {
      ctx.translate(env.tx, env.ty);
      if (env.rot) ctx.rotate(env.rot * Math.PI / 180);
      ctx.scale(env.sx, env.sy);
      ctx.globalAlpha *= env.alpha;
    }
    ctx.translate(-W / 2, -H / 2);
    if (editing) { ctx.translate(view.tx, view.ty); ctx.scale(view.scale, view.scale); }
    ctx.scale(W / 1920, H / 1080);
    if (s.showGrid) drawGrid(ctx);
    state.wires.forEach(w => drawWire(ctx, w));
    state.components.forEach(c => drawComponent(ctx, c));
    if (editing) { drawTerminals(ctx); drawSelection(ctx); drawPendingWire(ctx); }
    ctx.restore();
  }
  function loop() {
    if (exporting) { requestAnimationFrame(loop); return; }
    let t = -1;
    if (playing) {
      const dur = state.settings.duration * 1000;
      t = (performance.now() - playStart) / dur;
      if (t >= 1) { t = 1; playing = false; const b = $('btnPlay'); b.textContent = '▶ 播放'; b.classList.remove('active-play'); }
    }
    clock = performance.now() / 1000;
    renderScene(pctx, canvas.width, canvas.height, t, !playing);
    requestAnimationFrame(loop);
  }

  // ---------- 坐标 ----------
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * canvas.width;
    const py = (e.clientY - r.top) / r.height * canvas.height;
    const sx = canvas.width / 1920, sy = canvas.height / 1080;
    return { x: (px - view.tx) / (view.scale * sx), y: (py - view.ty) / (view.scale * sy) };
  }
  function nearestTerminal(pos, maxd) {
    let best = null, bd = maxd;
    state.components.forEach(c => {
      CS.getTerminals(c).forEach((t, i) => { const d = dist(pos, t); if (d < bd) { bd = d; best = { id: c.id, term: i }; } });
    });
    return best;
  }
  function hitComponent(pos) {
    let best = null, bd = 60;
    state.components.forEach(c => { const d = dist(pos, { x: c.x, y: c.y }); if (d < bd) { bd = d; best = c.id; } });
    return best;
  }
  function distToSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
  }
  function hitWire(pos, maxd) {
    let best = null, bd = maxd;
    state.wires.forEach(w => {
      const a = termWorld(w.from), b = termWorld(w.to);
      if (!a || !b) return;
      const d = distToSeg(pos, a, b);
      if (d < bd) { bd = d; best = w.id; }
    });
    return best;
  }

  // ---------- 鼠标交互 ----------
  let dragId = null, dragOff = { x: 0, y: 0 };
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // 中键：平移画布
      e.preventDefault();
      panning = true; lastPan = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (playing || e.button !== 0) return;
    const pos = toLogical(e);
    if (pinEdit) {
      const c = selectedComp();
      if (!c) { toast('请先选中一个元件再编辑引脚'); return; }
      if (addingPin) {
        c.terminals = c.terminals || CS.getLocalTerminals(c).map(t => ({ x: t.x, y: t.y }));
        c.terminals.push(worldToLocal(c, pos.x, pos.y));
        addingPin = false; computeFlow(); renderProps(); commit(); setStatus('已添加引脚（可在画布上拖拽调整）'); return;
      }
      const term = nearestTerminal(pos, 18);
      if (term && term.id === c.id) { dragPin = term.term; return; }
      return;
    }
    if (state.tool === 'wire') {
      const term = nearestTerminal(pos, 18);
      if (term) {
        if (!state.pendingWireFrom) { state.pendingWireFrom = term; setStatus('已选起点，点击另一端端口完成连接'); }
        else if (state.pendingWireFrom.id === term.id && state.pendingWireFrom.term === term.term) { state.pendingWireFrom = null; setStatus('已取消'); }
        else { addWire(state.pendingWireFrom, term); state.pendingWireFrom = null; commit(); setStatus('导线已连接'); }
      } else { state.pendingWireFrom = null; }
      return;
    }
    if (state.tool === 'delete') {
      const wid = hitWire(pos, 10);
      if (wid) { deleteWire(wid); setStatus('已删除导线'); return; }
      const c = hitComponent(pos); if (c) { deleteComponent(c); setStatus('已删除'); }
      return;
    }
    if (state.pendingType === 'custom' && state.pendingCustomId) {
      const d = CustomStore.get(state.pendingCustomId);
      if (d) { addComponent('custom', pos.x, pos.y, d); commit(); }
      state.pendingType = null; state.pendingCustomId = null; updateToolUI();
      setStatus(d ? ('已放置自定义元件：' + d.name) : '自定义元件不存在');
      return;
    }
    if (state.pendingType) {
      addComponent(state.pendingType, pos.x, pos.y); commit();
      const nm = CS.COMPONENTS[state.pendingType] ? CS.COMPONENTS[state.pendingType].name : '自定义';
      state.pendingType = null; updateToolUI();
      setStatus('已放置 ' + nm);
      return;
    }
    // 左键：优先判定是否点在端口 → 拖拽连线
    const term = nearestTerminal(pos, 14);
    if (term) {
      state.selectedId = term.id; state.selectedWireId = null; renderProps();
      state.pendingWireFrom = term; wireDrag = true;
      setStatus('拖到另一端口松开即可连接');
      return;
    }
    const wid = hitWire(pos, 8);
    if (wid) {
      state.selectedWireId = wid; state.selectedId = null; renderProps();
      setStatus('已选中导线：按 Delete 删除，或右键直接删除');
      return;
    }
    const cid = hitComponent(pos);
    if (cid) {
      state.selectedId = cid; state.selectedWireId = null; renderProps();
      const c = selectedComp(); dragId = cid; dragOff = { x: pos.x - c.x, y: pos.y - c.y }; dragMoved = false;
    } else { state.selectedId = null; state.selectedWireId = null; renderProps(); }
  });
  canvas.addEventListener('mousemove', (e) => {
    mouseLogical = toLogical(e);
    if (panning) {
      const r = canvas.getBoundingClientRect();
      view.tx += (e.clientX - lastPan.x) * (canvas.width / r.width);
      view.ty += (e.clientY - lastPan.y) * (canvas.height / r.height);
      lastPan = { x: e.clientX, y: e.clientY };
      return;
    }
    if (dragPin != null && !playing) {
      const c = selectedComp();
      if (c && c.terminals && c.terminals[dragPin] != null) {
        c.terminals[dragPin] = worldToLocal(c, mouseLogical.x, mouseLogical.y);
      }
      return;
    }
    if (dragId && !playing) {
      const c = state.components.find(x => x.id === dragId);
      if (c) { c.x = Math.round((mouseLogical.x - dragOff.x) / 10) * 10; c.y = Math.round((mouseLogical.y - dragOff.y) / 10) * 10; dragMoved = true; }
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (panning && e.button === 1) { panning = false; canvas.style.cursor = ''; return; }
    if (wireDrag) {
      const from = state.pendingWireFrom;
      const to = nearestTerminal(mouseLogical, 18);
      if (to && !(to.id === from.id && to.term === from.term)) { addWire(from, to); commit(); setStatus('导线已连接'); }
      else setStatus('已取消连接');
      wireDrag = false; state.pendingWireFrom = null;
    }
    if (dragId) {
      if (dragMoved) commit();
      dragId = null; computeFlow();
    }
    if (dragPin != null) { dragPin = null; computeFlow(); commit(); }
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (pinEdit) {
      const c = selectedComp(); const pos = toLogical(e);
      if (c && c.terminals && c.terminals.length > 1) {
        const term = nearestTerminal(pos, 18);
        if (term && term.id === c.id) { c.terminals.splice(term.term, 1); computeFlow(); renderProps(); commit(); setStatus('已删除引脚'); return; }
      }
      return;
    }
    const wid = hitWire(toLogical(e), 10);
    if (wid) { deleteWire(wid); setStatus('已删除导线'); return; }
    state.pendingType = null; state.pendingCustomId = null; state.pendingWireFrom = null; wireDrag = false; updateToolUI();
  });
  canvas.addEventListener('wheel', (e) => {
    if (!e.altKey) return; // 仅 Alt + 滚轮 缩放画布
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);
    const my = (e.clientY - r.top) * (canvas.height / r.height);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const ns = Math.min(4, Math.max(0.25, view.scale * factor));
    view.tx = mx - ns * (mx - view.tx) / view.scale;
    view.ty = my - ns * (my - view.ty) / view.scale;
    view.scale = ns;
  }, { passive: false });
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const data = (e.dataTransfer.getData('text/plain') || '');
    const pos = toLogical(e);
    if (data.startsWith('CSC:')) {
      const d = CustomStore.get(data.slice(4));
      if (d) { addComponent('custom', pos.x, pos.y, d); commit(); setStatus('已放置自定义元件：' + d.name); }
    } else if (data.startsWith('CS:') && CS.COMPONENTS[data.slice(3)]) {
      const t = data.slice(3);
      addComponent(t, pos.x, pos.y); commit();
      setStatus('已放置 ' + CS.COMPONENTS[t].name);
    }
  });
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
      if (state.selectedWireId) { deleteWire(state.selectedWireId); setStatus('已删除导线'); }
      else if (state.selectedId) { deleteComponent(state.selectedId); setStatus('已删除'); }
    }
    if (e.key === 'Escape') { state.pendingType = null; state.pendingCustomId = null; state.pendingWireFrom = null; wireDrag = false; state.selectedWireId = null; state.selectedId = null; updateToolUI(); renderProps(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault(); redo();
    }
  });

  // ---------- 属性面板 ----------
  function renderProps() {
    if (state.selectedWireId) {
      const w = state.wires.find(x => x.id === state.selectedWireId);
      const empty = $('selEmpty'), box = $('selProps');
      if (!w) { empty.classList.remove('hidden'); box.classList.add('hidden'); return; }
      empty.classList.add('hidden'); box.classList.remove('hidden');
      const a = termWorld(w.from), b = termWorld(w.to);
      const len = (a && b) ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      box.innerHTML = `<div class="heading">导线</div>` +
        `<div class="prop-row"><label>类型</label><span>${w.from.x != null || w.to.x != null ? '含自由节点' : '元件端口'}</span></div>` +
        `<div class="prop-row"><label>长度</label><span>${(len / 10).toFixed(1)} 单位</span></div>` +
        `<div class="prop-row"><label>删除</label><button id="ppDelWire" class="btn btn-ghost" style="color:var(--danger)">删除导线</button></div>`;
      box.querySelector('#ppDelWire').onclick = () => { deleteWire(state.selectedWireId); setStatus('已删除导线'); };
      return;
    }
    const c = selectedComp();
    const empty = $('selEmpty'), box = $('selProps');
    if (!c) { empty.classList.remove('hidden'); box.classList.add('hidden'); return; }
    empty.classList.add('hidden'); box.classList.remove('hidden');
    const nm = c.type === 'custom' ? (c.custom ? c.custom.name : '自定义元件') : CS.COMPONENTS[c.type].name;
    let h = `<div class="heading">${nm}</div>`;
    h += `<div class="prop-row"><label>旋转</label><div class="rotate-btns"><button data-act="L">⟲</button><button data-act="R">⟳</button></div></div>`;
    h += `<div class="prop-row"><label>标签</label><input type="text" id="ppLabel" value="${esc(c.params.label || '')}"></div>`;
    h += `<div class="prop-row"><label>数值</label><input type="number" id="ppVal" value="${c.params.value != null ? c.params.value : ''}" placeholder="可选"></div>`;
    const closedTypes = ['switch_toggle', 'button', 'relay'];
    if (closedTypes.includes(c.type)) h += `<div class="prop-row"><label>${c.type === 'button' ? '按下' : '闭合'}</label><input type="checkbox" id="ppClosed" ${c.params.closed ? 'checked' : ''}></div>`;
    if (c.type === 'switch2') h += `<div class="prop-row"><label>掷位</label><select id="ppPos"><option value="a"${c.params.position !== 'b' ? ' selected' : ''}>A</option><option value="b"${c.params.position === 'b' ? ' selected' : ''}>B</option></select></div>`;
    h += `<div class="prop-row"><label>引脚 (${CS.getTerminals(c).length})</label><button id="ppPinEdit" class="btn ${pinEdit ? 'btn-primary' : ''} btn-sm">${pinEdit ? '完成编辑' : '编辑引脚'}</button></div>`;
    if (pinEdit) h += `<div class="pin-hint">拖拽引脚移动 · 右键画布删除 · 或点“添加引脚”</div><div class="prop-row"><button id="ppAddPin" class="btn btn-sm full">＋ 添加引脚</button></div>`;
    h += `<div class="prop-row"><label>删除</label><button id="ppDel" class="btn btn-ghost" style="color:var(--danger)">删除</button></div>`;
    box.innerHTML = h;
    box.querySelector('[data-act=L]').onclick = () => { c.rotation = ((c.rotation || 0) - 90 + 360) % 360; computeFlow(); commit(); };
    box.querySelector('[data-act=R]').onclick = () => { c.rotation = ((c.rotation || 0) + 90) % 360; computeFlow(); commit(); };
    box.querySelector('#ppLabel').oninput = (ev) => { c.params.label = ev.target.value; };
    box.querySelector('#ppVal').oninput = (ev) => { c.params.value = ev.target.value === '' ? '' : (parseFloat(ev.target.value) || 0); };
    if (closedTypes.includes(c.type)) box.querySelector('#ppClosed').onchange = (ev) => { c.params.closed = ev.target.checked; computeFlow(); };
    if (c.type === 'switch2') box.querySelector('#ppPos').onchange = (ev) => { c.params.position = ev.target.value; computeFlow(); };
    const pe = box.querySelector('#ppPinEdit');
    if (pe) pe.onclick = () => {
      if (!pinEdit) {
        const cc = selectedComp();
        cc.terminals = cc.terminals || CS.getLocalTerminals(cc).map(t => ({ x: t.x, y: t.y }));
        pinEdit = true; addingPin = false;
        setStatus('引脚编辑中：拖拽移动，点“添加引脚”后点击画布放置');
      } else { pinEdit = false; addingPin = false; setStatus('已退出引脚编辑'); }
      renderProps();
    };
    const ap = box.querySelector('#ppAddPin');
    if (ap) ap.onclick = () => { addingPin = true; setStatus('点击画布放置新引脚'); };
    box.querySelector('#ppDel').onclick = () => { deleteComponent(c.id); setStatus('已删除'); };
  }

  // ---------- 工具 UI ----------
  function updateToolUI() {
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === state.tool));
    document.querySelectorAll('.comp-btn').forEach(b => b.classList.toggle('active', b.dataset.type === state.pendingType && state.pendingType !== 'custom'));
    canvas.style.cursor = state.pendingType ? 'copy' : (state.tool === 'wire' ? 'crosshair' : 'default');
  }

  // ---------- 播放 / 导出 ----------
  function pickMime() {
    const list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
    return '';
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function fmt(ms) { const s = Math.floor(ms / 1000), m = Math.floor(s / 60); return String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

  $('btnPlay').onclick = () => {
    if (playing) { playing = false; const b = $('btnPlay'); b.textContent = '▶ 播放'; b.classList.remove('active-play'); return; }
    if (state.components.length === 0) { toast('画布为空，请先放置元件'); return; }
    computeFlow();
    playing = true; playStart = performance.now(); state.selectedId = null; pinEdit = false; addingPin = false; renderProps();
    const b = $('btnPlay'); b.textContent = '⏸ 暂停'; b.classList.add('active-play');
  };
  $('btnExportPng').onclick = () => {
    const [W, H] = RES[state.settings.resolution];
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    renderScene(off.getContext('2d'), W, H, 0.5, false);
    off.toBlob(b => { downloadBlob(b, `circuit-${Date.now()}.png`); toast('PNG 已导出 ✓'); }, 'image/png');
  };
  $('btnExportVideo').onclick = async () => {
    if (state.components.length === 0) { toast('画布为空，请先放置元件'); return; }
    const [W, H] = RES[state.settings.resolution];
    const dur = state.settings.duration * 1000;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const octx = off.getContext('2d');
    let stream;
    const cap = off.captureStream || off.mozCaptureStream;
    try { stream = cap.call(off, 30); } catch (e) { toast('当前浏览器不支持视频捕获'); return; }
    const mime = pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch (e) { toast('无法创建录制器：' + e.message); return; }
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
        downloadBlob(blob, `circuit-anim-${Date.now()}.webm`); res();
      };
    });
    computeFlow();
    playing = false; exporting = true;
    const pb = $('btnPlay'); pb.textContent = '▶ 播放'; pb.classList.remove('active-play');
    rec.start();
    $('recDot').classList.remove('hidden');
    $('recTime').classList.remove('hidden');
    $('recTime').textContent = '00:00 / ' + fmt(dur);
    setStatus('正在导出视频…');
    const start = performance.now();
    await new Promise(res => {
      function frame() {
        const el = performance.now() - start;
        const t = Math.min(el / dur, 1);
        clock = performance.now() / 1000;
        renderScene(octx, W, H, t, false);
        pctx.clearRect(0, 0, canvas.width, canvas.height);
        pctx.drawImage(off, 0, 0, canvas.width, canvas.height);
        $('recTime').textContent = fmt(el) + ' / ' + fmt(dur);
        if (el < dur) requestAnimationFrame(frame); else { rec.stop(); res(); }
      }
      requestAnimationFrame(frame);
    });
    await done;
    $('recDot').classList.add('hidden');
    $('recTime').classList.add('hidden');
    exporting = false;
    setStatus('导出完成 ✓');
    toast(`视频已导出 (${W}×${H}) ✓`);
  };

  // ---------- 工程导出 / 导入 ----------
  $('btnExportProj').onclick = () => {
    const data = {
      format: 'circuitsim-project', version: 1,
      settings: state.settings, components: state.components, wires: state.wires,
      custom: CustomStore.list()
    };
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `circuit-project-${Date.now()}.json`);
    toast('工程已导出（含自定义元件）✓');
  };
  $('btnImportProj').onclick = () => $('importFile').click();
  $('importFile').onchange = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result);
        if (!data || data.format !== 'circuitsim-project') { toast('文件格式不正确'); return; }
        state.components = data.components || [];
        state.wires = data.wires || [];
        Object.assign(state.settings, data.settings || {});
        (data.custom || []).forEach(d => CustomStore.upsert(d));
        // 从元件内嵌的自定义定义也补回元件库
        state.components.forEach(c => { if (c.type === 'custom' && c.custom) CustomStore.upsert(c.custom); });
        let mx = 0; state.components.concat(state.wires).forEach(o => { const m = /(\d+)/.exec(o.id); if (m) mx = Math.max(mx, +m[1]); });
        uid = mx + 1;
        state.selectedId = null; state.pendingType = null; state.pendingCustomId = null;
        applySettingsUI(); computeFlow(); renderProps(); renderCustomList(); commit();
        setStatus('工程已导入 ✓');
        toast('工程已导入 ✓');
      } catch (err) { toast('解析失败：' + err.message); }
    };
    rd.readAsText(f);
    e.target.value = '';
  };

  // ---------- 预设 (localStorage) ----------
  const PK = 'cs_presets_v1';
  function loadPresets() { try { return JSON.parse(localStorage.getItem(PK)) || []; } catch (e) { return []; } }
  function savePresets(arr) { try { localStorage.setItem(PK, JSON.stringify(arr)); } catch (e) { toast('保存失败：' + e.message); } }
  function refreshPresetUI() {
    const arr = loadPresets();
    const sel = $('presetSelect'); sel.innerHTML = '<option value="">— 载入预设 —</option>';
    const list = $('presetList'); list.innerHTML = '';
    if (arr.length === 0) list.innerHTML = '<p class="hint">暂无预设，先在画布上搭建电路再保存。</p>';
    arr.forEach(p => {
      const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; sel.appendChild(o);
      const item = document.createElement('div'); item.className = 'preset-item';
      const d = new Date(p.ts);
      item.innerHTML = `<div><div class="nm">${esc(p.name)}</div><div class="meta">${p.data.components.length} 元件 · ${d.toLocaleString()}</div></div>`;
      const acts = document.createElement('div'); acts.className = 'acts';
      const bL = document.createElement('button'); bL.textContent = '载入';
      bL.onclick = () => loadPreset(p.name);
      const bD = document.createElement('button'); bD.className = 'del'; bD.textContent = '删除';
      bD.onclick = () => { savePresets(arr.filter(x => x.name !== p.name)); refreshPresetUI(); toast('已删除预设'); };
      acts.appendChild(bL); acts.appendChild(bD); item.appendChild(acts); list.appendChild(item);
    });
  }
  function savePreset(name) {
    name = (name || '').trim();
    if (!name) { toast('请输入预设名称'); return; }
    const arr = loadPresets().filter(p => p.name !== name);
    arr.push({ name, ts: Date.now(), data: { components: state.components, wires: state.wires }, settings: state.settings });
    savePresets(arr); refreshPresetUI(); toast('预设已保存：' + name);
  }
  function loadPreset(name) {
    const p = loadPresets().find(x => x.name === name);
    if (!p) return;
    state.components = JSON.parse(JSON.stringify(p.data.components));
    state.wires = JSON.parse(JSON.stringify(p.data.wires));
    Object.assign(state.settings, p.data.settings || {});
    let mx = 0; state.components.concat(state.wires).forEach(o => { const m = /(\d+)/.exec(o.id); if (m) mx = Math.max(mx, +m[1]); });
    uid = mx + 1;
    state.selectedId = null; state.pendingType = null; state.pendingCustomId = null;
    applySettingsUI(); computeFlow(); renderProps(); commit(); setStatus('已载入预设：' + name);
  }
  $('btnSavePreset').onclick = () => { const n = prompt('预设名称：', '我的电路'); if (n) savePreset(n); };
  $('btnSavePreset2').onclick = () => savePreset($('presetName').value);
  $('btnLoadPreset').onclick = () => { const n = $('presetSelect').value; if (n) loadPreset(n); else toast('请先选择预设'); };
  $('btnDeletePreset').onclick = () => {
    const n = $('presetSelect').value; if (!n) { toast('请先选择预设'); return; }
    savePresets(loadPresets().filter(x => x.name !== n)); refreshPresetUI(); toast('已删除预设');
  };

  // ---------- 设置绑定 ----------
  function applySettingsUI() {
    const s = state.settings;
    $('setResolution').value = s.resolution;
    $('setDuration').value = s.duration; $('lblDuration').textContent = (+s.duration).toFixed(1);
    $('setEntrance').value = s.entrance; $('setExit').value = s.exit;
    $('setSpeed').value = s.speed; $('lblSpeed').textContent = (+s.speed).toFixed(1);
    $('setDensity').value = s.density; $('lblDensity').textContent = s.density;
    $('setBg').value = s.bg; $('setAccent').value = s.accent; $('setCurrent').value = s.current;
    $('setLabels').checked = s.labels; $('chkGrid').checked = s.showGrid;
  }
  function bindSettings() {
    $('setResolution').onchange = e => state.settings.resolution = e.target.value;
    $('setDuration').oninput = e => { state.settings.duration = +e.target.value; $('lblDuration').textContent = (+e.target.value).toFixed(1); };
    $('setEntrance').onchange = e => state.settings.entrance = e.target.value;
    $('setExit').onchange = e => state.settings.exit = e.target.value;
    $('setSpeed').oninput = e => { state.settings.speed = +e.target.value; $('lblSpeed').textContent = (+e.target.value).toFixed(1); };
    $('setDensity').oninput = e => { state.settings.density = +e.target.value; $('lblDensity').textContent = e.target.value; };
    $('setBg').oninput = e => state.settings.bg = e.target.value;
    $('setAccent').oninput = e => state.settings.accent = e.target.value;
    $('setCurrent').oninput = e => state.settings.current = e.target.value;
    $('setLabels').onchange = e => state.settings.labels = e.target.checked;
    $('chkGrid').onchange = e => { state.settings.showGrid = e.target.checked; };
    $('btnFit').onclick = () => setStatus('提示：画布以 16:9 自适应显示');
  }

  // ---------- 自定义元件 ----------
  function renderCustomList() {
    const wrap = $('customList'); wrap.innerHTML = '';
    CustomStore.list().forEach(def => {
      const item = document.createElement('div'); item.className = 'custom-item';
      item.draggable = true;
      item.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', 'CSC:' + def.id);
        ev.dataTransfer.effectAllowed = 'copy';
      });
      item.innerHTML = `<div class="ci-ico">${CustomStore.iconMarkup(def)}</div><div class="ci-name">${esc(def.name)}</div>` +
        `<div class="ci-acts"><button data-act="edit">编辑</button><button class="del" data-act="del">删</button></div>`;
      item.onclick = (ev) => {
        if (ev.target.dataset.act) return;
        state.pendingType = 'custom'; state.pendingCustomId = def.id; state.tool = 'select'; state.pendingWireFrom = null; updateToolUI();
        setStatus('点击画布放置：' + def.name);
      };
      item.querySelector('[data-act=edit]').onclick = (ev) => { ev.stopPropagation(); openCustomEditor(def); };
      item.querySelector('[data-act=del]').onclick = (ev) => { ev.stopPropagation(); CustomStore.remove(def.id); renderCustomList(); toast('已删除自定义元件'); };
      wrap.appendChild(item);
    });
  }
  let cmDef = null, cmTerms = [];
  function syncMode() {
    const m = $('cmMode').value;
    $('cmSvgField').classList.toggle('hidden', m !== 'svg');
    $('cmImgField').classList.toggle('hidden', m !== 'image');
  }
  function renderPreview() {
    const cv = $('cmPreview');
    const W = +cmDef.width || 120, H = +cmDef.height || 80;
    cv.width = 240; cv.height = Math.round(240 * H / W);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, cv.width, cv.height);
    const scale = cv.width / W;
    const paint = (img) => { if (img) ctx.drawImage(img, 0, 0, cv.width, cv.height); };
    if (cmDef.mode === 'image' && cmDef.img) { const im = new Image(); im.onload = () => paint(im); im.src = cmDef.img; }
    else if (cmDef.mode === 'svg' && cmDef.svg && cmDef.svg.trim()) { const im = new Image(); im.onload = () => paint(im); im.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(CustomStore.normalizeSvg(cmDef)); }
    cmTerms.forEach((t, i) => {
      const x = (t.x + W / 2) * scale, y = (t.y + H / 2) * scale;
      ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b1020'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), x, y);
    });
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.beginPath();
    ctx.moveTo(cv.width / 2, 0); ctx.lineTo(cv.width / 2, cv.height); ctx.moveTo(0, cv.height / 2); ctx.lineTo(cv.width, cv.height / 2); ctx.stroke();
  }
  function renderTermList() {
    const el = $('cmTermList'); el.innerHTML = '';
    cmTerms.forEach((t, i) => {
      const d = document.createElement('div'); d.className = 't';
      d.innerHTML = `<span>端口${i + 1}: (${t.x}, ${t.y})</span><button>×</button>`;
      d.querySelector('button').onclick = () => { cmTerms.splice(i, 1); renderPreview(); renderTermList(); };
      el.appendChild(d);
    });
  }
  function openCustomEditor(existing) {
    cmDef = existing ? JSON.parse(JSON.stringify(existing)) : { id: genCustomId(), name: '', mode: 'svg', svg: '', img: '', width: 120, height: 80, conducts: true, valueUnit: '' };
    cmTerms = existing ? JSON.parse(JSON.stringify(existing.terminals || [])) : [];
    $('cmName').value = cmDef.name || '';
    $('cmMode').value = cmDef.mode || 'svg';
    $('cmSvg').value = cmDef.svg || '';
    $('cmUnit').value = cmDef.valueUnit || '';
    $('cmConducts').checked = cmDef.conducts !== false;
    $('cmW').value = cmDef.width || 120; $('cmH').value = cmDef.height || 80;
    if (cmDef.mode === 'image') $('cmImg').value = '';
    syncMode(); renderPreview(); renderTermList();
    $('customModal').classList.remove('hidden');
  }
  function closeCustomEditor() { $('customModal').classList.add('hidden'); cmDef = null; cmTerms = []; }
  function bindCustomEditor() {
    $('btnNewCustom').onclick = () => openCustomEditor(null);
    $('cmClose').onclick = closeCustomEditor;
    $('cmCancel').onclick = closeCustomEditor;
    $('cmMode').onchange = () => { cmDef.mode = $('cmMode').value; syncMode(); renderPreview(); };
    $('cmSvg').oninput = () => { cmDef.svg = $('cmSvg').value; renderPreview(); };
    $('cmW').oninput = () => { cmDef.width = +$('cmW').value || 120; renderPreview(); };
    $('cmH').oninput = () => { cmDef.height = +$('cmH').value || 80; renderPreview(); };
    $('cmImg').onchange = (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { cmDef.img = rd.result; renderPreview(); };
      rd.readAsDataURL(f);
    };
    $('cmPreview').onclick = (e) => {
      const cv = $('cmPreview'); const r = cv.getBoundingClientRect();
      const W = +cmDef.width || 120, H = +cmDef.height || 80, scale = cv.width / W;
      const px = (e.clientX - r.left) / r.width * cv.width;
      const py = (e.clientY - r.top) / r.height * cv.height;
      cmTerms.push({ x: Math.round(px / scale - W / 2), y: Math.round(py / scale - H / 2), label: String(cmTerms.length + 1) });
      renderPreview(); renderTermList();
    };
    $('cmSave').onclick = () => {
      const name = $('cmName').value.trim();
      if (!name) { toast('请填写名称'); return; }
      if (cmTerms.length === 0) { toast('请至少添加一个端口'); return; }
      cmDef.name = name; cmDef.width = +cmDef.width || 120; cmDef.height = +cmDef.height || 80;
      cmDef.conducts = $('cmConducts').checked; cmDef.valueUnit = $('cmUnit').value; cmDef.terminals = cmTerms;
      if (cmDef.mode === 'svg') cmDef.img = ''; else cmDef.svg = '';
      CustomStore.upsert(cmDef); renderCustomList(); closeCustomEditor(); toast('自定义元件已保存：' + name);
    };
  }

  // ---------- 选项卡 / 工具 ----------
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-body').forEach(b => b.classList.add('hidden'));
      tab.classList.add('active');
      document.querySelector(`.tab-body[data-body="${tab.dataset.tab}"]`).classList.remove('hidden');
    };
  });
  document.querySelectorAll('.tool').forEach(b => {
    b.onclick = () => { state.tool = b.dataset.tool; state.pendingType = null; state.pendingCustomId = null; state.pendingWireFrom = null; updateToolUI(); setStatus('工具：' + b.textContent.trim()); };
  });

  // ---------- 元件库（分类 + 搜索） ----------
  let activeCat = 'all';
  function buildPalette() {
    const pal = $('palette');
    pal.innerHTML = '';
    CS.CATEGORIES.forEach(cat => {
      const types = Object.keys(CS.COMPONENTS).filter(t => CS.COMPONENTS[t].cat === cat.key);
      if (!types.length) return;
      const sec = document.createElement('div'); sec.className = 'cat-section'; sec.dataset.cat = cat.key;
      const title = document.createElement('div'); title.className = 'cat-title';
      title.innerHTML = `<span>${cat.name}</span><span class="cat-count">${types.length}</span>`;
      sec.appendChild(title);
      const grid = document.createElement('div'); grid.className = 'palette';
      types.forEach(type => {
        const def = CS.COMPONENTS[type];
        const b = document.createElement('button'); b.className = 'comp-btn';
        b.dataset.type = type; b.dataset.name = def.name; b.dataset.cat = cat.key;
        const pkgLabel = CS.PKG_LABEL[def.pkg] || '';
        b.innerHTML = CS.svgFor(type) + `<span>${def.name}</span>` + (pkgLabel ? `<i class="pkg ${PKG_CLASS[def.pkg] || ''}">${pkgLabel}</i>` : '');
        b.title = def.name;
        b.draggable = true;
        b.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.setData('text/plain', 'CS:' + type);
          ev.dataTransfer.effectAllowed = 'copy';
        });
        b.onclick = () => {
          state.pendingType = type; state.tool = 'select'; state.pendingCustomId = null; state.pendingWireFrom = null; updateToolUI();
          setStatus('点击画布放置：' + def.name);
        };
        grid.appendChild(b);
      });
      sec.appendChild(grid);
      pal.appendChild(sec);
    });
    buildCatFilter();
    filterPalette();
  }
  function buildCatFilter() {
    const wrap = $('catFilter'); if (!wrap) return;
    wrap.innerHTML = '';
    const mk = (key, name) => {
      const b = document.createElement('button'); b.className = 'chip' + (activeCat === key ? ' active' : ''); b.textContent = name;
      b.onclick = () => { activeCat = key; buildCatFilter(); filterPalette(); };
      wrap.appendChild(b);
    };
    mk('all', '全部');
    CS.CATEGORIES.forEach(c => mk(c.key, c.name));
  }
  function filterPalette() {
    const q = ($('compSearch').value || '').trim().toLowerCase();
    document.querySelectorAll('.cat-section').forEach(sec => {
      let visible = 0;
      sec.querySelectorAll('.comp-btn').forEach(b => {
        const hay = (b.dataset.name + ' ' + b.dataset.type + ' ' + (CS.PKG_LABEL[CS.COMPONENTS[b.dataset.type].pkg] || '')).toLowerCase();
        const okName = !q || hay.includes(q);
        const okCat = activeCat === 'all' || b.dataset.cat === activeCat;
        const show = okName && okCat;
        b.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      sec.classList.toggle('hidden', visible === 0);
    });
  }
  function demoCircuit() {
    const bat = addComponent('battery', 980, 760); bat.params.voltage = 12;
    const res = addComponent('resistor_carbon', 980, 360); res.params.value = 220;
    const led = addComponent('led', 1455, 560);
    const TL = { x: 560, y: 360 }, BL = { x: 560, y: 760 }, TR = { x: 1400, y: 360 }, BR = { x: 1510, y: 760 };
    addWire({ id: res.id, term: 0 }, TL);
    addWire({ id: res.id, term: 1 }, TR);
    addWire({ id: led.id, term: 0 }, TR);
    addWire({ id: led.id, term: 1 }, BR);
    addWire({ id: bat.id, term: 1 }, BR);
    addWire({ id: bat.id, term: 0 }, BL);
    addWire(TL, BL);
    state.selectedId = null; computeFlow(); renderProps();
  }
  $('btnUndo').onclick = () => undo();
  $('btnRedo').onclick = () => redo();
  $('btnFit').onclick = () => { view = { scale: 1, tx: 0, ty: 0 }; setStatus('视图已复位'); };
  $('btnClear').onclick = () => {
    if (state.components.length && !confirm('确认清空画布？')) return;
    state.components = []; state.wires = []; state.selectedId = null; computeFlow(); renderProps(); commit(); setStatus('已清空');
  };

  buildPalette();
  $('compSearch').addEventListener('input', filterPalette);
  bindSettings();
  bindCustomEditor();
  applySettingsUI();
  updateToolUI();
  refreshPresetUI();
  renderCustomList();
  demoCircuit();
  computeFlow();
  commit();
  requestAnimationFrame(loop);
  setStatus('就绪');
})();
