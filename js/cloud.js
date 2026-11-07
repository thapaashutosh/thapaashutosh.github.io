window.AT = window.AT || {};
(() => {
// Hero scene. 1,400 "normal" API calls in five behaviour clusters, 14 outliers.
// Every few seconds it replays what an Isolation Forest does: random axis aligned cuts
// until one outlier sits alone in its box. Plain canvas 2D + a perspective projection.

const LABELS = [
  'StopLogging 203.0.113.42', 'CreateAccessKey 03:14', 'RunInstances ap-southeast-1', 'GetSecretValue denied',
  'AttachUserPolicy denied', 'ListUsers from new IP', 'kali user agent', 'ConsoleLogin 04:02',
  'DescribeInstances eu-north-1', 'PutBucketPolicy', 'DeleteTrail', 'GetCallerIdentity x40',
  'CreateLoginProfile', 'AssumeRole new account',
];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initCloud(canvas, hud) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const r = mulberry(7);
  const g = () => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  const centers = [[-0.45, -0.15, 0.3], [0.42, 0.28, -0.25], [0.05, 0.5, 0.42], [-0.25, -0.48, -0.38], [0.45, -0.35, 0.3]];
  const spread = [[0.14, 0.08, 0.12], [0.1, 0.15, 0.09], [0.12, 0.07, 0.1], [0.09, 0.11, 0.14], [0.11, 0.1, 0.07]];
  const pts = [];
  for (let i = 0; i < 1400; i++) {
    const k = i % 5, c = centers[k], s = spread[k];
    pts.push([c[0] + g() * s[0], c[1] + g() * s[1], c[2] + g() * s[2]]);
  }
  const out = LABELS.map(label => {
    let v; do { v = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]; } while (Math.hypot(...v) < 0.75 || Math.max(...v.map(Math.abs)) > 0.95);
    return { p: v, label };
  });

  let rotY = 0.6, rotX = -0.35, vel = 0.0022, dragging = false, lastX = 0, lastY = 0, mx = 0, my = 0, hover = -1;
  let W = 0, H = 0, ctx = null, colors = {}, running = false, raf = 0;

  function readColors() {
    const s = getComputedStyle(document.documentElement);
    colors = {
      ink: s.getPropertyValue('--ink').trim(), muted: s.getPropertyValue('--muted').trim(),
      line: s.getPropertyValue('--line').trim(), accent: s.getPropertyValue('--accent').trim(),
      blue: s.getPropertyValue('--blue').trim(), bg: s.getPropertyValue('--bg').trim(),
    };
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(p) {
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
    const y2 = p[1] * cx - z1 * sx, z2 = p[1] * sx + z1 * cx;
    const d = 3.4, f = Math.min(W, H) * 0.82;
    const s = f / (d + z2);
    return [W / 2 + x1 * s, H / 2 + y2 * s, z2, s];
  }

  // ----- isolation replay -----
  let iso = null; // { target, cuts: [{axis, v, box}], t0 }
  function newIsolation(now) {
    const target = Math.floor(r() * out.length);
    const o = out[target].p;
    let box = [[-1, 1], [-1, 1], [-1, 1]];
    const cuts = [];
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const axis = Math.floor(r() * 3);
      const [lo, hi] = box[axis];
      // a cut between the outlier and the far side of its box, like a split that happens to separate it
      const towardCenter = Math.abs(o[axis] - lo) > Math.abs(o[axis] - hi) ? lo : hi;
      const v = o[axis] + (towardCenter - o[axis]) * (0.15 + r() * 0.5);
      const before = box.map(b => b.slice());
      box = box.map(b => b.slice());
      if (o[axis] < v) box[axis][1] = v; else box[axis][0] = v;
      cuts.push({ axis, v, box: before });
    }
    iso = { target, cuts, final: box, t0: now };
  }

  function quad(axis, v, box) {
    const [a, b] = [0, 1, 2].filter(i => i !== axis);
    const corners = [[box[a][0], box[b][0]], [box[a][1], box[b][0]], [box[a][1], box[b][1]], [box[a][0], box[b][1]]];
    return corners.map(([u, w]) => { const p = [0, 0, 0]; p[axis] = v; p[a] = u; p[b] = w; return project(p); });
  }
  function boxEdges(box) {
    const c = [];
    for (const x of box[0]) for (const y of box[1]) for (const z of box[2]) c.push(project([x, y, z]));
    return [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].map(([i, j]) => [c[i], c[j]]);
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    // outer cube
    ctx.strokeStyle = colors.line; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const [p, q] of boxEdges([[-1, 1], [-1, 1], [-1, 1]])) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    ctx.stroke();

    // normal points, far ones fainter and smaller
    ctx.fillStyle = colors.ink;
    for (const p of pts) {
      const [x, y, z, s] = project(p);
      ctx.globalAlpha = 0.18 + 0.5 * (1 - (z + 1) / 2);
      const size = Math.max(1, s * 0.0045);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    // isolation cuts
    let label = null;
    if (iso) {
      const step = 520, t = now - iso.t0;
      const shown = Math.min(iso.cuts.length, Math.floor(t / step) + 1);
      for (let i = 0; i < shown; i++) {
        const c = iso.cuts[i];
        const k = i === shown - 1 ? Math.min(1, (t - i * step) / 300) : 1;
        const q = quad(c.axis, c.v, c.box);
        const latest = i === shown - 1;
        ctx.globalAlpha = (latest ? 0.06 : 0.025) * k;
        ctx.fillStyle = colors.accent;
        ctx.beginPath(); q.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = (latest ? 0.7 : 0.28) * k;
        ctx.strokeStyle = colors.accent; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (t > iso.cuts.length * step) {
        ctx.strokeStyle = colors.accent; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const [p, q] of boxEdges(iso.final)) { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
        ctx.stroke(); ctx.lineWidth = 1;
        label = { i: iso.target, text: `isolated in ${iso.cuts.length} cuts` };
      }
      if (hud) hud.textContent = t > iso.cuts.length * step
        ? `${out[iso.target].label}  ·  isolated in ${iso.cuts.length} cuts  ·  normal calls need ~10`
        : `isolating ${out[iso.target].label}  ·  cut ${shown} of ${iso.cuts.length}`;
      if (t > iso.cuts.length * step + 1900) newIsolation(now);
    }

    // outliers
    out.forEach((o, i) => {
      const [x, y] = project(o.p);
      const active = (iso && iso.target === i) || hover === i;
      ctx.fillStyle = colors.accent;
      const s = active ? 7 : 4.5;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      if (active) {
        ctx.strokeStyle = colors.accent;
        ctx.strokeRect(x - 7, y - 7, 14, 14);
      }
      o.sx = x; o.sy = y;
    });
    const tag = hover >= 0 ? { i: hover, text: out[hover].label } : label && { i: label.i, text: out[label.i].label };
    if (tag) {
      const o = out[tag.i];
      ctx.font = '500 11px "Martian Mono", ui-monospace, monospace';
      const w = ctx.measureText(tag.text).width + 14;
      const lx = Math.min(W - w - 4, Math.max(4, o.sx + 14)), ly = Math.max(4, o.sy - 30);
      ctx.strokeStyle = colors.accent;
      ctx.beginPath(); ctx.moveTo(o.sx + 5, o.sy - 5); ctx.lineTo(lx, ly + 20); ctx.stroke();
      ctx.fillStyle = colors.ink; ctx.fillRect(lx, ly, w, 21);
      ctx.fillStyle = colors.bg; ctx.fillText(tag.text, lx + 7, ly + 14);
    }
  }

  function frame(now) {
    if (!dragging) { rotY += vel; vel += (0.0022 - vel) * 0.02; }
    draw(now);
    if (running) raf = requestAnimationFrame(frame);
  }
  function start() { if (!running && !reduce) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  canvas.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const b = canvas.getBoundingClientRect();
    mx = e.clientX - b.left; my = e.clientY - b.top;
    if (dragging) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      rotY += dx * 0.008; vel = dx * 0.008;
      rotX = Math.max(-1.2, Math.min(1.2, rotX + dy * 0.006));
      lastX = e.clientX; lastY = e.clientY;
    }
    hover = -1;
    out.forEach((o, i) => { if (Math.hypot(o.sx - mx, o.sy - my) < 12) hover = i; });
    if (reduce) draw(performance.now());
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { hover = -1; });

  readColors(); resize();
  newIsolation(performance.now());
  if (reduce) { iso.t0 = -1e9; draw(0); }
  new ResizeObserver(() => { resize(); draw(performance.now()); }).observe(canvas);
  let inView = false;
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; inView ? start() : stop(); }).observe(canvas);
  document.addEventListener('themechange', () => { readColors(); draw(performance.now()); });
  document.addEventListener('visibilitychange', () => (document.hidden || !inView ? stop() : start()));
}

Object.assign(window.AT, { initCloud });
})();
