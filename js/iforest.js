window.AT = window.AT || {};
(() => {
// Isolation Forest (Liu, Ting, Zhou 2008), no dependencies.
// Anomalies get isolated in fewer random splits, so a short average path = high score.

function rng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EULER = 0.5772156649;

// average path length of an unsuccessful BST search over n points
function c(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + EULER) - (2 * (n - 1)) / n;
}

function buildTree(X, idx, depth, limit, rand) {
  if (depth >= limit || idx.length <= 1) return { size: idx.length };
  const d = X[0].length;

  // only split on features that actually vary in this node
  const feats = [];
  const mins = new Array(d), maxs = new Array(d);
  for (let f = 0; f < d; f++) {
    let lo = Infinity, hi = -Infinity;
    for (const i of idx) { const v = X[i][f]; if (v < lo) lo = v; if (v > hi) hi = v; }
    mins[f] = lo; maxs[f] = hi;
    if (hi > lo) feats.push(f);
  }
  if (!feats.length) return { size: idx.length };

  const f = feats[Math.floor(rand() * feats.length)];
  const split = mins[f] + rand() * (maxs[f] - mins[f]);
  const left = [], right = [];
  for (const i of idx) (X[i][f] < split ? left : right).push(i);
  return {
    f, split,
    l: buildTree(X, left, depth + 1, limit, rand),
    r: buildTree(X, right, depth + 1, limit, rand),
  };
}

function pathLength(x, node, depth) {
  while (node.size === undefined) {
    node = x[node.f] < node.split ? node.l : node.r;
    depth++;
  }
  return depth + c(node.size);
}

class IsolationForest {
  constructor({ nTrees = 100, sampleSize = 256, seed = 7 } = {}) {
    this.nTrees = nTrees;
    this.sampleSize = sampleSize;
    this.seed = seed;
    this.trees = [];
  }

  fit(X) {
    const rand = rng(this.seed);
    const psi = Math.min(this.sampleSize, X.length);
    const limit = Math.ceil(Math.log2(Math.max(psi, 2)));
    this.psi = psi;
    this.trees = [];
    const all = X.map((_, i) => i);
    for (let t = 0; t < this.nTrees; t++) {
      // partial Fisher-Yates: sample psi without replacement
      for (let i = 0; i < psi; i++) {
        const j = i + Math.floor(rand() * (all.length - i));
        [all[i], all[j]] = [all[j], all[i]];
      }
      this.trees.push(buildTree(X, all.slice(0, psi), 0, limit, rand));
    }
    return this;
  }

  // s(x) = 2^(-E[h(x)] / c(psi)), in (0, 1]. ~0.5 is normal, close to 1 is anomalous.
  score(x) {
    let sum = 0;
    for (const t of this.trees) sum += pathLength(x, t, 0);
    return Math.pow(2, -(sum / this.trees.length) / c(this.psi));
  }
}
Object.assign(window.AT, { rng, c, IsolationForest });
})();
