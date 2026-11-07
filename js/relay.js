window.AT = window.AT || {};
(() => {
const { css, setupCanvas, el, fmtPct } = window.AT;
// ---------- semantic cache ----------

const DIM = 512;

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// hashed word unigrams + bigrams + char trigrams, signed to cancel collisions, L2 normalized
function embed(text) {
  const v = new Float32Array(DIM);
  const norm = text.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = norm.split(' ').filter(Boolean);
  const add = (tok, w) => { const h = fnv(tok); v[h % DIM] += (h & 0x80000000 ? -1 : 1) * w; };
  words.forEach((w, i) => { add('w:' + w, 1); if (i) add('b:' + words[i - 1] + '_' + w, 1); });
  const padded = ` ${norm} `;
  for (let i = 0; i + 3 <= padded.length; i++) add('c:' + padded.slice(i, i + 3), 0.4);
  let n = 0; for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= n;
  return v;
}
function cos(a, b) { let s = 0; for (let i = 0; i < DIM; i++) s += a[i] * b[i]; return s; }

const SEED = [
  ['How do I reset my password?', 'Settings, then Security, then Reset password. The link expires in 30 minutes.'],
  ['What are your support hours?', 'Weekdays 8am to 6pm Central.'],
  ['How do I export my data to CSV?', 'Open the table, use the export menu, pick CSV.'],
  ['What is the refund policy for annual plans?', 'Full refund within 14 days, prorated after that.'],
  ['Summarize this week\'s release notes', 'Faster search, two bug fixes in billing, new dark mode.'],
  ['Translate good morning to Spanish', 'Buenos dias.'],
];
const SAMPLES = [
  'How do I reset my password?',
  'how do i reset my password',
  'How do I reset my password??',
  'How can I reset my password?',
  'What are your support hours today?',
  'Write a haiku about Redis',
];
const COST = 0.004; // assumed dollars per provider call

function initRelay(root) {
  const $ = s => root.querySelector(`[data-out="${s}"]`);
  const ctl = s => root.querySelector(`[data-ctl="${s}"]`);

  // cache side
  const cache = SEED.map(([q, a]) => ({ q, a, v: embed(q) }));
  const cs = { req: 0, hit: 0 };
  let thr = 0.95;

  function ask(q) {
    q = q.trim();
    if (!q) return;
    const v = embed(q);
    const ranked = cache.map(e => ({ e, s: cos(v, e.v) })).sort((a, b) => b.s - a.s);
    const best = ranked[0];
    const hit = best && best.s >= thr;
    cs.req++; if (hit) cs.hit++;
    const box = $('result');
    const head = hit
      ? el('div', {}, [el('span', { class: 'hit' }, 'HIT '), `${best.s.toFixed(3)} >= ${thr.toFixed(2)}, served from Redis in ~2 ms`])
      : el('div', {}, [el('span', { class: 'miss' }, 'MISS '), `best ${best ? best.s.toFixed(3) : '0'} < ${thr.toFixed(2)}, called the provider and stored the answer`]);
    const answer = el('div', { class: 'muted' }, hit ? `> ${best.e.a}` : '> (fresh answer from provider)');
    const bars = ranked.slice(0, 3).map(({ e, s }) => el('div', { class: 'simrow' }, [
      s.toFixed(3),
      el('div', { class: 'simbar' }, [
        el('i', { class: s >= thr ? 'over' : '', style: `width:${Math.max(0, s) * 100}%` }),
        el('em', { style: `left:${thr * 100}%` }),
      ]),
      el('div', { class: 'simtxt' }, e.q),
    ]));
    box.replaceChildren(head, answer, ...bars);
    if (!hit) cache.push({ q, a: '(stored answer)', v });
    $('cstats').replaceChildren(
      st(String(cs.req), 'requests'),
      st(fmtPct(cs.hit / cs.req, 0), 'hit rate', cs.hit ? 'good' : ''),
      st(`$${(cs.hit * COST).toFixed(3)}`, 'saved at $0.004/call'),
      st(String(cache.length), 'entries'),
    );
  }
  const st = (v, l, cls = '') => el('div', { class: cls }, [el('b', {}, v), el('span', {}, l)]);

  $('form').addEventListener('submit', e => { e.preventDefault(); ask(ctl('prompt').value); });
  $('samples').replaceChildren(...SAMPLES.map(s => el('button', { class: 'chip', type: 'button', onclick: () => { ctl('prompt').value = s; ask(s); } }, s)));
  ctl('cthr').addEventListener('input', () => { thr = +ctl('cthr').value; $('cthr').textContent = thr.toFixed(2); });
  $('result').textContent = 'Pick a sample or type something. Six answers are already cached.';

  // ---------- token bucket + failover ----------
  const SEC = 60, TICK = 100;
  const sim = {
    rps: 12, refill: 15, tokens: 30, aDown: false, bDown: false,
    fails: 0, openUntil: 0, tick: 0, paused: false, visible: false,
    bins: [], tot: { a: 0, b: 0, lim: 0, err: 0 },
  };
  const newBin = () => ({ a: 0, b: 0, lim: 0, err: 0, open: false });
  sim.bins.push(newBin());

  function poisson(l) {
    const L = Math.exp(-l); let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  function step() {
    sim.tick++;
    const cap = sim.refill * 2;
    sim.tokens = Math.min(cap, sim.tokens + sim.refill / 10);
    const bin = sim.bins[sim.bins.length - 1];
    const n = poisson(sim.rps / 10);
    for (let i = 0; i < n; i++) {
      if (sim.tokens < 1) { bin.lim++; sim.tot.lim++; continue; }
      sim.tokens -= 1;
      const open = sim.tick < sim.openUntil;
      let served = null;
      if (!open) {
        if (!sim.aDown) { served = 'a'; sim.fails = 0; }
        else if (++sim.fails >= 3) { sim.openUntil = sim.tick + 50; sim.fails = 0; }
      }
      if (!served) served = sim.bDown ? 'err' : 'b';
      bin[served]++; sim.tot[served]++;
    }
    if (sim.tick < sim.openUntil) bin.open = true;
    if (sim.tick % 10 === 0) { sim.bins.push(newBin()); if (sim.bins.length > SEC) sim.bins.shift(); }
    if (sim.tick % 2 === 0) { draw(); fstats(); }
  }

  const canvas = $('strip');
  function draw() {
    const { ctx, w, h } = setupCanvas(canvas);
    const colA = css('--ink-2'), colB = css('--ok'), colL = css('--warn'), colE = css('--accent'), rule = css('--rule'), muted = css('--muted');
    const max = Math.max(10, ...sim.bins.map(b => b.a + b.b + b.lim + b.err));
    const bw = (w - 30) / SEC, top = 10, base = h - 16;
    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, base + 0.5); ctx.lineTo(w, base + 0.5); ctx.stroke();
    ctx.fillStyle = muted; ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText(String(max), 2, top + 8); ctx.fillText('0', 2, base);
    ctx.fillText('60s ago', 30, h - 3); ctx.fillText('now', w - 22, h - 3);
    const off = SEC - sim.bins.length;
    sim.bins.forEach((b, i) => {
      const x = 30 + (off + i) * bw;
      let y = base;
      for (const [k, col] of [['a', colA], ['b', colB], ['lim', colL], ['err', colE]]) {
        const bh = (b[k] / max) * (base - top);
        if (bh > 0) { ctx.fillStyle = col; ctx.fillRect(x + 1, y - bh, Math.max(1, bw - 2), bh); y -= bh; }
      }
      if (b.open) { ctx.fillStyle = colE; ctx.fillRect(x, 2, bw, 3); }
    });
  }
  $('legend').innerHTML = ['--ink-2:provider A', '--ok:failover to B', '--warn:429 rate limited', '--accent:client saw error'].map(s => {
    const [v, l] = s.split(':'); return `<span><i style="background:var(${v})"></i>${l}</span>`;
  }).join('') + '<span>top strip = breaker open</span>';

  function fstats() {
    const t = sim.tot, all = t.a + t.b + t.lim + t.err;
    $('fstats').replaceChildren(
      st(String(all), 'requests'),
      st(all ? fmtPct((t.a + t.b) / all, 1) : '0%', 'served'),
      st(String(t.b), 'failed over'),
      st(String(t.err), 'errors seen', t.err ? 'bad' : 'good'),
      st(sim.tick < sim.openUntil ? 'open' : 'closed', 'breaker on A', sim.tick < sim.openUntil ? 'bad' : ''),
    );
  }

  const bind = (k, f) => ctl(k).addEventListener('input', () => { sim[k] = +ctl(k).value; $(k).textContent = ctl(k).value; f && f(); });
  bind('rps'); bind('refill');
  const toggle = (act, key, label) => {
    const b = root.querySelector(`[data-act="${act}"]`);
    b.addEventListener('click', () => {
      sim[key] = !sim[key];
      b.classList.toggle('on', sim[key]);
      b.textContent = `${label}: ${sim[key] ? 'returning 503' : 'up'}`;
    });
  };
  toggle('breakA', 'aDown', 'provider A');
  toggle('breakB', 'bDown', 'provider B');
  const pb = root.querySelector('[data-act="pause"]');
  pb.addEventListener('click', () => { sim.paused = !sim.paused; pb.textContent = sim.paused ? 'resume' : 'pause'; });

  setInterval(() => { if (!sim.paused && sim.visible && !document.hidden) step(); }, TICK);
  new IntersectionObserver(([e]) => { sim.visible = e.isIntersecting; }).observe(canvas);
  new ResizeObserver(() => draw()).observe(canvas);
  document.addEventListener('themechange', draw);
  draw(); fstats();
}
Object.assign(window.AT, { embed, initRelay });
})();
