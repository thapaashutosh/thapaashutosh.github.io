(() => {
const AT = window.AT || {};
const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
const motion = hasGsap && !reduce;
const EMAIL = 'ashutoshthapa11@outlook.com';
if (hasGsap) gsap.registerPlugin(ScrollTrigger);

// ---------- theme ----------
function isDark() {
  return root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function toggleTheme() {
  root.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
  document.dispatchEvent(new Event('themechange'));
}
$('#theme-toggle').addEventListener('click', toggleTheme);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => document.dispatchEvent(new Event('themechange')));

// ---------- toast, copy, clocks ----------
const toastEl = $('#toast');
let toastT;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 1800);
}
async function copyEmail() {
  try { await navigator.clipboard.writeText(EMAIL); toast('Email copied'); }
  catch (e) { toast(EMAIL); }
}
$('#copy-email').addEventListener('click', copyEmail);
function tick() {
  const t = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
  $('#clock').textContent = t; $('#clock2').textContent = `${t} CT`;
}
tick(); setInterval(tick, 20000);

// ---------- text roll: each letter slides up, a copy slides in from below ----------
function letters(text) {
  return [...text].map((ch, i) => `<i style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</i>`).join('');
}
function setRoll(el, text) {
  if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', text);
  el.innerHTML = `<span class="roll" aria-hidden="true"><span class="roll-a">${letters(text)}</span><span class="roll-b">${letters(text)}</span></span>`;
}
$$('[data-roll]').forEach(el => setRoll(el, el.textContent.trim()));

// ---------- split words for heading reveals ----------
$$('[data-split]').forEach(el => {
  el.innerHTML = el.textContent.trim().split(/\s+/).map(w => `<span class="w"><span>${w}</span></span>`).join(' ');
});

// ---------- kinetic name: letters stretch toward the cursor (variable font width axis) ----------
const kChars = [];
$$('.k-line').forEach(line => {
  line.innerHTML = [...line.textContent.trim()].map(ch => `<span class="k-ch">${ch}</span>`).join('');
  kChars.push(...line.children);
});
let kMouse = null, kIdleAt = 0, kRaf = 0, heroVisible = true;
function kineticFrame(now) {
  const useMouse = kMouse && now - kIdleAt < 2500;
  kChars.forEach((ch, i) => {
    let t;
    if (useMouse) {
      const r = ch.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - kMouse[0], (r.top + r.height / 2 - kMouse[1]) * 1.6);
      t = Math.max(0, 1 - d / 340);
    } else {
      t = (Math.sin(now / 900 - i * 0.55) + 1) / 2 * 0.55;  // slow wave when nobody is pointing
    }
    ch.style.fontVariationSettings = `"wdth" ${(78 + t * 72).toFixed(1)}, "wght" ${(640 + t * 260).toFixed(0)}`;
    ch.classList.toggle('lit', useMouse && t > 0.72);
  });
  if (heroVisible && !reduce) kRaf = requestAnimationFrame(kineticFrame);
}
if (!reduce) {
  window.addEventListener('pointermove', e => { kMouse = [e.clientX, e.clientY]; kIdleAt = performance.now(); }, { passive: true });
  new IntersectionObserver(([e]) => {
    heroVisible = e.isIntersecting;
    cancelAnimationFrame(kRaf);
    if (heroVisible) kRaf = requestAnimationFrame(kineticFrame);
  }).observe($('#kinetic'));
}

// ---------- rotating phrase ----------
const rotBox = $('#rot'), rot = $$('#rot > span');
let rotI = 0;
rot[0].classList.add('on');
const sizeRot = () => { rotBox.style.width = `${rot[rotI].offsetWidth}px`; };
sizeRot();
window.addEventListener('resize', sizeRot);
if (document.fonts) document.fonts.ready.then(sizeRot);
if (!reduce) setInterval(() => {
  const prev = rot[rotI];
  rotI = (rotI + 1) % rot.length;
  prev.classList.remove('on'); prev.classList.add('out');
  rot[rotI].classList.add('on');
  sizeRot();
  // park the old phrase below again without animating it back through the visible line
  setTimeout(() => {
    prev.style.transition = 'none';
    prev.classList.remove('out');
    void prev.offsetWidth;
    prev.style.transition = '';
  }, 750);
}, 2600);

// ---------- smooth scroll ----------
let lenis = null;
if (window.Lenis && !reduce) {
  lenis = new Lenis({ lerp: 0.1 });
  if (hasGsap) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}
function scrollToHash(hash) {
  const target = hash === '#top' ? 0 : $(hash);
  if (target === null) return;
  if (lenis) lenis.scrollTo(target, { offset: hash === '#top' ? 0 : -70, duration: 1.3 });
  else if (target === 0) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const hash = a.getAttribute('href');
  if (hash.length < 2) return;
  e.preventDefault();
  closeMenu();
  if (a.dataset.tab) selectTab(a.dataset.tab, true);
  scrollToHash(hash);
  history.replaceState(null, '', hash);
});

// ---------- nav: hide on scroll down, progress bar, active section indicator ----------
const nav = $('#nav'), bar = $('#progress');
let lastY = window.scrollY;
function onScroll() {
  const y = window.scrollY;
  nav.classList.toggle('hide', y > lastY && y > 240 && !menuOpen);
  lastY = y;
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
}
window.addEventListener('scroll', onScroll, { passive: true });

const navLinks = $$('.nav-links a'), ind = $('.nav-ind');
let activeLink = null;
function moveInd(a) {
  if (!a) { ind.style.opacity = 0; return; }
  ind.style.opacity = 1;
  ind.style.width = `${a.offsetWidth - 24}px`;
  ind.style.transform = `translateX(${a.offsetLeft + 12}px)`;
}
navLinks.forEach(a => {
  a.addEventListener('mouseenter', () => moveInd(a));
  a.addEventListener('mouseleave', () => moveInd(activeLink));
});
const sectionToLink = { work: '#work', lab: '#lab', path: '#path', contact: '#contact' };
const spy = new IntersectionObserver(entries => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    activeLink = navLinks.find(a => a.getAttribute('href') === sectionToLink[en.target.id]) || null;
    navLinks.forEach(a => a.classList.toggle('on', a === activeLink));
    moveInd(activeLink);
  }
}, { rootMargin: '-45% 0px -50% 0px' });
['top', 'work', 'lab', 'path', 'contact'].forEach(id => spy.observe(document.getElementById(id)));

// ---------- mobile menu ----------
const menu = $('#menu'), burger = $('#burger');
let menuOpen = false;
function openMenu() {
  menuOpen = true;
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.add('open'));
  document.body.classList.add('menu-open');
  burger.setAttribute('aria-expanded', 'true');
  burger.setAttribute('aria-label', 'Close menu');
  if (lenis) lenis.stop();
}
function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menu.classList.remove('open');
  document.body.classList.remove('menu-open');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Open menu');
  if (lenis) lenis.start();
  setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 800);
}
burger.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));

// ---------- cursor ----------
if (fine && !reduce) {
  const cur = $('#cursor'), label = $('#cursor-label');
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
  cur.classList.add('on');
  window.addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; }, { passive: true });
  document.addEventListener('pointerover', e => {
    const tagged = e.target.closest('[data-cursor]');
    const interactive = e.target.closest('a, button, input, select, label, [role="tab"], .course, .chip');
    if (interactive && !(tagged && tagged === interactive)) {
      cur.classList.add('hover'); cur.classList.remove('label');
    } else if (tagged) {
      label.textContent = tagged.dataset.cursor;
      cur.classList.add('label'); cur.classList.remove('hover');
    } else {
      cur.classList.remove('hover', 'label');
    }
  });
  document.addEventListener('pointerdown', () => cur.classList.add('down'));
  document.addEventListener('pointerup', () => cur.classList.remove('down'));
  document.documentElement.addEventListener('mouseleave', () => { cur.style.opacity = 0; });
  document.documentElement.addEventListener('mouseenter', () => { cur.style.opacity = 1; });
  (function loop() {
    cx += (x - cx) * 0.2; cy += (y - cy) * 0.2;
    cur.style.translate = `${cx}px ${cy}px`;
    requestAnimationFrame(loop);
  })();
}

// ---------- magnetic buttons ----------
if (fine && !reduce) {
  $$('.magnetic').forEach(b => {
    b.addEventListener('pointermove', e => {
      const r = b.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      b.style.transition = 'transform .2s ease-out, background-color .3s, color .3s, border-color .3s';
      b.style.transform = `translate(${dx * 0.22}px, ${dy * 0.32}px)`;
    });
    b.addEventListener('pointerleave', () => {
      b.style.transition = 'transform .7s cubic-bezier(.16,1,.3,1), background-color .3s, color .3s, border-color .3s';
      b.style.transform = '';
    });
  });
}

// ---------- diagram tilt ----------
$$('[data-diagram]').forEach(d => {
  if (AT.renderDiagram) AT.renderDiagram(d);
  if (!fine || reduce) return;
  d.addEventListener('pointermove', e => {
    const r = d.getBoundingClientRect();
    d.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 12}deg`);
    d.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 9}deg`);
  });
  d.addEventListener('pointerleave', () => { d.style.setProperty('--rx', '0deg'); d.style.setProperty('--ry', '0deg'); });
});

// ---------- hero 3D ----------
if (AT.initCloud) {
  try { AT.initCloud($('#cloud'), $('#cloud-hud')); } catch (e) { console.error(e); }
}

// ---------- lab tabs ----------
const DEMOS = { tripwire: 'initTripwire', hawkplan: 'initHawkPlan', relay: 'initRelay' };
const started = new Set();
const tabs = $$('.tabs [role="tab"]'), tabInd = $('.tab-ind');
function startDemo(name) {
  if (started.has(name)) return;
  started.add(name);
  const panel = $(`#demo-${name}`);
  try { AT[DEMOS[name]](panel); }
  catch (err) { console.error(err); panel.insertAdjacentHTML('beforeend', '<p class="fine">This demo failed to load in your browser.</p>'); }
}
function placeTabInd(tab) {
  tabInd.style.width = `${tab.offsetWidth - 22}px`;
  tabInd.style.transform = `translateX(${tab.offsetLeft}px)`;
}
function selectTab(name, focusless) {
  tabs.forEach(t => {
    const on = t.id === `tab-${name}`;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = $(`#${t.getAttribute('aria-controls')}`);
    if (on && panel.hidden) { panel.hidden = false; panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); }
    else if (!on) panel.hidden = true;
    if (on) { placeTabInd(t); if (!focusless) t.focus(); }
  });
  startDemo(name);
  if (hasGsap) ScrollTrigger.refresh();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.id.slice(4), true));
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    selectTab(tabs[(i + d + tabs.length) % tabs.length].id.slice(4));
  });
});
new ResizeObserver(() => placeTabInd(tabs.find(t => t.getAttribute('aria-selected') === 'true'))).observe($('.tabs'));
new IntersectionObserver(([e], ob) => {
  if (!e.isIntersecting) return;
  ob.disconnect();
  startDemo('tripwire');
  if (hasGsap) ScrollTrigger.refresh();
}, { rootMargin: '600px 0px' }).observe($('#lab'));

// ---------- skills, cross linked to projects ----------
const PNAME = { tripwire: 'Tripwire', hawkplan: 'HawkPlan', relay: 'Relay', satya: 'Satya' };
const skillBtns = $$('#skills button'), skillOut = $('#skill-out');
function showSkill(b) {
  const ps = b.dataset.p.split(' ').filter(Boolean);
  skillOut.innerHTML = ps.length
    ? `<b>${b.textContent}</b> is in ${ps.map(p => PNAME[p]).join(', ')}`
    : `<b>${b.textContent}</b> is from coursework, not these four projects`;
  skillBtns.forEach(o => o.classList.toggle('sib', o !== b && ps.some(p => o.dataset.p.split(' ').includes(p))));
}
skillBtns.forEach(b => {
  b.addEventListener('pointerenter', () => showSkill(b));
  b.addEventListener('focus', () => showSkill(b));
});
$('#skills').addEventListener('pointerleave', () => skillBtns.forEach(o => o.classList.remove('sib')));

// ---------- scroll driven animation ----------
function fmtCount(el, v) {
  const dec = +(el.dataset.dec || 0);
  return `${el.dataset.prefix || ''}${v.toFixed(dec)}${el.dataset.suffix || ''}`;
}
if (motion) {
  $$('[data-split]').forEach(el => gsap.from(el.querySelectorAll('.w > span'), {
    yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.02,
    scrollTrigger: { trigger: el, start: 'top 88%' },
  }));
  $$('[data-reveal]').forEach(el => {
    if (el.closest('.hero')) return;
    gsap.from(el, { y: 34, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' } });
  });
  $$('[data-count]').forEach(el => {
    const target = parseFloat(el.dataset.count), o = { v: 0 };
    el.textContent = fmtCount(el, 0);
    gsap.to(o, {
      v: target, duration: 1.6, ease: 'power2.out', onUpdate: () => { el.textContent = fmtCount(el, o.v); },
      scrollTrigger: { trigger: el, start: 'top 90%' },
    });
  });
  // cards: each one shrinks a little as the next one slides over it
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px) and (min-height: 701px)', () => {
    const cards = $$('.card');
    cards.forEach((card, i) => {
      if (i === cards.length - 1) return;
      gsap.to(card, {
        scale: 0.94, opacity: 0.55, ease: 'none',
        scrollTrigger: { trigger: cards[i + 1], start: 'top bottom', end: 'top 25%', scrub: true },
      });
    });
  });
  gsap.from('.card', { y: 70, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.1, scrollTrigger: { trigger: '.stack', start: 'top 85%' } });
  ScrollTrigger.create({
    trigger: '.timeline', start: 'top 70%', end: 'bottom 60%', scrub: true,
    onUpdate: s => $('.timeline').style.setProperty('--tl', s.progress.toFixed(3)),
  });
  gsap.to('.hero-copy', { yPercent: -14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero-3d', { yPercent: 10, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.from('.foot-name', { yPercent: 40, ease: 'none', scrollTrigger: { trigger: '.foot', start: 'top bottom', end: 'bottom bottom', scrub: true } });
} else {
  $('.timeline').style.setProperty('--tl', 1);
}

// ---------- loader, then the hero intro ----------
function intro() {
  if (!motion) return;
  gsap.from(kChars, { yPercent: 110, opacity: 0, duration: 1.2, ease: 'power4.out', stagger: 0.035 });
  gsap.from('.hero [data-reveal]', { y: 26, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.09, delay: 0.35 });
  gsap.from('.hero-3d', { opacity: 0, scale: 0.92, duration: 1.6, ease: 'power3.out', delay: 0.15 });
  nav.style.transition = 'none';
  gsap.from(nav, { y: -90, opacity: 0, duration: 1, ease: 'power3.out', delay: 0.3, clearProps: 'transform,opacity', onComplete: () => { nav.style.transition = ''; } });
}
const loader = $('#loader');
const showLoader = !root.classList.contains('seen') && !reduce && getComputedStyle(loader).display !== 'none';
if (showLoader) {
  const n = $('#loader-n'), lb = $('#loader-bar'), step = $('#loader-step');
  const steps = ['loading fonts', 'drawing 1,400 points', 'wiring the demos', 'ready'];
  const t0 = performance.now(), dur = 1300;
  if (lenis) lenis.stop();
  (function count(now) {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    n.textContent = String(Math.round(e * 100)).padStart(3, '0');
    lb.style.width = `${e * 100}%`;
    step.textContent = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))];
    if (p < 1) return requestAnimationFrame(count);
    loader.style.transition = 'transform .95s cubic-bezier(.7,0,.2,1)';
    loader.style.transform = 'translateY(-100%)';
    setTimeout(intro, 280);
    loader.addEventListener('transitionend', () => { loader.style.display = 'none'; if (lenis) lenis.start(); }, { once: true });
    try { sessionStorage.setItem('seen', '1'); } catch (err) {}
  })(t0);
} else {
  loader.style.display = 'none';
  intro();
}

// ---------- command palette ----------
const pal = $('#palette'), input = $('#palette-input'), list = $('#palette-list');
const goLab = name => () => { selectTab(name, true); scrollToHash('#lab'); };
const COMMANDS = [
  ['Go to projects', 'section', () => scrollToHash('#work')],
  ['Run the Tripwire demo', 'demo', goLab('tripwire')],
  ['Run the HawkPlan demo', 'demo', goLab('hawkplan')],
  ['Run the Relay demo', 'demo', goLab('relay')],
  ['Go to path and skills', 'section', () => scrollToHash('#path')],
  ['Go to contact', 'section', () => scrollToHash('#contact')],
  ['Copy email', 'action', copyEmail],
  ['Open resume PDF', 'link', () => window.open('assets/Ashutosh_Thapa_Resume.pdf', '_blank')],
  ['Open GitHub', 'link', () => window.open('https://github.com/thapaashutosh', '_blank', 'noopener')],
  ['Open LinkedIn', 'link', () => window.open('https://linkedin.com/in/ashutoshthapa', '_blank', 'noopener')],
  ['Toggle dark mode', 'action', toggleTheme],
];
let shown = [], sel = 0, lastFocus = null;
function fuzzy(q, s) { let i = 0; for (const ch of s) if (ch === q[i]) i++; return i === q.length; }
function renderList() {
  const q = input.value.toLowerCase().replace(/\s+/g, '');
  shown = COMMANDS.filter(([name]) => fuzzy(q, name.toLowerCase().replace(/\s+/g, '')));
  sel = Math.min(sel, Math.max(0, shown.length - 1));
  list.innerHTML = '';
  shown.forEach(([name, kind], i) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === sel));
    li.innerHTML = `${name}<span>${kind}</span>`;
    li.addEventListener('mousemove', () => { if (sel !== i) { sel = i; renderList(); } });
    li.addEventListener('click', () => run(i));
    list.append(li);
  });
  if (!shown.length) list.innerHTML = '<li aria-disabled="true">Nothing matches<span></span></li>';
}
function openPal() { lastFocus = document.activeElement; pal.hidden = false; input.value = ''; sel = 0; renderList(); input.focus(); if (lenis) lenis.stop(); }
function closePal() { pal.hidden = true; if (lenis && !menuOpen) lenis.start(); if (lastFocus) lastFocus.focus(); }
function run(i) { const c = shown[i]; if (!c) return; closePal(); c[2](); }
$('#palette-open').addEventListener('click', openPal);
pal.addEventListener('click', e => { if (e.target === pal) closePal(); });
input.addEventListener('input', () => { sel = 0; renderList(); });
input.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { sel = (sel + 1) % Math.max(1, shown.length); renderList(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = (sel - 1 + shown.length) % Math.max(1, shown.length); renderList(); e.preventDefault(); }
  else if (e.key === 'Enter') { run(sel); e.preventDefault(); }
  else if (e.key === 'Escape') closePal();
  else if (e.key === 'Tab') e.preventDefault();
});
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? openPal() : closePal(); }
  else if (e.key === 'Escape' && menuOpen) closeMenu();
  else if (typing || !pal.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
  else if (e.key === '/') { e.preventDefault(); openPal(); }
  else if (e.key.toLowerCase() === 't') toggleTheme();
});

onScroll();
})();
