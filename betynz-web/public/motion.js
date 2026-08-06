const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const revealSelector = [
  '.kpis article', '.picks-kpis article', '.consensus-stage', '.qualified-stage',
  '.matches-panel', '.match-row', '.spotlight-pick', '.insight-panel', '.performance-cards article',
  '.route-card', '.ppg-match-card', '.convergence-card', '.consensus-pick-card', '.feature-list > *',
  '.analysis-grid > article', '.venue-card', '.data-table', '.calibration-card', '.audit-fixture'
].join(',');

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
window.addEventListener('DOMContentLoaded', () => {
  activatePage();
  bindParallax();
  bindPageTransitions();
  scheduleLightning();
});
