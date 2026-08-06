const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const revealSelector = [
  '.kpis article', '.picks-kpis article', '.consensus-stage', '.qualified-stage',
  '.matches-panel', '.match-row', '.spotlight-pick', '.insight-panel', '.performance-cards article',
  '.route-card', '.ppg-match-card', '.convergence-card', '.consensus-pick-card', '.feature-list > *',
  '.analysis-grid > article', '.venue-card', '.data-table', '.calibration-card', '.audit-fixture',
  '.win-carousel', '.board-aware-empty', '.home-consensus-section'
].join(',');


const SPLASH_KEY = 'betynz:pwa-splash:5.0.4';

function splashAlreadySeen() {
  try { return sessionStorage.getItem(SPLASH_KEY) === '1'; } catch { return false; }
}

function markSplashSeen() {
  try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch {}
}

function showLaunchSplash() {
  if (reduced || splashAlreadySeen() || location.pathname.startsWith('/admin-')) return;
  const splash = document.createElement('div');
  splash.className = 'pwa-launch-splash';
  splash.setAttribute('aria-hidden', 'true');
  splash.innerHTML = `<div class="pwa-splash-noise"></div><div class="pwa-splash-bolt"></div><div class="pwa-splash-core"><img src="/assets/betynz-mark.png" alt=""><strong>BETYNZ<span>.com</span></strong><small>THREE ENGINES · ONE SHARED DIRECTION</small><i></i></div>`;
  document.body.appendChild(splash);
  requestAnimationFrame(() => splash.classList.add('is-visible'));
  const started = performance.now();
  const dismiss = () => {
    const wait = Math.max(0, 1150 - (performance.now() - started));
    setTimeout(() => {
      splash.classList.add('is-leaving');
      markSplashSeen();
      setTimeout(() => splash.remove(), 650);
    }, wait);
  };
  if (document.readyState === 'complete') dismiss();
  else window.addEventListener('load', dismiss, { once: true });
  setTimeout(dismiss, 3200);
}

function bindMetricAnimations() {
  const targets = [...document.querySelectorAll('.kpis strong,.picks-kpis strong,.performance-cards strong')];
  if (!targets.length || reduced) return;
  const observer = new MutationObserver(entries => {
    for (const entry of entries) {
      const node = entry.target;
      node.classList.remove('metric-pop');
      void node.offsetWidth;
      node.classList.add('metric-pop');
    }
  });
  targets.forEach(node => observer.observe(node, { childList: true, characterData: true, subtree: true }));
}

function bindCardTilt() {
  if (reduced || !finePointer) return;
  document.addEventListener('pointermove', event => {
    const card = event.target.closest('.kpis article,.spotlight-pick,.consensus-pick-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    card.style.setProperty('--tilt-x', `${(-y * 2.5).toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${(x * 3).toFixed(2)}deg`);
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    const card = event.target.closest('.kpis article,.spotlight-pick,.consensus-pick-card');
    if (!card || card.contains(event.relatedTarget)) return;
    card.style.removeProperty('--tilt-x');
    card.style.removeProperty('--tilt-y');
  });
}

function markRevealTargets(root = document) {
  const nodes = [...root.querySelectorAll(revealSelector)];
  nodes.forEach((node, index) => {
    if (node.dataset.motionBound) return;
    node.dataset.motionBound = 'true';
    node.style.setProperty('--reveal-delay', `${Math.min(index % 10, 8) * 55}ms`);
    node.classList.add('motion-reveal');
    if (reduced) node.classList.add('motion-visible');
    else observer.observe(node);
  });
}

const observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('motion-visible');
    observer.unobserve(entry.target);
  }
}, { threshold: 0.08, rootMargin: '80px 0px -20px' });

function activatePage() {
  document.body.classList.add('motion-ready');
  requestAnimationFrame(() => document.body.classList.add('page-entered'));
  markRevealTargets();
}

function bindParallax() {
  if (reduced || !finePointer) return;
  let frame = null;
  window.addEventListener('pointermove', event => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const x = event.clientX / Math.max(1, window.innerWidth) - 0.5;
      const y = event.clientY / Math.max(1, window.innerHeight) - 0.5;
      document.documentElement.style.setProperty('--pointer-x', x.toFixed(3));
      document.documentElement.style.setProperty('--pointer-y', y.toFixed(3));
    });
  }, { passive: true });
}

function bindPageTransitions() {
  if (reduced) return;
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname && url.hash) return;
    document.body.classList.add('page-leaving');
  });
}

function triggerLightning() {
  if (reduced) return;
  document.body.classList.remove('lightning-strike');
  void document.body.offsetWidth;
  document.body.classList.add('lightning-strike');
  setTimeout(() => document.body.classList.remove('lightning-strike'), 900);
}

function scheduleLightning() {
  if (reduced) return;
  const delay = 7000 + Math.random() * 9000;
  setTimeout(() => { triggerLightning(); scheduleLightning(); }, delay);
}

window.addEventListener('betynz:content-rendered', () => requestAnimationFrame(() => markRevealTargets()));
showLaunchSplash();
window.addEventListener('DOMContentLoaded', () => {
  activatePage();
  bindParallax();
  bindPageTransitions();
  bindMetricAnimations();
  bindCardTilt();
  scheduleLightning();
});
