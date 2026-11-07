window.AT = window.AT || {};
(() => {
const { el } = window.AT;
// Simplified sample catalog. Not the official ULM catalog.
// id: [name, credits, prereqs, offered ('FS' both, 'F' fall only, 'S' spring only)]
const CORE = {
  ENG1: ['English Comp I', 3, [], 'FS'],
  ENG2: ['English Comp II', 3, ['ENG1'], 'FS'],
  CAL1: ['Calculus I', 4, [], 'FS'],
  CAL2: ['Calculus II', 4, ['CAL1'], 'FS'],
  DISC: ['Discrete Structures', 3, ['CAL1'], 'FS'],
  CS1: ['Programming I', 3, [], 'FS'],
  CS2: ['Programming II', 3, ['CS1'], 'FS'],
  DS: ['Data Structures', 3, ['CS2', 'DISC'], 'FS'],
  ORG: ['Computer Organization', 3, ['CS2'], 'FS'],
  ARCH: ['Computer Architecture', 3, ['ORG'], 'F'],
  OS: ['Operating Systems', 3, ['DS', 'ARCH'], 'S'],
  ALG: ['Algorithms', 3, ['DS', 'DISC'], 'F'],
  DB: ['Database Management', 3, ['DS'], 'FS'],
  SE: ['Software Engineering', 3, ['DS'], 'FS'],
  STAT: ['Mathematical Statistics', 3, ['CAL2'], 'FS'],
  TOC: ['Theory of Computation', 3, ['ALG'], 'S'],
  CAP1: ['Capstone I', 3, ['SE', 'DB'], 'F'],
  CAP2: ['Capstone II', 3, ['CAP1'], 'S'],
  SCI1: ['Physics I', 4, ['CAL1'], 'FS'],
  SCI2: ['Physics II', 4, ['SCI1', 'CAL2'], 'FS'],
  HIST: ['History', 3, [], 'FS'],
  HUM: ['Humanities', 3, [], 'FS'],
  ART: ['Fine Arts', 3, [], 'FS'],
  SOC: ['Social Science', 3, [], 'FS'],
  COMM: ['Public Speaking', 3, [], 'FS'],
  ELEC1: ['Free Elective', 3, [], 'FS'],
  ELEC2: ['Free Elective', 3, [], 'FS'],
};

const TRACKS = {
  swe: {
    WEB: ['Web Development', 3, ['DS'], 'FS'],
    NET: ['Computer Networks', 3, ['OS'], 'F'],
    CLD: ['Cloud Computing', 3, ['OS', 'DB'], 'S'],
    MOB: ['Mobile Apps', 3, ['SE'], 'S'],
    PL: ['Programming Languages', 3, ['ALG'], 'S'],
  },
  ml: {
    LA: ['Linear Algebra', 3, ['CAL2'], 'FS'],
    ML: ['Machine Learning', 3, ['STAT', 'LA', 'DS'], 'S'],
    DM: ['Data Mining', 3, ['DB', 'STAT'], 'F'],
    DL: ['Deep Learning', 3, ['ML'], 'F'],
    VIZ: ['Data Visualization', 3, ['DS'], 'FS'],
  },
  sec: {
    NET: ['Computer Networks', 3, ['OS'], 'F'],
    SEC: ['Computer Security', 3, ['NET'], 'S'],
    CRY: ['Cryptography', 3, ['DISC', 'ALG'], 'S'],
    FOR: ['Digital Forensics', 3, ['SEC'], 'F'],
    CLD: ['Cloud Computing', 3, ['OS', 'DB'], 'S'],
  },
};

function catalog(track) {
  const all = { ...CORE, ...TRACKS[track] };
  const c = {};
  for (const [id, [name, cr, pre, off]] of Object.entries(all)) c[id] = { id, name, cr, pre, off };
  return c;
}

// Kahn's algorithm. Returns an order or the nodes stuck in a cycle.
function topo(c) {
  const indeg = {}, out = {};
  for (const id in c) { indeg[id] = 0; out[id] = []; }
  for (const id in c) for (const p of c[id].pre) { if (c[p]) { indeg[id]++; out[p].push(id); } }
  const q = Object.keys(c).filter(id => indeg[id] === 0), order = [];
  while (q.length) {
    const u = q.shift(); order.push(u);
    for (const v of out[u]) if (--indeg[v] === 0) q.push(v);
  }
  return order.length === Object.keys(c).length ? { order, out } : { cycle: Object.keys(c).filter(id => indeg[id] > 0), out };
}

// List scheduling. Priority = length (in terms) of the longest chain still hanging off a course,
// so things like Programming I go first and gen eds fill the gaps.
function plan(c, done, cap, start) {
  const t = topo(c);
  if (t.cycle) return { cycle: t.cycle };
  const height = {};
  for (const id of [...t.order].reverse()) height[id] = 1 + Math.max(0, ...t.out[id].map(v => height[v]));
  const finished = new Map(); // id -> term index (-1 = already done)
  for (const id of done) if (c[id]) finished.set(id, -1);
  const left = new Set(Object.keys(c).filter(id => !finished.has(id)));
  const terms = [];
  let season = start;
  for (let i = 0; left.size && i < 16; i++) {
    const avail = [...left].filter(id =>
      c[id].off.includes(season) && c[id].pre.every(p => !c[p] || (finished.has(p) && finished.get(p) < i)));
    avail.sort((a, b) => height[b] - height[a] || (c[a].off.length - c[b].off.length) || c[b].cr - c[a].cr || a.localeCompare(b));
    const pick = []; let cr = 0;
    for (const id of avail) {
      if (cr + c[id].cr > cap) continue;
      pick.push(id); cr += c[id].cr;
    }
    for (const id of pick) { finished.set(id, i); left.delete(id); }
    terms.push({ season, ids: pick, cr });
    season = season === 'F' ? 'S' : 'F';
  }
  const remaining = [...left].filter(id => !done.has(id));
  const lower = Math.max(0, ...[...left, ...terms.flatMap(x => x.ids)].map(id => height[id]));
  return { terms, height, lower, stuck: remaining };
}

function initHawkPlan(root) {
  const $ = s => root.querySelector(`[data-out="${s}"]`);
  const ctl = s => root.querySelector(`[data-ctl="${s}"]`);
  const done = new Set();
  let c = null, res = null;

  function dependents(id) {
    const outs = new Set(), stack = [id];
    while (stack.length) {
      const u = stack.pop();
      for (const v in c) if (c[v].pre.includes(u) && !outs.has(v)) { outs.add(v); stack.push(v); }
    }
    return outs;
  }
  function ancestors(id) {
    const ins = new Set(), stack = [id];
    while (stack.length) for (const p of c[stack.pop()].pre) if (c[p] && !ins.has(p)) { ins.add(p); stack.push(p); }
    return ins;
  }

  function highlight(id) {
    const pre = id ? ancestors(id) : new Set(), post = id ? dependents(id) : new Set();
    for (const b of root.querySelectorAll('.course')) {
      b.classList.toggle('hl-self', b.dataset.id === id);
      b.classList.toggle('hl-pre', pre.has(b.dataset.id));
      b.classList.toggle('hl-post', post.has(b.dataset.id));
    }
  }

  function chip(id, isDone) {
    const k = c[id];
    const tag = k.off === 'FS' ? '' : ` ${k.off}`;
    const b = el('button', { class: `course${isDone ? ' done' : ''}`, 'data-id': id, type: 'button',
      title: `${k.name}, ${k.cr} cr${k.pre.length ? '. needs ' + k.pre.map(p => c[p].name).join(', ') : ''}. Unlocks ${dependents(id).size} later course(s).` },
    [el('small', {}, `${k.cr}${tag}`), k.name]);
    b.addEventListener('click', () => { done.has(id) ? done.delete(id) : done.add(id); run(); });
    b.addEventListener('mouseenter', () => highlight(id));
    b.addEventListener('mouseleave', () => highlight(null));
    b.addEventListener('focus', () => highlight(id));
    b.addEventListener('blur', () => highlight(null));
    return b;
  }

  function run() {
    c = catalog(ctl('track').value);
    for (const id of [...done]) if (!c[id]) done.delete(id);
    const cap = +ctl('cap').value;
    res = plan(c, done, cap, ctl('start').value);
    const out = $('plan');
    if (res.cycle) { out.replaceChildren(el('p', { class: 'plan-err' }, `prerequisite cycle: ${res.cycle.join(' -> ')}`)); return; }

    const cols = [];
    if (done.size) {
      cols.push(el('div', { class: 'term term-done' }, [
        el('div', { class: 'term-h' }, ['done', el('span', {}, `${[...done].reduce((s, id) => s + c[id].cr, 0)} cr`)]),
        ...[...done].sort().map(id => chip(id, true)),
      ]));
    }
    let year = 1;
    res.terms.forEach((t, i) => {
      if (i > 0 && t.season === ctl('start').value) year++;
      cols.push(el('div', { class: 'term' }, [
        el('div', { class: 'term-h' }, [`${t.season === 'F' ? 'Fall' : 'Spring'} ${year}`, el('span', {}, `${t.cr} cr`)]),
        ...t.ids.map(id => chip(id, false)),
      ]));
    });
    out.replaceChildren(...cols);

    const totalCr = Object.values(c).reduce((s, k) => s + k.cr, 0);
    const leftCr = res.terms.reduce((s, t) => s + t.cr, 0);
    const box = $('stats');
    const mk = (v, l, cls = '') => el('div', { class: cls }, [el('b', {}, v), el('span', {}, l)]);
    box.replaceChildren(
      mk(String(res.terms.length), 'semesters left', res.terms.length > res.lower ? '' : 'good'),
      mk(String(res.lower), 'lower bound (longest chain)'),
      mk(`${leftCr}/${totalCr}`, 'credits to go'),
      mk(String(Object.keys(c).length), 'courses in graph'),
      mk(String(Object.values(c).reduce((s, k) => s + k.pre.length, 0)), 'prereq edges'),
    );
  }

  for (const k of ['track', 'start', 'cap']) {
    ctl(k).addEventListener('input', () => { if (k === 'cap') $('cap').textContent = ctl('cap').value; run(); });
  }
  root.querySelector('[data-act="reset"]').addEventListener('click', () => { done.clear(); run(); });
  run();
}
Object.assign(window.AT, { topo, plan, initHawkPlan });
})();
