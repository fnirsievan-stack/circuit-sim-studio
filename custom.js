/* custom.js — 自定义元件：存储、栅格化、绘制 */
(function (global) {
  const KEY = 'cs_custom_v1';
  let defs = load();
  const raster = {}; // key -> {img, ready, loading}

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(defs)); } catch (e) {} }
  function list() { return defs; }
  function get(id) { return defs.find(d => d.id === id); }
  function upsert(def) {
    const i = defs.findIndex(d => d.id === def.id);
    if (i >= 0) defs[i] = def; else defs.push(def);
    save();
  }
  function remove(id) { defs = defs.filter(d => d.id !== id); save(); }

  function normalizeSvg(def) {
    let s = (def.svg || '').trim();
    if (!s) return '';
    if (!/^<svg/i.test(s)) s = '<svg xmlns="http://www.w3.org/2000/svg">' + s + '</svg>';
    if (!/width=/i.test(s)) s = s.replace(/<svg/i, `<svg width="${def.width}" height="${def.height}"`);
    if (!/viewBox=/i.test(s)) s = s.replace(/<svg/i, `<svg viewBox="0 0 ${def.width} ${def.height}"`);
    return s;
  }
  function rasterKey(def) { return def.mode === 'image' ? 'img:' + (def.img || '').slice(0, 64) : 'svg:' + (def.svg || '').length + ':' + (def.svg || '').slice(0, 32); }

  function getRaster(def) {
    const key = rasterKey(def);
    if (raster[key] && raster[key].ready) return raster[key].img;
    if (raster[key] && raster[key].loading) return null;
    raster[key] = { ready: false, loading: true, img: null };
    const data = def.mode === 'image' ? def.img : ('data:image/svg+xml;utf8,' + encodeURIComponent(normalizeSvg(def)));
    const img = new Image();
    img.onload = () => { raster[key].img = img; raster[key].ready = true; raster[key].loading = false; };
    img.onerror = () => { raster[key].loading = false; raster[key].ready = false; };
    img.src = data;
    return null;
  }

  function draw(ctx, c, env) {
    const def = c.custom; if (!def) return;
    const w = def.width || 120, h = def.height || 80;
    const terms = (c.terminals && c.terminals.length) ? c.terminals : (def.terminals || []);
    // 引脚引线（朝中心收拢）
    terms.forEach(t => {
      const len = 16, dx = Math.hypot(t.x, t.y) || 1;
      const ix = t.x - t.x / dx * len, iy = t.y - t.y / dx * len;
      ctx.save();
      const g = ctx.createLinearGradient(t.x, t.y, ix, iy);
      g.addColorStop(0, '#e9edf5'); g.addColorStop(.5, '#aeb6c6'); g.addColorStop(1, '#767e92');
      ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(ix, iy); ctx.stroke();
      ctx.fillStyle = '#cfd6e0'; ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    if (env.powered) {
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, Math.max(w, h) * 0.7);
      g.addColorStop(0, env.current); g.addColorStop(.6, env.current + '66'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Math.max(w, h) * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    const img = getRaster(def);
    ctx.save();
    if (img) ctx.drawImage(img, -w / 2, -h / 2, w, h);
    else { ctx.strokeStyle = env.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]); }
    ctx.restore();
    if (env.labels) {
      const lbl = c.params.label || (c.params.value ? `${c.params.value}${def.valueUnit || ''}` : '');
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(lbl || def.name, 0, h / 2 + 24); ctx.restore();
    }
  }

  function iconMarkup(def) {
    if (def.mode === 'image') return `<img src="${def.img}" style="width:42px;height:30px;object-fit:contain" alt="">`;
    const s = normalizeSvg(def);
    return s ? `<div style="width:42px;height:30px;display:flex;align-items:center;justify-content:center;overflow:hidden">${s.replace('<svg', '<svg width="42" height="30"').replace('viewBox', 'preserveAspectRatio="xMidYMid meet" viewBox')}</div>` : `<span>${def.name[0]}</span>`;
  }

  global.CustomStore = { list, get, upsert, remove, draw, iconMarkup, normalizeSvg };
})(window);
