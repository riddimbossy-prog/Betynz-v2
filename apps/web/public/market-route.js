const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;
let pollTimer = null;
let requestVersion = 0;
let pollCount = 0;

$('#routeDate').value = today;
$('#routeRefresh').addEventListener('click', () => load());
$('#routeDate').addEventListener('change', () => load());
$('#routeDecisionFilter').addEventListener('change', render);

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.message || `HTTP ${response.status}`); error.status = response.status; error.transient = [502,503,504].includes(response.status); throw error; }
    return data;
  } finally { clearTimeout(timer); }
}

function schedulePoll(date, version) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (version === requestVersion && ($('#routeDate').value || today) === date) load({ silent: true });
  }, pollCount++ < 16 ? 1500 : 4000);
}

async function load({ silent = false } = {}) {
  const date = $('#routeDate').value || today;
  const version = ++requestVersion;
  clearTimeout(pollTimer);
  if (!silent) { pollCount = 0; $('#routeGrid').innerHTML = '<div class="route-empty">Loading market routes…</div>'; }
  try {
    const data = await fetchJson(`/api/market-route-board?date=${encodeURIComponent(date)}`);
    if (version !== requestVersion) return;
    payload = data;
    $('#routeFixtures').textContent = payload.summary?.fixtures || 0;
    $('#routeFire').textContent = payload.summary?.fire || 0;
    $('#routeSafer').textContent = payload.summary?.safer || 0;
    $('#routeNoSignal').textContent = payload.summary?.noSignal || 0;
    render();
    if (!payload.complete && !payload.failed) schedulePoll(date, version);
  } catch (error) {
    if (version !== requestVersion) return;
    if (error?.transient || error?.name === 'AbortError') {
      const grid = document.querySelector('[id$="Grid"]');
      if (grid) grid.innerHTML = '<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>Analysis service is recovering…</h3><p>A temporary gateway delay was detected. Your analysis will retry automatically without losing completed picks.</p></div>';
      schedulePoll(date, version);
      return;
    }
    payload = null;
    const message = error?.name === 'AbortError' ? 'The market-route request timed out.' : (error.message || 'Refresh to retry.');
    $('#routeGrid').innerHTML = `<div class="route-empty"><h3>Market routes are temporarily unavailable</h3><p>${esc(message)}</p></div>`;
  }
}

function render() {
  if (!payload) return;
  const filter = $('#routeDecisionFilter').value;
  const rows = (payload.qualified || []).filter(item => filter === 'ALL' || item.engine?.decision === filter);
  if (!rows.length) {
    if (payload.failed) {
      $('#routeGrid').innerHTML = `<div class="route-empty"><h3>Market Route analysis failed</h3><p>${esc(payload.error || 'Refresh to try again.')}</p></div>`;
      return;
    }
    if (!payload.complete) {
      const progress = payload.progress || {};
      $('#routeGrid').innerHTML = `<div class="route-empty"><h3>Odds routes are ready; statistics are being checked…</h3><p>${Number(progress.processed || 0)} of ${Number(progress.total || payload.summary?.fixtures || 0)} fixtures statistically verified. This page updates automatically.</p></div>`;
      return;
    }
    $('#routeGrid').innerHTML = '<div class="route-empty">No qualifying route for this filter.</div>';
    return;
  }
  const progressBanner = !payload.complete ? `<div class="route-progress">Early odds routes shown · statistical contradiction checks continue ${Number(payload.progress?.processed || 0)}/${Number(payload.progress?.total || payload.summary?.fixtures || 0)}</div>` : '';
  $('#routeGrid').innerHTML = progressBanner + rows.map(item => {
    const fixture = item.fixture || {};
    const engine = item.engine || {};
    const selection = engine.selection || {};
    const candidate = (engine.candidates || []).find(row => row.id === selection.routeId);
    return `<article class="route-pick-card">
      <div class="route-pick-head"><div><h2>${esc(fixture.home?.name)} vs ${esc(fixture.away?.name)}</h2><p>${esc(fixture.league?.country || 'International')} · ${esc(fixture.league?.name || 'League')} · ${new Date(fixture.kickoff).toLocaleString([], { weekday:'short', hour:'2-digit', minute:'2-digit' })}</p></div><span class="decision-pill ${String(selection.decision || '').toLowerCase()}">${esc(selection.decision || engine.decision)}</span></div>
      <div class="route-market"><b>${esc(selection.label || selection.market)}</b><strong>${odd(selection.odds)}</strong></div>
      <p class="muted">${esc(engine.explanation || '')}</p>
      <div class="route-card-checks">${(candidate?.checks || []).map(check => `<span class="${check.pass ? 'pass' : 'fail'}">${check.pass ? '✓' : '×'} ${esc(check.label)} · ${esc(check.actual)}</span>`).join('')}</div>
    </article>`;
  }).join('');
}

load();
