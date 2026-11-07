window.AT = window.AT || {};
(() => {
// Small architecture diagrams, generated as SVG from a spec so they stay crisp and themeable.
// node: [id, label, x, y, kind]  kind: 'hot' = the part I wrote, 'ext' = AWS / third party
const SPECS = {
  tripwire: {
    w: 560, h: 230,
    nodes: [
      ['ct', 'CloudTrail', 20, 30, 'ext'], ['eb', 'EventBridge', 20, 110, 'ext'],
      ['fn', 'Lambda scorer', 190, 110, 'hot'],
      ['dd', 'DynamoDB baselines', 190, 30, 'ext'], ['s3', 'S3 models (JSON)', 190, 190, 'ext'],
      ['grp', 'group + ATT&CK', 420, 110, 'hot'], ['br', 'Bedrock', 420, 30, 'ext'], ['sl', 'Slack', 420, 190, 'ext'],
    ],
    edges: [['ct', 'eb'], ['eb', 'fn'], ['dd', 'fn'], ['s3', 'fn'], ['fn', 'grp'], ['grp', 'br'], ['grp', 'sl']],
  },
  hawkplan: {
    w: 560, h: 230,
    nodes: [
      ['pdf', 'catalog PDF', 20, 30, 'ext'], ['parse', 'Python parser', 20, 110, 'hot'],
      ['pg', 'Postgres + pgvector', 200, 110, 'ext'],
      ['topo', 'topo sort planner', 400, 30, 'hot'], ['rag', 'RAG w/ citations', 400, 190, 'hot'],
      ['ui', 'Next.js', 400, 110, 'hot'],
    ],
    edges: [['pdf', 'parse'], ['parse', 'pg'], ['pg', 'topo'], ['pg', 'rag'], ['topo', 'ui'], ['rag', 'ui']],
  },
  relay: {
    w: 560, h: 230,
    nodes: [
      ['app', 'client app', 20, 110, 'ext'], ['gw', 'Relay: token bucket', 180, 110, 'hot'],
      ['rc', 'Redis cache 0.95', 180, 30, 'ext'], ['cb', 'circuit breaker', 380, 110, 'hot'],
      ['pa', 'provider A', 380, 30, 'ext'], ['pb', 'provider B', 380, 190, 'ext'], ['k6', 'k6 + 503s', 20, 190, 'hot'],
    ],
    edges: [['app', 'gw'], ['gw', 'rc'], ['gw', 'cb'], ['cb', 'pa'], ['cb', 'pb'], ['k6', 'gw']],
  },
  satya: {
    w: 560, h: 230,
    nodes: [
      ['feed', 'news feed', 20, 30, 'ext'], ['ext', 'Chrome ext: batch', 20, 110, 'hot'],
      ['api', 'FastAPI on ECS', 220, 110, 'hot'], ['onnx', 'ONNX int8', 420, 110, 'hot'],
      ['ft', 'fine tune + eval', 400, 190, 'hot'], ['ds', 'LIAR, FakeNewsNet', 220, 190, 'ext'],
    ],
    edges: [['feed', 'ext'], ['ext', 'api'], ['api', 'onnx'], ['ds', 'ft'], ['ft', 'onnx']],
  },
};

const NS = 'http://www.w3.org/2000/svg';
const CH = 7.9; // ~width of one 11px mono glyph

function mk(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function renderDiagram(host) {
  const spec = SPECS[host.dataset.diagram];
  if (!spec) return;
  const svg = mk('svg', { viewBox: `0 0 ${spec.w} ${spec.h}`, role: 'img', 'aria-label': `Architecture of ${host.dataset.diagram}` });
  const marker = mk('marker', { id: `arr-${host.dataset.diagram}`, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(mk('path', { d: 'M0,0 L8,4 L0,8 z', class: 'd-head' }));
  const defs = mk('defs', {}); defs.append(marker); svg.append(defs);

  const box = {};
  for (const [id, label, x, y, kind] of spec.nodes) {
    const w = Math.max(70, label.length * CH + 20);
    box[id] = { x, y, w, h: 30, kind, label };
  }
  const edgeG = mk('g', {}), nodeG = mk('g', {});
  for (const [a, b] of spec.edges) {
    const A = box[a], B = box[b];
    const ac = [A.x + A.w / 2, A.y + 15], bc = [B.x + B.w / 2, B.y + 15];
    // leave from the side facing the target, orthogonal elbow
    let d;
    if (Math.abs(A.y - B.y) < 5) d = `M${A.x + A.w},${ac[1]} H${B.x - 2}`;
    else if (Math.abs(ac[0] - bc[0]) < 40) d = `M${ac[0]},${A.y < B.y ? A.y + 30 : A.y} V${A.y < B.y ? B.y - 2 : B.y + 32}`;
    else {
      const sx = bc[0] > ac[0] ? A.x + A.w : A.x, ex = bc[0] > ac[0] ? B.x - 2 : B.x + B.w + 2;
      const mid = (sx + ex) / 2;
      d = `M${sx},${ac[1]} H${mid} V${bc[1]} H${ex}`;
    }
    edgeG.append(mk('path', { d, class: 'd-edge', 'marker-end': `url(#arr-${host.dataset.diagram})`, pathLength: 1 }));
  }
  for (const id in box) {
    const b = box[id];
    const g = mk('g', { class: `d-node d-${b.kind}` });
    g.append(mk('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 3 }));
    const t = mk('text', { x: b.x + 10, y: b.y + 19 }); t.textContent = b.label;
    g.append(t);
    nodeG.append(g);
  }
  svg.append(edgeG, nodeG);
  host.replaceChildren(svg);
  new IntersectionObserver(([e], ob) => { if (e.isIntersecting) { host.classList.add('drawn'); ob.disconnect(); } }, { threshold: 0.4 }).observe(host);
}

Object.assign(window.AT, { renderDiagram });
})();
