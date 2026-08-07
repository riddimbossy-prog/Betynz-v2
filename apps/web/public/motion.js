const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const SPLASH_KEY = 'betynz:pwa-splash:5.0.14';

function splashAlreadySeen() {
  try { return sessionStorage.getItem(SPLASH_KEY) === '1'; } catch { return false; }
}

function markSplashSeen() {
  try { sessionStorage.setItem(SPLASH_KEY, '1'); } catch {}
}

function showLaunchSplash() {
  // Keep the ordinary website instant. The branded splash is reserved for the
  // installed PWA and appears only once per session.
  if (reduced || !standalone || splashAlreadySeen() || location.pathname.startsWith('/admin-')) return;
  const splash = document.createElement('div');
  splash.className = 'pwa-launch-splash is-visible';
  splash.setAttribute('aria-hidden', 'true');
  splash.innerHTML = `<div class="pwa-splash-bolt"></div><div class="pwa-splash-core"><img src="/assets/betynz-mark.png" alt=""><strong>BETYNZ<span>.com</span></strong><small>SEVEN ENGINES · ONE SHARED DIRECTION</small><i></i></div>`;
  document.body.appendChild(splash);
  const dismiss = () => {
    splash.classList.add('is-leaving');
    markSplashSeen();
    setTimeout(() => splash.remove(), 260);
  };
  setTimeout(dismiss, 720);
}

// The match board intentionally has no reveal, tilt, parallax, lightning or
// looping panel animations. Content changes are immediate and predictable.
document.documentElement.classList.add('minimal-board-motion');
showLaunchSplash();
