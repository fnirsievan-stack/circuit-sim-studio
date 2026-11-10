/* components.js — 元器件定义、端口与 Canvas 绘制（仿真实物风格，按类别/封装组织）
 * 设计空间 1920×1080。每个元件的 terminals 为本地坐标(未旋转)，
 * custom 元件的符号与端口存于 c.custom / c.terminals。
 * 字段说明：
 *   cat  类别键；pkg 封装：'th'(直插) / 'smd'(贴片) / 'ic'(芯片) / 'other'
 *   open true=不参与电流导通（电容/天线/接地/芯片等黑盒）
 */
(function (global) {
  // ---------- 通用绘制基元 ----------
  function txt(ctx, s, x, y, size, color, align) {
    ctx.save();
    ctx.fillStyle = color || 'rgba(255,255,255,.82)';
    ctx.font = `${size || 22}px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y); ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function lead(ctx, x0, x1, y, w) {           // 水平金属引脚
    ctx.save();
    const g = ctx.createLinearGradient(0, y - w, 0, y + w);
    g.addColorStop(0, '#f2f4f8'); g.addColorStop(.5, '#aeb6c6'); g.addColorStop(1, '#767e92');
    ctx.strokeStyle = g; ctx.lineWidth = w * 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.restore();
  }
  function leadV(ctx, y0, y1, x, w) {          // 垂直金属引脚
    ctx.save();
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, '#f2f4f8'); g.addColorStop(.5, '#aeb6c6'); g.addColorStop(1, '#767e92');
    ctx.strokeStyle = g; ctx.lineWidth = w * 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.restore();
  }
  function cyl(ctx, x0, x1, r, top, mid, bot, cap) {  // 水平胶囊（带高光）
    ctx.save();
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, top); g.addColorStop(.45, mid); g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, -r); ctx.lineTo(x1, -r);
    ctx.arc(x1, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(x0, r);
    ctx.arc(x0, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, -r * 0.42, (x1 - x0) * 0.34, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    if (cap) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, r * 0.42, (x1 - x0) * 0.34, r * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function disc(ctx, x, y, r, top, mid, bot) {
    ctx.save();
    const g = ctx.createRadialGradient(x - r * .35, y - r * .35, r * .15, x, y, r);
    g.addColorStop(0, top); g.addColorStop(.7, mid); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function copperGrad(ctx, cx, cy) {
    const g = ctx.createLinearGradient(cx, cy - 14, cx, cy + 14);
    g.addColorStop(0, '#f0c27a'); g.addColorStop(.5, '#b9762c'); g.addColorStop(1, '#6e3f12'); return g;
  }
  function drawCoil(ctx, x0, x1, ry, lw) {
    const n = Math.max(3, Math.round((x1 - x0) / 11));
    const step = (x1 - x0) / n;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const cx = x0 + step * (i + 0.5);
      ctx.strokeStyle = copperGrad(ctx, cx, 0); ctx.lineWidth = lw || 7;
      ctx.beginPath(); ctx.ellipse(cx, 0, step * 0.5, ry, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  function valLabel(p, unit) {
    if (p.label) return p.label;
    if (p.value === '' || p.value == null) return '';
    return String(p.value) + (unit || '');
  }
  function pinH(t) { return [{ x: -t, y: 0 }, { x: t, y: 0 }]; }
  function pinV(t) { return [{ x: 0, y: -t }, { x: 0, y: t }]; }

  // ---------- 家族绘制器（几何与 terminals 保持一致） ----------
  function fAxial(ctx, p, env, o) {            // 直插轴向元件（电阻/电感/保险丝等）
    const t = o.t || 55, bw = o.bw || 38, lw = o.lw || 2.6;
    lead(ctx, -t, -bw, 0, lw); lead(ctx, bw, t, 0, lw);
    if (o.coil) drawCoil(ctx, -bw, bw, o.ry || 15, lw + 4);
    else {
      cyl(ctx, -bw, bw, o.r || 14, o.top, o.mid, o.bot, true);
      if (o.bands) o.bands.forEach((c, i) => { ctx.save(); ctx.fillStyle = c; roundRect(ctx, -bw + 6 + i * 9, -o.r, 5, o.r * 2, 2); ctx.fill(); ctx.restore(); });
      if (o.ring) { ctx.save(); ctx.fillStyle = o.ring; roundRect(ctx, bw - 8, -o.r, 6, o.r * 2, 2); ctx.fill(); ctx.restore(); }
    }
    if (env.labels && valLabel(p, o.unit)) txt(ctx, valLabel(p, o.unit), 0, (o.r || 14) + 22, 22, 'rgba(255,255,255,.82)');
  }
  function fSmd(ctx, p, env, o) {              // 贴片两引脚元件
    const t = o.t || 28, w = o.w || 56, h = o.h || 30;
    ctx.save(); ctx.fillStyle = '#cfd5e0';
    roundRect(ctx, -t - 2, -h / 2 + 2, 12, h - 4, 2); ctx.fill();
    roundRect(ctx, t - 10, -h / 2 + 2, 12, h - 4, 2); ctx.fill(); ctx.restore();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, o.top || '#3a3f4a'); g.addColorStop(.5, o.mid || '#23262e'); g.addColorStop(1, o.bot || '#15171c');
    ctx.save(); ctx.fillStyle = g; roundRect(ctx, -w / 2, -h / 2, w, h, 4); ctx.fill(); ctx.restore();
    if (o.mark === 'tant') { ctx.save(); ctx.fillStyle = '#e0a93b'; roundRect(ctx, -w / 2 + 5, -3, 9, 6, 1); ctx.fill(); ctx.restore(); }
    if (o.mark === 'cap') { ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(ctx, -w / 2 + 4, -h / 2 + 4, 8, h - 8, 2); ctx.fill(); ctx.restore(); }
    if (o.mark === 'var') { ctx.save(); ctx.fillStyle = '#4aa3ff'; ctx.beginPath(); ctx.moveTo(-w / 4, -h / 3); ctx.lineTo(w / 4, h / 3); ctx.lineTo(-w / 4, h / 3); ctx.closePath(); ctx.fill(); ctx.restore(); }
    if (env.powered && o.glow) { ctx.save(); const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 42); rg.addColorStop(0, env.current); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    if (env.labels && valLabel(p, o.unit)) txt(ctx, valLabel(p, o.unit), 0, h / 2 + 18, 20, 'rgba(255,255,255,.82)');
  }
  function fDiode(ctx, p, env, o) {            // 玻璃/塑封二极管
    const t = o.t || 55, bw = 14;
    lead(ctx, -t, -bw, 0, 2.4); lead(ctx, bw, t, 0, 2.4);
    if (o.glass) { ctx.save(); const g = ctx.createLinearGradient(-bw, 0, bw, 0); g.addColorStop(0, 'rgba(220,230,245,.35)'); g.addColorStop(.5, 'rgba(180,200,225,.6)'); g.addColorStop(1, 'rgba(120,140,170,.4)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, bw, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    else { cyl(ctx, -bw, bw, 9, '#3a3f4a', '#23262e', '#15171c', true); }
    if (o.schottky) { ctx.save(); ctx.strokeStyle = '#9fe0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-bw + 2, -7); ctx.lineTo(bw - 2, -7); ctx.moveTo(-bw + 2, 7); ctx.lineTo(bw - 2, 7); ctx.stroke(); ctx.restore(); }
    else { ctx.save(); ctx.fillStyle = '#cfd6e0'; roundRect(ctx, -3, -9, 6, 18, 2); ctx.fill(); ctx.restore(); }
    ctx.save(); ctx.strokeStyle = o.catLine || '#ffd36a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
    if (o.zener) { ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(7, -6); ctx.moveTo(2, 6); ctx.lineTo(7, 6); ctx.stroke(); }
    ctx.restore();
    if (env.labels) txt(ctx, valLabel(p, o.unit), 0, 30, 18, 'rgba(255,255,255,.82)');
  }
  function fLed(ctx, p, env, o) {              // LED（直插/贴片）
    const t = o.t || 55;
    if (o.smd) {
      const w = 26, h = 26;
      if (env.powered) { const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 40); rg.addColorStop(0, env.current); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill(); }
      ctx.save(); ctx.fillStyle = '#cfd5e0'; roundRect(ctx, -t - 2, -6, 12, 12, 2); ctx.fill(); roundRect(ctx, t - 10, -6, 12, 12, 2); ctx.fill(); ctx.restore();
      disc(ctx, 0, 0, w / 2, '#ff9a9a', (env.powered ? env.current : '#c0392b'), '#7a1f16');
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(-4, -4, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    } else {
      lead(ctx, -t, -16, 0, 2.4); lead(ctx, 16, t, 0, 2.4);
      if (env.powered) { const rg = ctx.createRadialGradient(0, 0, 4, 0, 0, 46); rg.addColorStop(0, env.current); rg.addColorStop(.5, env.current + '88'); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill(); }
      disc(ctx, 0, 0, 20, '#ff9a9a', (env.powered ? env.current : '#c0392b'), '#7a1f16');
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 20, -Math.PI * .85, -Math.PI * .15); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(-6, -7, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (env.labels) txt(ctx, valLabel(p, o.unit), 0, o.smd ? 26 : 40, 20, 'rgba(255,255,255,.82)');
  }
  function fRound(ctx, p, env, o) {            // 圆形（电机/蜂鸣器/表头/光敏等）
    const t = o.t || 52;
    lead(ctx, -t, -o.r || 36, 0, o.lw || 2.6); lead(ctx, o.r || 36, t, 0, o.lw || 2.6);
    disc(ctx, 0, 0, o.r || 36, o.top || '#5a6270', o.mid || '#2c323d', o.bot || '#15181e');
    if (o.face) o.face(ctx, env);
    if (env.labels && valLabel(p, o.unit)) txt(ctx, valLabel(p, o.unit), 0, (o.r || 36) + 22, 20, 'rgba(255,255,255,.82)');
  }
  function fBox(ctx, p, env, o) {              // 通用方块（电源/接线端子等）
    const t = o.t || 52;
    lead(ctx, -t, -o.w / 2, 0, o.lw || 2.6); lead(ctx, o.w / 2, t, 0, o.lw || 2.6);
    const g = ctx.createLinearGradient(0, -o.h / 2, 0, o.h / 2);
    g.addColorStop(0, o.top || '#2b2f38'); g.addColorStop(.5, o.mid || '#1c2330'); g.addColorStop(1, o.bot || '#11161e');
    ctx.save(); ctx.fillStyle = g; roundRect(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 8); ctx.fill(); ctx.restore();
    if (o.mark) o.mark(ctx, env);
    if (env.labels && valLabel(p, o.unit)) txt(ctx, valLabel(p, o.unit), 0, o.h / 2 + 20, 18, 'rgba(255,255,255,.82)');
  }
  function fHeader(ctx, p, env, o) {           // 排针/排母（直插或贴片）
    const n = o.n, gap = 22, x0 = -(n - 1) * gap / 2, t = o.smd ? 14 : 34, bw = o.w || (n * gap + 8), bh = o.smd ? 16 : 22;
    for (let i = 0; i < n; i++) { const x = x0 + i * gap; if (o.smd) leadV(ctx, -bh / 2, t, x, 2.2); else leadV(ctx, bh / 2, t, x, 2.2); }
    ctx.save(); ctx.fillStyle = o.smd ? '#2a2f3a' : '#2c2410'; roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 4); ctx.fill(); ctx.restore();
    for (let i = 0; i < n; i++) { const x = x0 + i * gap; ctx.save(); ctx.fillStyle = '#c9cfdb'; if (o.smd) roundRect(ctx, x - 4, -bh / 2 - 2, 8, 8, 2); else roundRect(ctx, x - 4, bh / 2 - 4, 8, 10, 2); ctx.fill(); ctx.restore(); }
    if (env.labels) txt(ctx, o.label || valLabel(p, o.unit), 0, (o.smd ? t : t) + 18, 16, 'rgba(255,255,255,.8)');
  }

  // IC 引脚布局
  function dipPins(perSide, hw, hh) {
    const pins = [];
    for (let i = 0; i < perSide; i++) { const y = -hh + (i + 0.5) * 2 * hh / perSide; pins.push({ x: -hw, y }); }
    for (let i = 0; i < perSide; i++) { const y = -hh + (i + 0.5) * 2 * hh / perSide; pins.push({ x: hw, y }); }
    return pins;
  }
  function qfpPins(perSide, hw, hh) {
    const pins = [];
    for (let i = 0; i < perSide; i++) { const x = -hw + (i + 0.5) * 2 * hw / perSide; pins.push({ x, y: -hh }); }
    for (let i = 0; i < perSide; i++) { const x = hw - (i + 0.5) * 2 * hw / perSide; pins.push({ x, y: hh }); }
    for (let i = 0; i < perSide; i++) { const y = hh - (i + 0.5) * 2 * hh / perSide; pins.push({ x: -hw, y }); }
    for (let i = 0; i < perSide; i++) { const y = -hh + (i + 0.5) * 2 * hh / perSide; pins.push({ x: hw, y }); }
    return pins;
  }
  function fIC(ctx, p, env, o) {
    const pins = o.pins, W = o.W, H = o.H;
    ctx.save();
    pins.forEach(t => {
      const cx = t.x * 0.42, cy = t.y * 0.42;
      ctx.strokeStyle = '#c9cfdb'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.fillStyle = '#eef1f6'; ctx.beginPath(); ctx.arc(t.x, t.y, 3.4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
    const g = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
    g.addColorStop(0, o.body || '#22262f'); g.addColorStop(.5, o.body2 || '#161a22'); g.addColorStop(1, '#0e1117');
    ctx.save(); ctx.fillStyle = g; roundRect(ctx, -W / 2, -H / 2, W, H, o.pkg === 'qfp' ? 4 : 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.10)'; roundRect(ctx, -W / 2 + 5, -H / 2 + 5, W - 10, 8, 4); ctx.fill(); ctx.restore();
    // 1脚标记
    ctx.save(); ctx.fillStyle = o.notch || '#36e0c8';
    if (o.pkg === 'qfp') { ctx.beginPath(); ctx.arc(-W / 2 + 8, -H / 2 + 8, 4, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(-W / 2 + 10, -H / 2 + 8, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#cfd6e0'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('1', -W / 2 + 10, -H / 2 + 22); }
    ctx.restore();
    if (o.label) txt(ctx, o.label, 0, 0, o.pkg === 'qfp' ? 15 : 16, 'rgba(255,255,255,.85)');
    if (env.labels && valLabel(p)) txt(ctx, valLabel(p), 0, H / 2 + 18, 16, 'rgba(255,255,255,.8)');
  }
  function fAntenna(ctx, p, env) {
    leadV(ctx, 30, 0, 0, 2.4);
    ctx.save(); ctx.strokeStyle = '#cfd6e0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(0, 0); ctx.stroke();
    ctx.strokeStyle = '#9aa7bd'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -6, 10, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -18, 20, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.fillStyle = env.powered ? env.current : '#ff5d6c'; ctx.beginPath(); ctx.arc(0, -38, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (env.labels) txt(ctx, '天线', 0, 46, 18, 'rgba(255,255,255,.82)');
  }
  function fGround(ctx) {
    leadV(ctx, -28, 0, 0, 2.4);
    ctx.save(); ctx.strokeStyle = '#9aa7bd'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, 6); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.fillStyle = '#6b7282'; ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(14, 6); ctx.lineTo(9, 20); ctx.lineTo(-9, 20); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.save(); ctx.strokeStyle = '#8a93a6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-22, 22); ctx.lineTo(22, 22); ctx.moveTo(-14, 30); ctx.lineTo(14, 30); ctx.stroke(); ctx.restore();
  }

  // ---------- 元件定义 ----------
  const C = {};
  // 电源
  C.battery = { name: '电池·直插', cat: 'power', pkg: 'th', isSource: true, posTerm: 1, defaults: { voltage: 12, label: '' }, terminals: pinH(55),
    draw(c, p, e) { lead(c, -55, -40, 0, 3); lead(c, 40, 55, 0, 3); cyl(c, -40, 40, 23, '#5e7d96', '#2f4257', '#1a2738', true);
      c.save(); c.fillStyle = '#d7dbe4'; roundRect(c, 40, -7, 10, 14, 3); c.fill(); c.restore();
      c.save(); c.fillStyle = '#e0a93b'; roundRect(c, -26, -23, 16, 46, 4); c.fill(); c.restore();
      txt(c, '+', 47, -34, 24, '#ffd36a'); if (e.labels) txt(c, valLabel(p, 'V'), 0, 46, 22, 'rgba(255,255,255,.82)'); } };
  C.battery_cell = { name: '电池盒·直插', cat: 'power', pkg: 'th', isSource: true, posTerm: 1, defaults: { voltage: 9, label: '' }, terminals: pinH(45),
    draw(c, p, e) { lead(c, -45, -34, 0, 2.6); lead(c, 34, 45, 0, 2.6); c.save(); c.fillStyle = '#1b1f27'; roundRect(c, -34, -26, 68, 52, 6); c.fill();
      c.fillStyle = '#3a3f4a'; roundRect(c, -28, -20, 26, 40, 4); c.fill(); roundRect(c, 4, -20, 26, 40, 4); c.fill();
      c.fillStyle = '#ffd36a'; roundRect(c, -34, -6, 8, 12, 2); c.fill(); roundRect(c, 26, -6, 8, 12, 2); c.fill(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'V'), 0, 42, 20, 'rgba(255,255,255,.82)'); } };
  C.coin_cell = { name: '纽扣电池·贴片', cat: 'power', pkg: 'smd', isSource: true, posTerm: 0, defaults: { voltage: 3, label: '' }, terminals: pinV(26),
    draw(c, p, e) { leadV(c, 14, -26, -14, 2.2); leadV(c, 14, 26, 14, 2.2);
      c.save(); const g = c.createLinearGradient(-26, -26, 26, 26); g.addColorStop(0, '#e9edf3'); g.addColorStop(.5, '#aeb6c4'); g.addColorStop(1, '#7c8499'); c.fillStyle = g; c.beginPath(); c.ellipse(0, 0, 26, 26, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#cfd6e0'; c.beginPath(); c.ellipse(0, 0, 12, 12, 0, 0, Math.PI * 2); c.fill(); c.restore();
      txt(c, '+', 0, -34, 18, '#ffd36a'); if (e.labels) txt(c, valLabel(p, 'V'), 0, 40, 16, 'rgba(255,255,255,.82)'); } };
  C.dc_source = { name: '直流电源', cat: 'power', pkg: 'other', isSource: true, posTerm: 1, defaults: { voltage: 5, label: '' }, terminals: pinH(52),
    draw(c, p, e) { fBox(c, p, e, { w: 84, h: 56, top: '#243a2e', mid: '#16241c', bot: '#0e1712', mark(m) { m.save(); m.fillStyle = '#ff5d6c'; m.font = 'bold 22px sans-serif'; m.textAlign = 'center'; m.textBaseline = 'middle'; m.fillText('⎓', 0, -2); m.fillStyle = '#9aa7bd'; m.font = '13px sans-serif'; m.fillText('DC', 0, 18); m.restore(); }, unit: 'V' }); } };
  C.ac_source = { name: '交流电源', cat: 'power', pkg: 'other', isSource: true, posTerm: 1, defaults: { value: 50, label: '' }, terminals: pinH(55),
    draw(c, p, e) { lead(c, -55, -36, 0, 2.6); lead(c, 36, 55, 0, 2.6); c.save(); c.fillStyle = '#2b2f38'; roundRect(c, -36, -28, 72, 56, 10); c.fill();
      c.fillStyle = 'rgba(255,255,255,.06)'; roundRect(c, -30, -22, 60, 12, 5); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#36e0c8'; c.lineWidth = 3; c.beginPath(); for (let i = 0; i <= 40; i++) { const a = -Math.PI + i / 40 * Math.PI * 2; const x = 16 * Math.cos(a), y = 11 * Math.sin(a * 2); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'Hz'), 0, 44, 18, 'rgba(255,255,255,.82)'); } };

  // 电阻
  C.resistor_carbon = { name: '碳膜电阻·直插', cat: 'resistor', pkg: 'th', defaults: { value: 220, label: '' }, terminals: pinH(55),
    draw(c, p, e) { fAxial(c, p, e, { t: 55, bw: 40, r: 13, top: '#e9d8a8', mid: '#cdb47b', bot: '#9c8552', bands: ['#7a3b12', '#e23b2e', '#222', '#d4a017', '#6b6b6b'], unit: 'Ω' }); } };
  C.resistor_metal = { name: '金属膜电阻·直插', cat: 'resistor', pkg: 'th', defaults: { value: 10, label: '' }, terminals: pinH(55),
    draw(c, p, e) { fAxial(c, p, e, { t: 55, bw: 40, r: 12, top: '#dfe6f2', mid: '#aab4c6', bot: '#7e8aa0', bands: ['#b23b2e', '#222', '#3a6ea5', '#d4a017'], unit: 'Ω' }); } };
  C.resistor_ww = { name: '绕线电阻·直插', cat: 'resistor', pkg: 'th', defaults: { value: 4, label: '' }, terminals: pinH(52),
    draw(c, p, e) { fAxial(c, p, e, { t: 52, bw: 42, r: 16, top: '#d7c9a8', mid: '#b09a6e', bot: '#7c6a45', unit: 'Ω' }); } };
  C.resistor_smd = { name: '贴片电阻 0805', cat: 'resistor', pkg: 'smd', defaults: { value: 10, label: '' }, terminals: pinH(28),
    draw(c, p, e) { fSmd(c, p, e, { t: 28, w: 52, h: 28, top: '#cfd5e0', mid: '#9aa2b2', bot: '#6b7282', unit: 'Ω' }); } };
  C.pot = { name: '电位器·直插', cat: 'resistor', pkg: 'th', defaults: { value: 10, label: '' }, terminals: [{ x: -52, y: 0 }, { x: 52, y: 0 }, { x: 0, y: -34 }],
    draw(c, p, e) { lead(c, -52, -26, 0, 2.4); lead(c, 26, 52, 0, 2.4); leadV(c, 0, -34, 0, 2.4);
      c.save(); c.fillStyle = '#27406b'; roundRect(c, -26, -22, 52, 32, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.1)'; roundRect(c, -22, -18, 44, 8, 4); c.fill(); c.restore();
      c.save(); c.fillStyle = '#e7ecf5'; c.beginPath(); c.arc(0, -2, 11, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#27406b'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -2); c.lineTo(8, -9); c.stroke(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'K'), 0, 30, 18, 'rgba(255,255,255,.82)'); } };
  C.pot_smd = { name: '电位器·贴片', cat: 'resistor', pkg: 'smd', defaults: { value: 10, label: '' }, terminals: [{ x: -40, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 26 }],
    draw(c, p, e) { lead(c, -40, -22, 0, 2); lead(c, 22, 40, 0, 2); leadV(c, 12, 26, 0, 2);
      c.save(); c.fillStyle = '#2b3a55'; roundRect(c, -22, -20, 44, 30, 5); c.fill(); c.fillStyle = '#e7ecf5'; c.beginPath(); c.arc(0, -2, 9, 0, Math.PI * 2); c.fill(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'K'), 0, 38, 16, 'rgba(255,255,255,.82)'); } };
  C.rheostat = { name: '可调电阻', cat: 'resistor', pkg: 'th', defaults: { value: 100, label: '' }, terminals: [{ x: -52, y: 0 }, { x: 52, y: 0 }, { x: 0, y: -34 }],
    draw(c, p, e) { lead(c, -52, -26, 0, 2.4); lead(c, 26, 52, 0, 2.4); leadV(c, 0, -34, 0, 2.4);
      c.save(); c.fillStyle = '#3a3326'; roundRect(c, -26, -22, 52, 32, 7); c.fill(); c.strokeStyle = '#caa24a'; c.lineWidth = 2; c.beginPath(); c.arc(0, -2, 14, Math.PI, 0); c.stroke(); c.restore();
      c.save(); c.fillStyle = '#e7ecf5'; c.beginPath(); c.arc(0, -2, 5, 0, Math.PI * 2); c.fill(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'Ω'), 0, 30, 18, 'rgba(255,255,255,.82)'); } };
  C.ldr = { name: '光敏电阻', cat: 'resistor', pkg: 'th', defaults: { value: 10, label: '' }, terminals: pinH(55),
    draw(c, p, e) { lead(c, -55, -34, 0, 2.6); lead(c, 34, 55, 0, 2.6); c.save(); c.fillStyle = 'rgba(80,110,150,.35)'; roundRect(c, -34, -16, 68, 32, 8); c.fill(); c.strokeStyle = '#9fe0ff'; c.lineWidth = 1.6; roundRect(c, -34, -16, 68, 32, 8); c.stroke(); c.restore();
      c.save(); c.fillStyle = '#2a3a4a'; for (let i = 0; i < 5; i++) { const lx = -26 + i * 13; c.beginPath(); c.ellipse(lx, 0, 4, 12, 0, 0, Math.PI * 2); c.fill(); } c.restore();
      c.save(); c.strokeStyle = 'rgba(255,236,150,.8)'; c.lineWidth = 1.6; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 16 - 14, -26); c.lineTo(i * 16 + 6, -2); c.stroke(); } c.restore();
      if (e.labels) txt(c, 'LDR', 0, 34, 20, 'rgba(255,255,255,.82)'); } };
  C.thermistor = { name: '热敏电阻 NTC', cat: 'resistor', pkg: 'th', defaults: { value: 10, label: '' }, terminals: pinH(50),
    draw(c, p, e) { fAxial(c, p, e, { t: 50, bw: 34, r: 16, top: '#6b4f3a', mid: '#4a3326', bot: '#2e1f17', ring: '#caa24a', unit: 'kΩ' }); } };
  C.varistor = { name: '压敏电阻', cat: 'resistor', pkg: 'th', defaults: { value: 470, label: '' }, terminals: pinH(46),
    draw(c, p, e) { lead(c, -46, -24, 0, 2.6); lead(c, 24, 46, 0, 2.6); c.save(); c.fillStyle = '#2b3550'; roundRect(c, -24, -22, 48, 44, 8); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#4aa3ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-12, -14); c.lineTo(12, 14); c.moveTo(-12, 14); c.lineTo(12, -14); c.stroke(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'V'), 0, 36, 18, 'rgba(255,255,255,.82)'); } };

  // 电容
  C.cap_elec = { name: '电解电容·直插', cat: 'capacitor', pkg: 'th', open: true, defaults: { value: 10, label: '' }, terminals: pinH(55),
    draw(c, p, e) { lead(c, -55, -34, 0, 2.6); lead(c, 34, 55, 0, 2.6); cyl(c, -34, 34, 22, '#3a4f63', '#1f2c3a', '#111923', true);
      c.save(); c.fillStyle = '#9aa7bd'; roundRect(c, 14, -22, 8, 44, 3); c.fill(); c.restore();
      txt(c, '+', -22, -34, 22, '#ffd36a'); if (e.labels) txt(c, valLabel(p, 'µF'), 0, 42, 22, 'rgba(255,255,255,.82)'); } };
  C.cap_cer = { name: '瓷片电容·直插', cat: 'capacitor', pkg: 'th', open: true, defaults: { value: 0.1, label: '' }, terminals: [{ x: -18, y: 40 }, { x: 18, y: 40 }],
    draw(c, p, e) { leadV(c, 0, 40, -18, 2.4); leadV(c, 0, 40, 18, 2.4);       c.save(); c.fillStyle = '#efe9dc'; c.beginPath(); c.ellipse(0, 0, 22, 22, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, 0, 22, 22, 0, 0, Math.PI * 2); c.stroke(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'µF'), 0, 54, 18, 'rgba(255,255,255,.82)'); } };
  C.cap_film = { name: '薄膜电容·直插', cat: 'capacitor', pkg: 'th', open: true, defaults: { value: 1, label: '' }, terminals: pinH(48),
    draw(c, p, e) { lead(c, -48, -28, 0, 2.6); lead(c, 28, 48, 0, 2.6); c.save(); c.fillStyle = '#c9b48a'; roundRect(c, -28, -22, 56, 44, 6); c.fill(); c.fillStyle = 'rgba(0,0,0,.1)'; roundRect(c, -28, -22, 56, 44, 6); c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = 1.5; c.stroke(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'µF'), 0, 38, 18, 'rgba(255,255,255,.82)'); } };
  C.cap_smd = { name: '贴片电容 MLCC', cat: 'capacitor', pkg: 'smd', open: true, defaults: { value: 0.1, label: '' }, terminals: pinH(28),
    draw(c, p, e) { fSmd(c, p, e, { t: 28, w: 50, h: 28, top: '#f0ece2', mid: '#cfc6b6', bot: '#a89e8a', mark: 'cap', unit: 'µF' }); } };
  C.cap_tant = { name: '钽电容·贴片', cat: 'capacitor', pkg: 'smd', open: true, defaults: { value: 10, label: '' }, terminals: pinH(24),
    draw(c, p, e) { fSmd(c, p, e, { t: 24, w: 56, h: 30, top: '#3b2a4a', mid: '#2a1d36', bot: '#1a1222', mark: 'tant', unit: 'µF' }); } };
  C.cap_trim = { name: '可调电容', cat: 'capacitor', pkg: 'th', open: true, defaults: { value: 20, label: '' }, terminals: [{ x: -22, y: 26 }, { x: 22, y: 26 }],
    draw(c, p, e) { leadV(c, 0, 26, -22, 2.2); leadV(c, 0, 26, 22, 2.2); c.save(); c.fillStyle = '#3a3f4a'; roundRect(c, -22, -20, 44, 36, 6); c.fill(); c.fillStyle = '#cfd6e0'; c.beginPath(); c.arc(0, -2, 8, 0, Math.PI * 2); c.fill(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'pF'), 0, 40, 16, 'rgba(255,255,255,.82)'); } };

  // 电感
  C.inductor = { name: '色环电感·直插', cat: 'inductor', pkg: 'th', defaults: { value: 4, label: '' }, terminals: pinH(55),
    draw(c, p, e) { lead(c, -55, -42, 0, 2.6); lead(c, 42, 55, 0, 2.6); drawCoil(c, -38, 38, 15, 7);
      if (e.labels) txt(c, valLabel(p, 'mH'), 0, 36, 22, 'rgba(255,255,255,.82)'); } };
  C.inductor_choke = { name: '工字电感·直插', cat: 'inductor', pkg: 'th', defaults: { value: 10, label: '' }, terminals: pinH(48),
    draw(c, p, e) { lead(c, -48, -26, 0, 2.6); lead(c, 26, 48, 0, 2.6); c.save(); c.fillStyle = '#2a2f38'; roundRect(c, -26, -20, 52, 40, 4); c.fill(); c.restore(); drawCoil(c, -22, 22, 12, 5);
      if (e.labels) txt(c, valLabel(p, 'µH'), 0, 34, 18, 'rgba(255,255,255,.82)'); } };
  C.inductor_smd = { name: '贴片电感', cat: 'inductor', pkg: 'smd', defaults: { value: 4, label: '' }, terminals: pinH(28),
    draw(c, p, e) { lead(c, -28, -16, 0, 2); lead(c, 16, 28, 0, 2);       c.save(); c.fillStyle = '#1c2330'; roundRect(c, -16, -16, 32, 32, 5); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#caa24a'; c.lineWidth = 2; for (let i = -1; i <= 1; i++) { c.beginPath(); c.ellipse(i * 7, 0, 3, 11, 0, 0, Math.PI * 2); c.stroke(); } c.restore();
      if (e.labels) txt(c, valLabel(p, 'µH'), 0, 30, 16, 'rgba(255,255,255,.82)'); } };
  C.bead = { name: '磁珠 Ferrite', cat: 'inductor', pkg: 'th', defaults: { value: 0, label: '' }, terminals: pinH(40),
    draw(c, p, e) { lead(c, -40, -16, 0, 2.6); lead(c, 16, 40, 0, 2.6); c.save(); c.fillStyle = '#23262e'; c.beginPath(); c.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.ellipse(0, 0, 16, 16, 0, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1.5; c.stroke(); c.restore(); } };
  C.transformer = { name: '变压器', cat: 'inductor', pkg: 'th', defaults: { label: '' }, edges: [[0, 1], [2, 3]], terminals: [{ x: -60, y: -28 }, { x: -60, y: 28 }, { x: 60, y: -28 }, { x: 60, y: 28 }],
    draw(c, p, e) { lead(c, -60, -38, -28, 2.4); lead(c, -60, -38, 28, 2.4); lead(c, 38, 60, -28, 2.4); lead(c, 38, 60, 28, 2.4);
      c.save(); c.fillStyle = '#4a4f59'; roundRect(c, -6, -42, 12, 84, 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.12)'; roundRect(c, -4, -40, 3, 80, 1); c.fill(); c.restore();
      c.save(); c.lineCap = 'round'; for (let i = 0; i < 5; i++) { const cx = -34 + i * 5; c.strokeStyle = copperGrad(c, cx, -28); c.lineWidth = 5; c.beginPath(); c.ellipse(cx, -28, 3, 13, 0, 0, Math.PI * 2); c.stroke(); }
      for (let i = 0; i < 5; i++) { const cx = 16 + i * 5; c.strokeStyle = copperGrad(c, cx, 28); c.lineWidth = 5; c.beginPath(); c.ellipse(cx, 28, 3, 13, 0, 0, Math.PI * 2); c.stroke(); } c.restore();
      if (e.labels) txt(c, '变压器', 0, 60, 18, 'rgba(255,255,255,.82)'); } };

  // 二极管
  C.diode = { name: '整流二极管·直插', cat: 'diode', pkg: 'th', defaults: { label: '' }, terminals: pinH(55),
    draw(c, p, e) { fDiode(c, p, e, { t: 55 }); } };
  C.diode_schottky = { name: '肖特基二极管', cat: 'diode', pkg: 'th', defaults: { label: '' }, terminals: pinH(52),
    draw(c, p, e) { fDiode(c, p, e, { t: 52, schottky: true }); } };
  C.zener = { name: '稳压二极管', cat: 'diode', pkg: 'th', defaults: { label: '' }, terminals: pinH(55),
    draw(c, p, e) { fDiode(c, p, e, { t: 55, zener: true, catLine: '#9fe0ff' }); } };
  C.led = { name: 'LED·直插', cat: 'diode', pkg: 'th', defaults: { label: '' }, terminals: pinH(55),
    draw(c, p, e) { fLed(c, p, e, { t: 55, smd: false }); } };
  C.led_smd = { name: '贴片LED 0603', cat: 'diode', pkg: 'smd', defaults: { label: '' }, terminals: pinH(16),
    draw(c, p, e) { fLed(c, p, e, { t: 16, smd: true }); } };
  C.led_rgb = { name: 'RGB LED·直插', cat: 'diode', pkg: 'th', defaults: { label: '' }, terminals: [{ x: -20, y: -34 }, { x: 20, y: -34 }, { x: -20, y: 34 }, { x: 20, y: 34 }],
    draw(c, p, e) { lead(c, -20, -20, -34, 2.4); lead(c, 20, 20, -34, 2.4); lead(c, -20, -20, 34, 2.4); lead(c, 20, 20, 34, 2.4);
      if (e.powered) { const rg = c.createRadialGradient(0, 0, 4, 0, 0, 46); rg.addColorStop(0, e.current); rg.addColorStop(.5, e.current + '88'); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = rg; c.beginPath(); c.arc(0, 0, 46, 0, Math.PI * 2); c.fill(); }
      c.save(); c.fillStyle = '#1a1c20'; c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill(); c.restore();
      const cols = ['#ff5d6c', '#22c55e', '#4aa3ff']; const pos = [[-10, -8], [10, -8], [0, 12]];
      pos.forEach((q, i) => { c.save(); c.fillStyle = cols[i]; c.beginPath(); c.arc(q[0], q[1], 6, 0, Math.PI * 2); c.fill(); c.restore(); });
      if (e.labels) txt(c, 'RGB', 0, 48, 16, 'rgba(255,255,255,.82)'); } };
  C.photodiode = { name: '光电二极管', cat: 'diode', pkg: 'th', defaults: { label: '' }, terminals: pinH(50),
    draw(c, p, e) { lead(c, -50, -14, 0, 2.4); lead(c, 14, 50, 0, 2.4); c.save(); c.fillStyle = '#1c2a1c'; c.beginPath(); c.arc(0, 0, 16, 0, Math.PI * 2); c.fill(); c.fillStyle = '#39d98a'; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#9fe0ff'; c.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 8 - 6, -14); c.lineTo(i * 8 + 4, -2); c.stroke(); } c.restore(); } };

  // 晶体管
  C.transistor_npn = { name: '三极管 NPN·TO-92', cat: 'transistor', pkg: 'th', defaults: { label: '' }, edges: [[0, 2]], terminals: [{ x: 52, y: -22 }, { x: -50, y: 0 }, { x: 52, y: 22 }],
    draw(c, p, e) { lead(c, -50, -22, 0, 2.4); lead(c, 22, 52, -22, 2.4); lead(c, 22, 52, 22, 2.4);
      c.save(); c.fillStyle = '#26282e'; roundRect(c, -22, -22, 30, 44, 10); c.fill(); c.fillStyle = 'rgba(255,255,255,.12)'; roundRect(c, -18, -18, 8, 36, 6); c.fill(); c.fillStyle = '#1a1c20'; c.beginPath(); c.arc(8, 0, 11, 0, Math.PI * 2); c.fill(); c.restore();
      txt(c, 'NPN', -7, 0, 12, '#cfd6e0'); if (e.labels) txt(c, '三极管', 0, 44, 16, 'rgba(255,255,255,.82)'); } };
  C.transistor_pnp = { name: '三极管 PNP·TO-92', cat: 'transistor', pkg: 'th', defaults: { label: '' }, edges: [[0, 2]], terminals: [{ x: 52, y: -22 }, { x: -50, y: 0 }, { x: 52, y: 22 }],
    draw(c, p, e) { lead(c, -50, -22, 0, 2.4); lead(c, 22, 52, -22, 2.4); lead(c, 22, 52, 22, 2.4);
      c.save(); c.fillStyle = '#26282e'; roundRect(c, -22, -22, 30, 44, 10); c.fill(); c.fillStyle = 'rgba(255,255,255,.12)'; roundRect(c, -18, -18, 8, 36, 6); c.fill(); c.fillStyle = '#1a1c20'; c.beginPath(); c.arc(8, 0, 11, 0, Math.PI * 2); c.fill(); c.restore();
      txt(c, 'PNP', -7, 0, 12, '#cfd6e0'); if (e.labels) txt(c, '三极管', 0, 44, 16, 'rgba(255,255,255,.82)'); } };
  C.mosfet = { name: 'MOSFET·TO-220', cat: 'transistor', pkg: 'th', defaults: { label: '' }, edges: [[0, 2]], terminals: [{ x: -54, y: 0 }, { x: 54, y: -20 }, { x: 54, y: 20 }],
    draw(c, p, e) { lead(c, -54, -20, 0, 2.6); lead(c, 20, 54, -20, 2.6); lead(c, 20, 54, 20, 2.6);
      c.save(); c.fillStyle = '#1b1f27'; roundRect(c, -20, -34, 44, 68, 6); c.fill(); c.fillStyle = '#9aa2b2'; c.beginPath(); c.arc(0, -14, 5, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.fillStyle = '#c9cfdb'; roundRect(c, 20, -34, 34, 68, 4); c.fill(); c.fillStyle = '#1b1f27'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(37, i * 18, 4, 0, Math.PI * 2); c.fill(); } c.restore();
      if (e.labels) txt(c, 'MOSFET', 0, 48, 14, 'rgba(255,255,255,.82)'); } };
  C.mosfet_smd = { name: 'MOSFET·SOT-23', cat: 'transistor', pkg: 'smd', defaults: { label: '' }, edges: [[0, 2]], terminals: [{ x: -22, y: -10 }, { x: 22, y: 0 }, { x: -22, y: 10 }],
    draw(c, p, e) { lead(c, -22, -10, -10, 1.8); lead(c, 10, 22, 0, 1.8); lead(c, -22, -10, 10, 1.8);
      c.save(); c.fillStyle = '#1b1f27'; roundRect(c, -16, -14, 28, 28, 4); c.fill(); c.restore();
      c.save(); c.fillStyle = '#c9cfdb'; c.beginPath(); c.moveTo(12, -12); c.lineTo(22, -12); c.lineTo(22, 12); c.lineTo(12, 12); c.closePath(); c.fill(); c.restore();
      if (e.labels) txt(c, 'MOS', 0, 30, 13, 'rgba(255,255,255,.82)'); } };
  C.scr = { name: '可控硅 SCR', cat: 'transistor', pkg: 'th', defaults: { label: '' }, edges: [[0, 1]], terminals: [{ x: -52, y: 0 }, { x: 52, y: 0 }, { x: -28, y: 40 }],
    draw(c, p, e) { lead(c, -52, -16, 0, 2.4); lead(c, 16, 52, 0, 2.4); leadV(c, -28, 40, -28, 2.4); cyl(c, -16, 16, 11, '#3a3f4a', '#23262e', '#15171c', true);
      c.save(); c.fillStyle = '#cfd6e0'; roundRect(c, -4, -11, 7, 22, 2); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#ffd36a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke(); c.restore();
      c.save(); c.fillStyle = '#8fd3ff'; c.beginPath(); c.arc(-28, 40, 4, 0, Math.PI * 2); c.fill(); c.restore();
      if (e.labels) txt(c, 'SCR', 0, 44, 16, 'rgba(255,255,255,.82)'); } };
  C.triac = { name: '双向可控硅', cat: 'transistor', pkg: 'th', defaults: { label: '' }, edges: [[0, 1]], terminals: [{ x: -52, y: 0 }, { x: 52, y: 0 }, { x: -28, y: 40 }],
    draw(c, p, e) { lead(c, -52, -16, 0, 2.4); lead(c, 16, 52, 0, 2.4); leadV(c, -28, 40, -28, 2.4); cyl(c, -16, 16, 11, '#3a3f4a', '#23262e', '#15171c', true);
      c.save(); c.strokeStyle = '#9fe0ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.moveTo(-5, -7); c.lineTo(9, -7); c.moveTo(-5, 7); c.lineTo(9, 7); c.stroke(); c.restore();
      c.save(); c.fillStyle = '#8fd3ff'; c.beginPath(); c.arc(-28, 40, 4, 0, Math.PI * 2); c.fill(); c.restore();
      if (e.labels) txt(c, 'TRIAC', 0, 44, 14, 'rgba(255,255,255,.82)'); } };

  // 开关 / 继电器
  C.switch_toggle = { name: '拨动开关·直插', cat: 'switch', pkg: 'th', defaults: { closed: true, label: '' }, terminals: pinH(52),
    draw(c, p, e) { lead(c, -52, -24, 0, 2.6); lead(c, 24, 52, 0, 2.6); c.save(); c.fillStyle = '#d7dbe4'; c.beginPath(); c.arc(-24, 0, 6, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(24, 0, 6, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#8a93a6'; c.lineWidth = 6; c.lineCap = 'round'; if (p.closed) { c.beginPath(); c.moveTo(-24, 0); c.lineTo(24, 0); c.stroke(); } else { c.beginPath(); c.moveTo(-24, 0); c.lineTo(20, -22); c.stroke(); } c.fillStyle = '#ffd36a'; c.beginPath(); c.arc(p.closed ? 24 : 20, p.closed ? 0 : -22, 5, 0, Math.PI * 2); c.fill(); c.restore();
      if (e.labels) txt(c, p.closed ? '闭合' : '断开', 0, 30, 18, 'rgba(255,255,255,.82)'); } };
  C.button = { name: '按钮开关', cat: 'switch', pkg: 'th', defaults: { closed: false, label: '' }, terminals: pinH(52),
    draw(c, p, e) { lead(c, -52, -20, 0, 2.6); lead(c, 20, 52, 0, 2.6); c.save(); c.fillStyle = '#d7dbe4'; c.beginPath(); c.arc(-20, 0, 5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(20, 0, 5, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.fillStyle = '#3a3f4a'; roundRect(c, -12, -14, 24, 28, 6); c.fill(); c.restore();
      c.save(); c.fillStyle = p.closed ? '#22c55e' : '#e23b2e'; c.beginPath(); c.ellipse(0, p.closed ? 4 : -6, 9, 6, 0, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#8a93a6'; c.lineWidth = 5; c.lineCap = 'round'; if (p.closed) { c.beginPath(); c.moveTo(-20, 0); c.lineTo(20, 0); c.stroke(); } else { c.beginPath(); c.moveTo(-20, 0); c.lineTo(14, -14); c.stroke(); } c.restore();
      if (e.labels) txt(c, p.closed ? '按下' : '弹起', 0, 30, 18, 'rgba(255,255,255,.82)'); } };
  C.switch2 = { name: '双掷开关', cat: 'switch', pkg: 'th', defaults: { position: 'a', label: '' }, edges: [[0, 1], [0, 2]], terminals: [{ x: -50, y: 0 }, { x: 50, y: -30 }, { x: 50, y: 30 }],
    draw(c, p, e) { lead(c, -50, -22, 0, 2.6); lead(c, 50, 22, -30, 2.6); lead(c, 50, 22, 30, 2.6); c.save(); c.fillStyle = '#d7dbe4'; c.beginPath(); c.arc(-22, 0, 5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(50, -30, 5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(50, 30, 5, 0, Math.PI * 2); c.fill(); c.restore();
      const ty = p.position === 'b' ? 30 : -30; c.save(); c.strokeStyle = '#8a93a6'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-22, 0); c.lineTo(50, ty); c.stroke(); c.fillStyle = '#ffd36a'; c.beginPath(); c.arc(50, ty, 5, 0, Math.PI * 2); c.fill(); c.restore(); } };
  C.tact = { name: '轻触开关·贴片', cat: 'switch', pkg: 'smd', defaults: { closed: false, label: '' }, terminals: pinH(34),
    draw(c, p, e) { lead(c, -34, -18, 0, 1.8); lead(c, 18, 34, 0, 1.8); c.save(); c.fillStyle = '#2b2f38'; roundRect(c, -18, -16, 36, 32, 5); c.fill(); c.restore();
      c.save(); c.fillStyle = p.closed ? '#22c55e' : '#cfd6e0'; roundRect(c, -10, -10, 20, 20, 4); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#8a93a6'; c.lineWidth = 4; c.lineCap = 'round'; if (p.closed) { c.beginPath(); c.moveTo(-18, 0); c.lineTo(18, 0); c.stroke(); } else { c.beginPath(); c.moveTo(-18, 0); c.lineTo(12, -12); c.stroke(); } c.restore(); } };
  C.relay = { name: '继电器·直插', cat: 'switch', pkg: 'th', defaults: { closed: false, label: '' }, edges: [[0, 1], [2, 3]], terminals: [{ x: -55, y: -28 }, { x: -55, y: 28 }, { x: 55, y: -28 }, { x: 55, y: 28 }],
    draw(c, p, e) { lead(c, -55, -34, -28, 2.4); lead(c, -55, -34, 28, 2.4); lead(c, 34, 55, -28, 2.4); lead(c, 34, 55, 28, 2.4);
      c.save(); c.fillStyle = '#2b2f38'; roundRect(c, -34, -42, 68, 84, 8); c.fill(); c.fillStyle = 'rgba(255,255,255,.08)'; roundRect(c, -28, -36, 26, 72, 5); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#caa24a'; c.lineWidth = 2.4; for (let i = 0; i < 4; i++) { const cy = -34 + i * 8; c.beginPath(); c.ellipse(-21, cy, 6, 4, 0, 0, Math.PI * 2); c.stroke(); } c.restore();
      c.save(); c.strokeStyle = p.closed ? '#22c55e' : '#8a93a6'; c.lineWidth = 4; c.lineCap = 'round'; if (p.closed) { c.beginPath(); c.moveTo(22, -28); c.lineTo(22, 28); c.stroke(); } else { c.beginPath(); c.moveTo(22, -28); c.lineTo(34, 18); c.stroke(); } c.fillStyle = p.closed ? '#22c55e' : '#8a93a6'; c.beginPath(); c.arc(22, -28, 4, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(22, 28, 4, 0, Math.PI * 2); c.fill(); c.restore();
      if (e.labels) txt(c, p.closed ? '吸合' : '释放', 0, 56, 18, 'rgba(255,255,255,.82)'); } };
  C.relay_smd = { name: '贴片继电器', cat: 'switch', pkg: 'smd', defaults: { closed: false, label: '' }, edges: [[0, 1], [2, 3]], terminals: [{ x: -40, y: -20 }, { x: -40, y: 20 }, { x: 40, y: -20 }, { x: 40, y: 20 }],
    draw(c, p, e) { lead(c, -40, -26, -20, 1.8); lead(c, -40, -26, 20, 1.8); lead(c, 26, 40, -20, 1.8); lead(c, 26, 40, 20, 1.8);
      c.save(); c.fillStyle = '#2b2f38'; roundRect(c, -26, -30, 52, 60, 6); c.fill(); c.restore();
      c.save(); c.strokeStyle = p.closed ? '#22c55e' : '#8a93a6'; c.lineWidth = 3; c.lineCap = 'round'; if (p.closed) { c.beginPath(); c.moveTo(16, -20); c.lineTo(16, 20); c.stroke(); } else { c.beginPath(); c.moveTo(16, -20); c.lineTo(26, 12); c.stroke(); } c.fillStyle = p.closed ? '#22c55e' : '#8a93a6'; c.beginPath(); c.arc(16, -20, 3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(16, 20, 3, 0, Math.PI * 2); c.fill(); c.restore(); } };

  // 集成电路 / 芯片
  function icDef(type, name, cat, pins, W, H, pkg, label, extra) {
    return Object.assign({ name, cat: 'ic', pkg: 'ic', open: true, defaults: { label: '' }, terminals: pins,
      draw(c, p, e) { fIC(c, p, e, { pins, W, H, pkg, label, body: extra && extra.body, body2: extra && extra.body2, notch: extra && extra.notch }); } }, {});
  }
  C.ic_dip8 = icDef('ic_dip8', '运放 DIP-8', 'ic', dipPins(4, 38, 52), 76, 104, 'dip', 'OP', { body: '#22262f' });
  C.ic_555 = icDef('ic_555', '555定时器 DIP-8', 'ic', dipPins(4, 38, 52), 76, 104, 'dip', '555', { body: '#2a2620' });
  C.ic_comparator = icDef('ic_comparator', '比较器 DIP-8', 'ic', dipPins(4, 38, 52), 76, 104, 'dip', 'CMP', { body: '#202a2f' });
  C.ic_dip14 = icDef('ic_dip14', '逻辑芯片 DIP-14', 'ic', dipPins(7, 44, 64), 88, 128, 'dip', '74xx', { body: '#22262f' });
  C.ic_dip16 = icDef('ic_dip16', 'MCU DIP-16', 'ic', dipPins(8, 46, 66), 92, 132, 'dip', 'MCU', { body: '#202833' });
  C.ic_soic8 = icDef('ic_soic8', '贴片运放 SOIC-8', 'ic', dipPins(4, 30, 42), 60, 84, 'smd', 'SOIC', { body: '#22262f' });
  C.ic_sop16 = icDef('ic_sop16', '贴片芯片 SOP-16', 'ic', dipPins(8, 38, 56), 76, 112, 'smd', 'SOP', { body: '#202833' });
  C.ic_qfp = icDef('ic_qfp', '微控制器 QFP-32', 'ic', qfpPins(8, 46, 46), 92, 92, 'qfp', 'QFP', { body: '#1b2230' });
  C.ic_lm317 = { name: '稳压器 TO-220', cat: 'ic', pkg: 'th', open: true, defaults: { label: '' }, edges: [[0, 2]], terminals: [{ x: -54, y: 0 }, { x: 54, y: -20 }, { x: 54, y: 20 }],
    draw(c, p, e) { lead(c, -54, -20, 0, 2.6); lead(c, 20, 54, -20, 2.6); lead(c, 20, 54, 20, 2.6); c.save(); c.fillStyle = '#1b1f27'; roundRect(c, -20, -34, 44, 68, 6); c.fill(); c.fillStyle = '#9aa2b2'; c.beginPath(); c.arc(0, -14, 5, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.fillStyle = '#c9cfdb'; roundRect(c, 20, -34, 34, 68, 4); c.fill(); c.fillStyle = '#1b1f27'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(37, i * 18, 4, 0, Math.PI * 2); c.fill(); } c.restore();
      if (e.labels) txt(c, 'LDO', 0, 48, 14, 'rgba(255,255,255,.82)'); } };
  C.ic_ldo = { name: '稳压器 贴片 SOT-23', cat: 'ic', pkg: 'smd', open: true, defaults: { label: '' }, edges: [[0, 2]], terminals: [{ x: -22, y: -10 }, { x: 22, y: 0 }, { x: -22, y: 10 }],
    draw(c, p, e) { lead(c, -22, -10, -10, 1.8); lead(c, 10, 22, 0, 1.8); lead(c, -22, -10, 10, 1.8); c.save(); c.fillStyle = '#1b1f27'; roundRect(c, -16, -14, 28, 28, 4); c.fill(); c.restore();
      c.save(); c.fillStyle = '#c9cfdb'; c.beginPath(); c.moveTo(12, -12); c.lineTo(22, -12); c.lineTo(22, 12); c.lineTo(12, 12); c.closePath(); c.fill(); c.restore();
      if (e.labels) txt(c, 'LDO', 0, 30, 13, 'rgba(255,255,255,.82)'); } };

  // 传感器 / 执行器
  C.buzzer = { name: '蜂鸣器·直插', cat: 'actuator', pkg: 'th', defaults: { label: '' }, terminals: pinH(52),
    draw(c, p, e) { fRound(c, p, e, { t: 52, r: 26, top: '#5a6270', mid: '#2c323d', bot: '#15181e', face(m) { m.save(); m.strokeStyle = 'rgba(255,255,255,.18)'; m.lineWidth = 2; m.beginPath(); m.arc(0, 0, 16, 0, Math.PI * 2); m.stroke(); m.fillStyle = '#9aa7bd'; m.beginPath(); m.arc(0, 0, 5, 0, Math.PI * 2); m.fill(); m.restore(); } }); } };
  C.buzzer_smd = { name: '贴片蜂鸣器', cat: 'actuator', pkg: 'smd', defaults: { label: '' }, terminals: pinH(34),
    draw(c, p, e) { lead(c, -34, -20, 0, 1.8); lead(c, 20, 34, 0, 1.8); c.save(); c.fillStyle = '#1c2330'; c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.fillStyle = '#9aa7bd'; c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill(); c.restore(); } };
  C.motor = { name: '电机', cat: 'actuator', pkg: 'th', defaults: { label: '' }, terminals: pinH(52),
    draw(c, p, e) { lead(c, -52, -38, 0, 2.6); lead(c, 38, 52, 0, 2.6); cyl(c, -38, 30, 22, '#d7dbe4', '#9aa2b2', '#6b7282', true);
      c.save(); c.fillStyle = '#3a3f4a'; roundRect(c, 30, -6, 14, 12, 2); c.fill(); c.restore(); c.save(); c.fillStyle = '#cfd6e0'; roundRect(c, 44, -3, 12, 6, 2); c.fill(); c.restore();
      c.save(); c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 2; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-34, i * 7); c.lineTo(26, i * 7); c.stroke(); } c.restore();
      if (e.labels) txt(c, '电机', -4, 38, 18, 'rgba(255,255,255,.82)'); } };
  C.speaker = { name: '扬声器', cat: 'actuator', pkg: 'th', defaults: { label: '' }, terminals: pinH(46),
    draw(c, p, e) { lead(c, -46, -28, 0, 2.4); lead(c, 28, 46, 0, 2.4); c.save(); c.fillStyle = '#2a2f38'; c.beginPath(); c.arc(0, 0, 28, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); disc(c, -4, 0, 14, '#4a4f59', '#2c323d', '#15181e'); c.fillStyle = '#9aa7bd'; c.beginPath(); c.arc(-4, 0, 5, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#6b7282'; c.lineWidth = 2; c.beginPath(); c.arc(14, 0, 12, -Math.PI * .6, Math.PI * .6); c.stroke(); c.restore(); } };
  C.mic = { name: '麦克风', cat: 'actuator', pkg: 'th', defaults: { label: '' }, terminals: pinH(40),
    draw(c, p, e) { lead(c, -40, -16, 0, 2.2); lead(c, 16, 40, 0, 2.2); c.save(); c.fillStyle = '#2b2f38'; roundRect(c, -16, -28, 32, 56, 14); c.fill(); c.fillStyle = '#1c2330'; roundRect(c, -10, -22, 20, 44, 10); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#9aa7bd'; c.lineWidth = 1.5; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-8, i * 7); c.quadraticCurveTo(0, i * 7 - 5, 8, i * 7); c.stroke(); } c.restore(); } };
  C.crystal = { name: '晶振·直插', cat: 'actuator', pkg: 'th', defaults: { value: 16, label: '' }, terminals: pinH(52),
    draw(c, p, e) { lead(c, -52, -22, 0, 2.4); lead(c, 22, 52, 0, 2.4); c.save(); const g = c.createLinearGradient(-22, -22, 22, 22); g.addColorStop(0, '#e9edf3'); g.addColorStop(.5, '#aeb6c4'); g.addColorStop(1, '#7c8499'); c.fillStyle = g; roundRect(c, -22, -22, 44, 44, 8); c.fill(); c.fillStyle = 'rgba(255,255,255,.5)'; roundRect(c, -18, -18, 14, 8, 3); c.fill(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'MHz'), 0, 38, 18, 'rgba(255,255,255,.82)'); } };
  C.crystal_smd = { name: '贴片晶振', cat: 'actuator', pkg: 'smd', defaults: { value: 32, label: '' }, terminals: pinH(26),
    draw(c, p, e) { lead(c, -26, -16, 0, 1.8); lead(c, 16, 26, 0, 1.8); c.save(); c.fillStyle = '#d7dbe4'; roundRect(c, -16, -14, 32, 28, 5); c.fill(); c.restore();
      c.save(); c.fillStyle = '#9aa2b2'; roundRect(c, -10, -9, 20, 18, 3); c.fill(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'MHz'), 0, 30, 16, 'rgba(255,255,255,.82)'); } };
  C.antenna = { name: '天线', cat: 'actuator', pkg: 'other', open: true, defaults: { label: '' }, terminals: [{ x: 0, y: 30 }], draw: fAntenna };
  C.fuse = { name: '保险丝·直插', cat: 'actuator', pkg: 'th', defaults: { value: 2, label: '' }, terminals: pinH(55),
    draw(c, p, e) { lead(c, -55, -26, 0, 2.4); lead(c, 26, 55, 0, 2.4); c.save(); c.fillStyle = 'rgba(210,225,235,.35)'; roundRect(c, -26, -10, 52, 20, 9); c.fill(); c.strokeStyle = 'rgba(180,195,210,.7)'; c.lineWidth = 1.5; roundRect(c, -26, -10, 52, 20, 9); c.stroke(); c.restore();
      c.save(); c.fillStyle = '#d7dbe4'; roundRect(c, -26, -10, 7, 20, 3); c.fill(); roundRect(c, 19, -10, 7, 20, 3); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#caa24a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-19, 0); c.quadraticCurveTo(0, 8, 0, 0); c.quadraticCurveTo(0, -8, 19, 0); c.stroke(); c.restore();
      if (e.labels) txt(c, valLabel(p, 'A'), 0, 28, 18, 'rgba(255,255,255,.82)'); } };
  C.fuse_smd = { name: '贴片保险丝', cat: 'actuator', pkg: 'smd', defaults: { value: 2, label: '' }, terminals: pinH(28),
    draw(c, p, e) { lead(c, -28, -16, 0, 1.8); lead(c, 16, 28, 0, 1.8); c.save(); c.fillStyle = 'rgba(210,225,235,.4)'; roundRect(c, -16, -9, 32, 18, 7); c.fill(); c.strokeStyle = 'rgba(180,195,210,.8)'; c.lineWidth = 1.2; roundRect(c, -16, -9, 32, 18, 7); c.stroke(); c.restore();
      c.save(); c.fillStyle = '#d7dbe4'; roundRect(c, -16, -9, 6, 18, 2); c.fill(); roundRect(c, 10, -9, 6, 18, 2); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#caa24a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-10, 0); c.quadraticCurveTo(0, 6, 0, 0); c.quadraticCurveTo(0, -6, 10, 0); c.stroke(); c.restore(); } };

  // 连接器 / 接口
  C.header = { name: '排针 1x4·直插', cat: 'connector', pkg: 'th', defaults: { label: '' }, terminals: (() => { const a = []; const x0 = -(4 - 1) * 22 / 2; for (let i = 0; i < 4; i++) a.push({ x: x0 + i * 22, y: 34 }); return a; })(),
    draw(c, p, e) { fHeader(c, p, e, { n: 4, smd: false }); } };
  C.header_smd = { name: '贴片排针 1x4', cat: 'connector', pkg: 'smd', defaults: { label: '' }, terminals: (() => { const a = []; const x0 = -(4 - 1) * 22 / 2; for (let i = 0; i < 4; i++) a.push({ x: x0 + i * 22, y: 14 }); return a; })(),
    draw(c, p, e) { fHeader(c, p, e, { n: 4, smd: true }); } };
  C.terminal = { name: '接线端子', cat: 'connector', pkg: 'th', defaults: { label: '' }, terminals: pinH(46),
    draw(c, p, e) { lead(c, -46, -22, 0, 2.6); lead(c, 22, 46, 0, 2.6); c.save(); c.fillStyle = '#2b2f38'; roundRect(c, -22, -18, 44, 36, 6); c.fill(); c.fillStyle = '#1c2330'; c.beginPath(); c.arc(-9, 0, 6, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(9, 0, 6, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.fillStyle = '#caa24a'; c.beginPath(); c.arc(-9, -8, 3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(9, -8, 3, 0, Math.PI * 2); c.fill(); c.restore(); } };
  C.jack = { name: '音频接口 3.5mm', cat: 'connector', pkg: 'th', defaults: { label: '' }, terminals: [{ x: -46, y: 0 }, { x: -20, y: 30 }, { x: 10, y: 30 }],
    draw(c, p, e) { lead(c, -46, -16, 0, 2.4); leadV(c, 0, 30, -20, 2.2); leadV(c, 0, 30, 10, 2.2); c.save(); c.fillStyle = '#3a3f4a'; roundRect(c, -16, -16, 32, 32, 14); c.fill(); c.fillStyle = '#1c2330'; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.strokeStyle = '#cfd6e0'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.stroke(); c.restore(); } };
  C.usb_c = { name: 'USB Type-C', cat: 'connector', pkg: 'smd', defaults: { label: '' }, terminals: [{ x: -20, y: -14 }, { x: 20, y: -14 }, { x: -20, y: 14 }, { x: 20, y: 14 }],
    draw(c, p, e) { lead(c, -20, -10, -14, 1.6); lead(c, 10, 20, -14, 1.6); lead(c, -20, -10, 14, 1.6); lead(c, 10, 20, 14, 1.6); c.save(); c.fillStyle = '#1c2330'; roundRect(c, -12, -16, 24, 32, 8); c.fill(); c.fillStyle = '#9aa2b2'; roundRect(c, -8, -4, 16, 8, 4); c.fill(); c.restore();
      if (e.labels) txt(c, 'USB-C', 0, 30, 13, 'rgba(255,255,255,.82)'); } };
  C.socket = { name: '电源插座', cat: 'connector', pkg: 'th', defaults: { label: '' }, terminals: [{ x: -24, y: 30 }, { x: 0, y: 30 }, { x: 24, y: 30 }],
    draw(c, p, e) { leadV(c, -10, 30, -24, 2.2); leadV(c, -10, 30, 0, 2.2); leadV(c, -10, 30, 24, 2.2); c.save(); c.fillStyle = '#2b2f38'; roundRect(c, -26, -22, 52, 36, 8); c.fill(); c.fillStyle = '#0e1117'; c.beginPath(); c.arc(-12, -4, 5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(12, -4, 5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(0, 8, 5, 0, Math.PI * 2); c.fill(); c.restore(); } };

  // 测量 / 其他
  C.voltmeter = { name: '电压表', cat: 'meter', pkg: 'other', defaults: { label: '' }, terminals: pinH(52),
    draw(c, p, e) { fRound(c, p, e, { t: 52, r: 28, top: '#3a3f4a', mid: '#1c2330', bot: '#0e1117', face(m) { m.save(); m.fillStyle = '#f3f0e6'; m.beginPath(); m.arc(0, 0, 21, 0, Math.PI * 2); m.fill(); m.strokeStyle = '#888'; m.lineWidth = 1.5; for (let i = -3; i <= 3; i++) { const a = -Math.PI * .75 + (i + 3) / 6 * Math.PI * 1.5; m.beginPath(); m.moveTo(Math.cos(a) * 16, Math.sin(a) * 16); m.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); m.stroke(); } m.strokeStyle = '#e23b2e'; m.lineWidth = 2; m.beginPath(); m.moveTo(0, 0); m.lineTo(13, -9); m.stroke(); m.fillStyle = '#333'; m.beginPath(); m.arc(0, 0, 2.5, 0, Math.PI * 2); m.fill(); m.restore(); } }); } };
  C.ammeter = { name: '电流表', cat: 'meter', pkg: 'other', defaults: { label: '' }, terminals: pinH(52),
    draw(c, p, e) { fRound(c, p, e, { t: 52, r: 28, top: '#3a3f4a', mid: '#1c2330', bot: '#0e1117', face(m) { m.save(); m.fillStyle = '#f3f0e6'; m.beginPath(); m.arc(0, 0, 21, 0, Math.PI * 2); m.fill(); m.strokeStyle = '#888'; m.lineWidth = 1.5; for (let i = -3; i <= 3; i++) { const a = -Math.PI * .75 + (i + 3) / 6 * Math.PI * 1.5; m.beginPath(); m.moveTo(Math.cos(a) * 16, Math.sin(a) * 16); m.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); m.stroke(); } m.strokeStyle = '#2f6bff'; m.lineWidth = 2; m.beginPath(); m.moveTo(0, 0); m.lineTo(13, -9); m.stroke(); m.fillStyle = '#333'; m.beginPath(); m.arc(0, 0, 2.5, 0, Math.PI * 2); m.fill(); m.restore(); } }); } };
  C.ground = { name: '接地', cat: 'meter', pkg: 'other', open: true, defaults: { label: '' }, terminals: [{ x: 0, y: -28 }], draw: fGround };

  const COMPONENTS = C;

  // 类别（用于分组与搜索）
  const CATEGORIES = [
    { key: 'power', name: '电源' },
    { key: 'resistor', name: '电阻' },
    { key: 'capacitor', name: '电容' },
    { key: 'inductor', name: '电感' },
    { key: 'diode', name: '二极管' },
    { key: 'transistor', name: '晶体管' },
    { key: 'switch', name: '开关 / 继电器' },
    { key: 'ic', name: '集成电路 / 芯片' },
    { key: 'actuator', name: '传感器 / 执行器' },
    { key: 'connector', name: '连接器 / 接口' },
    { key: 'meter', name: '测量 / 其他' }
  ];
  const PKG_LABEL = { th: '直插', smd: '贴片', ic: '芯片', other: '' };

  function conducts(c) {
    if (c.type === 'custom') {
      if (!c.custom || !c.custom.terminals || c.custom.terminals.length < 2) return false;
      return c.custom.conducts !== false;
    }
    const def = COMPONENTS[c.type];
    if (!def) return false;
    if (def.open) return false;
    if (c.type === 'switch_toggle' || c.type === 'button') return !!c.params.closed;
    return true;
  }
  function getLocalTerminals(c) {
    if (c.terminals && c.terminals.length) return c.terminals;
    if (c.type === 'custom') return (c.custom && c.custom.terminals) || [];
    const def = COMPONENTS[c.type];
    return def ? def.terminals : [];
  }
  function getTerminals(c) {
    const local = getLocalTerminals(c);
    const ang = (c.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    return local.map(t => {
      const rx = t.x * cos - t.y * sin, ry = t.x * sin + t.y * cos;
      return { x: c.x + rx, y: c.y + ry };
    });
  }
  // 实景缩略图（元件库图标）
  function thumbFor(type) {
    const def = COMPONENTS[type]; if (!def) return '';
    try {
      const cv = document.createElement('canvas'); cv.width = 132; cv.height = 92;
      const g = cv.getContext('2d'); g.translate(66, 46);
      def.draw(g, Object.assign({}, def.defaults), { accent: '#9aa7c7', current: '#ffd54a', powered: false, labels: false });
      return cv.toDataURL();
    } catch (e) { return ''; }
  }
  function svgFor(type) {
    const url = thumbFor(type);
    if (url) return `<img src="${url}" style="width:56px;height:38px;object-fit:contain" alt="">`;
    return '';
  }

  global.CS = { COMPONENTS, CATEGORIES, PKG_LABEL, conducts, getTerminals, getLocalTerminals, thumbFor, svgFor };
})(window);
