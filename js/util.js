window.AT = window.AT || {};
(() => {
function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// size the backing store to the CSS box so lines stay sharp on retina screens
function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function fmtPct(x, d = 1) { return `${(x * 100).toFixed(d)}%`; }

function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of [].concat(kids)) if (k != null) n.append(k instanceof Node ? k : String(k));
  return n;
}
Object.assign(window.AT, { css, setupCanvas, fmtPct, el });
})();
