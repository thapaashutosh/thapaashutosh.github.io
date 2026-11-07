window.AT = window.AT || {};
(() => {
const { IsolationForest, rng, css, setupCanvas, fmtPct, el } = window.AT;
// ---------- synthetic CloudTrail ----------

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEK = 7 * 1440;

const IDS = [
  {
    name: 'ci-deploy', n: 900, sess: 6, err: 0.01, key: null,
    hour: r => 8 + r() * 14,
    apis: [['PutObject', 5], ['DescribeStacks', 3], ['AssumeRoleWithWebIdentity', 3], ['UpdateFunctionCode', 2], ['GetObject', 2], ['CreateChangeSet', 1], ['ExecuteChangeSet', 1], ['GetParameter', 1]],
    ips: Array.from({ length: 40 }, (_, i) => [`198.51.100.${i + 1}`, 1]),
    regions: [['us-east-1', 8], ['us-west-2', 2]],
    uas: [['aws-cli/2.15.30 Python/3.11.8 Linux/6.5 GitHubActions', 1]],
  },
  {
    name: 'svc-reporting', n: 1100, sess: 4, err: 0.002, key: 'AKIAIOSFODNN7EXAMPLE',
    hour: r => (r() < 0.7 ? 7 + r() * 11 : 1 + r()),
    apis: [['GetObject', 6], ['ListObjectsV2', 4], ['PutObject', 3], ['GetQueryResults', 3], ['StartQueryExecution', 2], ['ListBuckets', 0.2]],
    ips: [['192.0.2.10', 5], ['192.0.2.11', 5]],
    regions: [['us-east-1', 1]],
    uas: [['Boto3/1.34.69 Python/3.12.2 Linux/5.10 Botocore/1.34.69', 1]],
  },
  {
    name: 'ashu-dev', n: 1200, sess: 5, err: 0.03, key: 'AKIAI44QH8DHBEXAMPLE', novelIp: 0.02, novelRegion: 0.01,
    hour: r => (r() < 0.6 ? gauss(r, 15, 3) : gauss(r, 21, 1.5)),
    apis: [['GetLogEvents', 4], ['DescribeInstances', 3], ['GetObject', 3], ['DescribeLogStreams', 3], ['ListBuckets', 2], ['GetFunction', 2], ['Invoke', 2], ['PutObject', 1], ['DescribeSecurityGroups', 1], ['GetCallerIdentity', 0.8], ['ConsoleLogin', 0.5], ['ListUsers', 0.3]],
    ips: [['192.0.2.50', 6], ['192.0.2.51', 3], ['192.0.2.52', 1]],
    regions: [['us-east-1', 9], ['us-west-2', 1]],
    uas: [['aws-cli/2.15.30 Python/3.11.8 Darwin/23.4.0', 3], ['console.amazonaws.com', 2]],
  },
  {
    name: 'lambda-ingest', n: 1500, sess: 2, err: 0.001, key: null,
    hour: r => r() * 24,
    apis: [['PutItem', 6], ['GetItem', 3], ['PutObject', 2], ['Query', 2]],
    ips: [['192.0.2.20', 1]],
    regions: [['us-east-1', 1]],
    uas: [['Boto3/1.34.69 Python/3.12 exec-env/AWS_Lambda_python3.12', 1]],
  },
  {
    name: 'ops-oncall', n: 300, sess: 3, err: 0.04, key: 'AKIAJ7Q3EXAMPLEOPS01', novelIp: 0.05,
    hour: r => gauss(r, 13, 5),
    apis: [['DescribeServices', 2], ['UpdateService', 2], ['GetLogEvents', 2], ['DescribeInstances', 2], ['GetSecretValue', 0.5], ['AttachRolePolicy', 0.3], ['CreateAccessKey', 0.1]],
    ips: [['192.0.2.60', 4], ['192.0.2.61', 1]],
    regions: [['us-east-1', 1]],
    uas: [['console.amazonaws.com', 3], ['aws-cli/2.15.30 Python/3.11.8 Windows/10', 1]],
  },
];

const ATTACK_UA = 'aws-cli/2.13.0 Python/3.11.4 Linux/6.1.0-kali7-amd64';
const ATTACK = [
  // [minute offset, api, region, error]
  [0.0, 'GetCallerIdentity', 'us-east-1', false],
  [0.4, 'ListBuckets', 'us-east-1', false],
  [0.9, 'ListUsers', 'us-east-1', true],
  [1.6, 'GetSecretValue', 'us-east-1', true],
  [2.3, 'DescribeInstances', 'ap-southeast-1', false],
  [3.1, 'CreateAccessKey', 'us-east-1', false],
  [3.8, 'AttachUserPolicy', 'us-east-1', true],
  [4.9, 'RunInstances', 'ap-southeast-1', false],
  [6.2, 'StopLogging', 'us-east-1', false],
];
const ATTACK_START = 4 * 1440 + 3 * 60 + 12; // fri 03:12

const MITRE = {
  GetCallerIdentity: 'T1033', ListBuckets: 'T1619', ListUsers: 'T1087.004', DescribeInstances: 'T1580',
  GetSecretValue: 'T1555.006', CreateAccessKey: 'T1098.001', AttachUserPolicy: 'T1098.003', AttachRolePolicy: 'T1098.003',
  RunInstances: 'T1578.002', StopLogging: 'T1562.008', ConsoleLogin: 'T1078.004',
};
const SEVERE = new Set(['T1098.001', 'T1098.003', 'T1562.008', 'T1555.006', 'T1578.002']);

function gauss(r, mu, sd) {
  const u = 1 - r(), v = r();
  const h = mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return ((h % 24) + 24) % 24;
}
function pick(r, list) {
  let tot = 0; for (const [, w] of list) tot += w;
  let x = r() * tot;
  for (const [v, w] of list) { if ((x -= w) <= 0) return v; }
  return list[list.length - 1][0];
}

function generate(seed) {
  const r = rng(seed);
  const events = [];
  let novel = 0;
  for (const id of IDS) {
    let made = 0;
    while (made < id.n) {
      const day = Math.floor(r() * 7);
      let t = day * 1440 + id.hour(r) * 60;
      const size = Math.min(id.n - made, 1 + Math.floor(-Math.log(1 - r()) * (id.sess - 1)));
      let ip = pick(r, id.ips), region = pick(r, id.regions);
      if (id.novelIp && r() < id.novelIp) ip = `192.0.2.${120 + (novel++ % 120)}`;
      if (id.novelRegion && r() < id.novelRegion) region = 'eu-west-1';
      const ua = pick(r, id.uas);
      for (let k = 0; k < size; k++) {
        events.push({ t: Math.min(t, WEEK - 1), who: id.name, api: pick(r, id.apis), ip, region, ua, err: r() < id.err, atk: false });
        t += r() * 1.5;
        made++;
      }
    }
  }
  return events;
}

function attackEvents() {
  return ATTACK.map(([dt, api, region, err]) => ({
    t: ATTACK_START + dt, who: 'svc-reporting', api, ip: '203.0.113.42', region, ua: ATTACK_UA, err, atk: true,
  }));
}

// ---------- features ----------

function count(map, k) { map.set(k, (map.get(k) || 0) + 1); }

function baseline(events) {
  const b = new Map();
  for (const e of events) {
    if (!b.has(e.who)) b.set(e.who, { n: 0, api: new Map(), ip: new Map(), region: new Map(), ua: new Map(), hour: new Array(24).fill(0), times: [] });
    const s = b.get(e.who);
    s.n++; count(s.api, e.api); count(s.ip, e.ip); count(s.region, e.region); count(s.ua, e.ua);
    s.hour[Math.floor((e.t % 1440) / 60)]++;
    s.times.push(e);
  }
  for (const s of b.values()) s.times.sort((a, z) => a.t - z.t);
  return b;
}

// leave-one-out for history events so a one-off normal IP looks as new as an attacker's
function rarity(map, k, n, self) {
  const cnt = (map.get(k) || 0) - self;
  return -Math.log((cnt + 1) / (n - self + 1));
}

function windowStats(timeline, t) {
  let calls = 0, errs = 0;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const e = timeline[i];
    if (e.t > t) continue;
    if (e.t <= t - 10) break;
    calls++; if (e.err) errs++;
  }
  return [Math.log1p(calls), Math.log1p(errs)];
}

function features(e, s, self, timeline) {
  const h = Math.floor((e.t % 1440) / 60);
  const H = s.hour, at = i => H[(i + 24) % 24] - (self && ((i + 24) % 24) === h ? 1 : 0);
  const smooth = 0.5 * at(h) + 0.25 * at(h - 1) + 0.25 * at(h + 1);
  const hourRare = -Math.log((smooth + 0.5) / (s.n - self + 12));
  const [burst, errs] = windowStats(timeline, e.t);
  return [
    rarity(s.api, e.api, s.n, self),
    rarity(s.ip, e.ip, s.n, self),
    rarity(s.region, e.region, s.n, self),
    rarity(s.ua, e.ua, s.n, self),
    hourRare, burst, errs,
  ];
}

// ---------- model + state ----------

const S = { seed: 1, thr: 0.68, trees: 100, attack: false, normal: [], atk: [], base: null, forests: new Map(), points: [] };

function train() {
  S.normal = generate(S.seed);
  S.base = baseline(S.normal);
  const byId = new Map();
  for (const e of S.normal) {
    const s = S.base.get(e.who);
    e.x = features(e, s, 1, s.times);
    if (!byId.has(e.who)) byId.set(e.who, []);
    byId.get(e.who).push(e.x);
  }
  S.forests.clear();
  let k = 0;
  for (const [who, X] of byId) S.forests.set(who, new IsolationForest({ nTrees: S.trees, seed: S.seed * 31 + k++ }).fit(X));
  for (const e of S.normal) e.s = S.forests.get(e.who).score(e.x);
  scoreAttack();
}

function scoreAttack() {
  S.atk = attackEvents();
  const s = S.base.get('svc-reporting');
  const timeline = [...s.times, ...S.atk].sort((a, z) => a.t - z.t);
  for (const e of S.atk) { e.x = features(e, s, 0, timeline); e.s = S.forests.get(e.who).score(e.x); }
}

function all() { return S.attack ? S.normal.concat(S.atk) : S.normal; }

// ---------- rendering ----------

function fmtT(t) {
  const d = Math.floor(t / 1440), m = Math.floor(t % 1440);
  return `${DAYS[d]} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function initTripwire(root) {
  const $ = s => root.querySelector(`[data-out="${s}"]`);
  const canvas = $('plot'), tip = $('tip');
  let geo = null;

  function draw() {
    const { ctx, w, h } = setupCanvas(canvas);
    const ev = all();
    const pad = { l: 38, r: 10, t: 10, b: 22 };
    let lo = Infinity, hi = -Infinity;
    for (const e of ev) { if (e.s < lo) lo = e.s; if (e.s > hi) hi = e.s; }
    lo = Math.min(lo, S.thr) - 0.02; hi = Math.max(hi, S.thr) + 0.02;
    const X = t => pad.l + (t / WEEK) * (w - pad.l - pad.r);
    const Y = s => pad.t + (1 - (s - lo) / (hi - lo)) * (h - pad.t - pad.b);
    geo = { X, Y };

    const ink = css('--ink'), muted = css('--muted'), rule = css('--rule'), acc = css('--accent'), dot = css('--dot');
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.fillStyle = muted; ctx.strokeStyle = rule; ctx.lineWidth = 1;
    for (let d = 0; d <= 7; d++) {
      const x = Math.round(X(d * 1440)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b); ctx.stroke();
      if (d < 7) ctx.fillText(DAYS[d], x + 4, h - 7);
    }
    for (let v = Math.ceil(lo * 10) / 10; v <= hi; v += 0.1) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.fillText(v.toFixed(1), 4, y + 4);
    }

    for (const e of S.normal) {
      const x = X(e.t), y = Y(e.s);
      if (e.s >= S.thr) {
        ctx.strokeStyle = acc; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.stroke();
      } else {
        ctx.fillStyle = dot; ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    // threshold
    ctx.strokeStyle = acc; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    const ty = Math.round(Y(S.thr)) + 0.5;
    ctx.beginPath(); ctx.moveTo(pad.l, ty); ctx.lineTo(w - pad.r, ty); ctx.stroke(); ctx.setLineDash([]);
    const lbl = `threshold ${S.thr.toFixed(3)}`, lw = ctx.measureText(lbl).width + 8;
    ctx.fillStyle = css('--bg'); ctx.fillRect(w - pad.r - lw, ty + 3, lw, 15);
    ctx.fillStyle = acc; ctx.fillText(lbl, w - pad.r - lw + 4, ty + 14);

    if (S.attack) {
      for (const e of S.atk) {
        const x = X(e.t), y = Y(e.s);
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.closePath();
        if (e.s >= S.thr) { ctx.fillStyle = acc; ctx.fill(); }
        else { ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
    }
  }

  function stats() {
    const fp = S.normal.filter(e => e.s >= S.thr).length;
    const caught = S.atk.filter(e => e.s >= S.thr).length;
    const box = $('stats');
    box.replaceChildren(
      stat(String(all().length), 'events scored'),
      stat(String(fp + (S.attack ? caught : 0)), 'flagged'),
      stat(S.attack ? `${caught}/9` : 'n/a', 'attack calls caught', S.attack ? (caught === 9 ? 'good' : 'bad') : ''),
      stat(String(fp), 'false positives'),
      stat(fmtPct(fp / S.normal.length, 2), 'false positive rate', fp / S.normal.length < 0.003 ? 'good' : 'bad'),
    );
  }
  function stat(v, label, cls = '') { return el('div', { class: cls }, [el('b', {}, v), el('span', {}, label)]); }

  function groups() {
    const g = new Map();
    for (const e of all()) {
      if (e.s < S.thr) continue;
      const k = `${e.who}|${e.ip}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(e);
    }
    return [...g.values()].map(evs => {
      evs.sort((a, z) => a.t - z.t);
      const techs = [...new Set(evs.map(e => MITRE[e.api]).filter(Boolean))];
      const sevHit = techs.some(t => SEVERE.has(t));
      const s = S.base.get(evs[0].who);
      const newIp = !s.ip.has(evs[0].ip) || s.ip.get(evs[0].ip) <= 1;
      const sev = sevHit || (evs.length >= 5 && newIp) ? 'HIGH' : evs.length >= 3 || newIp ? 'MEDIUM' : 'LOW';
      const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 }[sev] * 1000 + evs.length;
      return { evs, techs, sev, newIp, rank };
    }).sort((a, z) => z.rank - a.rank);
  }

  function alert() {
    const out = $('alert');
    const gs = groups();
    if (!gs.length) { out.textContent = 'Nothing above the threshold. Quiet week.'; return; }
    const g = gs[0], e0 = g.evs[0], eN = g.evs[g.evs.length - 1];
    const s = S.base.get(e0.who);
    const id = IDS.find(i => i.name === e0.who);
    const regions = [...new Set(g.evs.map(e => e.region))];
    const newRegions = regions.filter(r => !s.region.has(r));
    const newUa = !s.ua.has(e0.ua);
    const denied = g.evs.filter(e => e.err).length;
    const lines = [];
    lines.push(`tripwire  #sec-alerts`);
    lines.push(`<span class="sev">${g.sev}</span>  ${g.sev === 'HIGH' ? 'likely stolen credentials' : 'unusual activity'}: ${e0.who}`);
    lines.push(`source ${e0.ip}${g.newIp ? ' (first time seen for this identity)' : ''}`);
    lines.push(`${g.evs.length} call${g.evs.length > 1 ? 's' : ''}, ${fmtT(e0.t)} to ${Math.floor(e0.t / 1440) === Math.floor(eN.t / 1440) ? fmtT(eN.t).slice(4) : fmtT(eN.t)} CT, ${regions.join(', ')}${newRegions.length ? ' (new: ' + newRegions.join(', ') + ')' : ''}`);
    if (newUa) lines.push(`user agent never seen before: ${e0.ua}`);
    if (g.techs.length) {
      lines.push('');
      const seen = new Set();
      for (const e of g.evs) {
        const t = MITRE[e.api];
        if (!t || seen.has(e.api)) continue;
        seen.add(e.api);
        lines.push(`${t.padEnd(10)} ${e.api}${e.err ? '  (denied)' : ''}`);
      }
    }
    if (denied) lines.push(`${denied} call${denied > 1 ? 's' : ''} returned AccessDenied`);
    lines.push('');
    if (g.sev !== 'HIGH') lines.push(`suggested: check with the owner of ${e0.who} before acting`);
    else lines.push(id.key ? `rotate now: ${id.key} (${e0.who})` : `role, no long lived key: revoke active sessions for ${e0.who}`);
    if (gs.length > 1) lines.push(`${gs.length - 1} other group${gs.length > 2 ? 's' : ''} flagged this week, highest is ${gs[1].sev}`);
    out.innerHTML = lines.map(l => l.replace(/&(?!amp;)/g, '&amp;')).join('\n');
  }

  function table() {
    const rows = all().filter(e => e.s >= S.thr).sort((a, z) => z.s - a.s).slice(0, 14);
    const t = $('events');
    t.replaceChildren(
      el('thead', {}, el('tr', {}, ['score', 'truth', 'time', 'identity', 'api', 'ip'].map(h => el('th', {}, h)))),
      el('tbody', {}, rows.length ? rows.map(e => el('tr', { class: e.atk ? 'atk' : '' }, [
        e.s.toFixed(3), e.atk ? 'attack' : 'normal', fmtT(e.t), e.who, e.api, e.ip,
      ].map(v => el('td', {}, v)))) : el('tr', {}, el('td', { colspan: 6 }, 'nothing flagged'))),
    );
  }

  function render() { draw(); stats(); alert(); table(); }

  // hover
  canvas.addEventListener('mousemove', ev => {
    if (!geo) return;
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    let best = null, bd = 64;
    for (const e of all()) {
      const dx = geo.X(e.t) - mx, dy = geo.Y(e.s) - my, d = dx * dx + dy * dy;
      if (d < bd || (e.atk && d < bd * 1.5)) { bd = d; best = e; }
    }
    if (!best) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.textContent = `${best.atk ? 'ATTACK' : 'normal'}  score ${best.s.toFixed(3)}\n${fmtT(best.t)}  ${best.who}\n${best.api}  ${best.region}\n${best.ip}${best.err ? '  AccessDenied' : ''}`;
    const tx = Math.min(mx + 12, r.width - tip.offsetWidth - 4);
    tip.style.left = `${Math.max(4, tx)}px`;
    tip.style.top = `${Math.max(4, my - tip.offsetHeight - 8)}px`;
  });
  canvas.addEventListener('mouseleave', () => { tip.hidden = true; });

  // controls
  const thr = root.querySelector('[data-ctl="thr"]');
  thr.addEventListener('input', () => { S.thr = +thr.value; $('thr').textContent = S.thr.toFixed(3); render(); });
  const trees = root.querySelector('[data-ctl="trees"]');
  trees.addEventListener('change', () => { S.trees = +trees.value; train(); render(); });
  trees.addEventListener('input', () => { $('trees').textContent = trees.value; });
  const atkBtn = root.querySelector('[data-act="attack"]');
  atkBtn.addEventListener('click', () => {
    S.attack = !S.attack;
    atkBtn.classList.toggle('on', S.attack);
    atkBtn.textContent = S.attack ? 'remove attack' : 'inject stolen key';
    render();
  });
  root.querySelector('[data-act="regen"]').addEventListener('click', () => { S.seed++; train(); render(); });

  new ResizeObserver(() => draw()).observe(canvas);
  document.addEventListener('themechange', draw);
  train();
  render();
}
Object.assign(window.AT, { initTripwire });
})();
