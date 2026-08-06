const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;
let pollTimer = null;
let requestVersion = 0;

$('#ppgDate').value = today;
$('#ppgRefresh').addEventListener('click', () => load());
$('#ppgDate').addEventListener('change', () => load());
$('#ppgDecisionFilter').addEventListener('change', render);

function kickoff(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Kickoff TBA' : date.toLocaleString([], { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function formChips(form = []) {
  return form.map(value => `<span class="form-${String(value).toLowerCase()}">${esc(value)}</span>`).join('') || '<span>—</span>';
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function schedulePoll(date, version) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (version === requestVersion && ($('#ppgDate').value || today) === date) load({ silent: true });
  }, 4000);
}

async function load({ silent = false } = {}) {
  const date = $('#ppgDate').value || today;
  const version = ++requestVersion;
  clearTimeout(pollTimer);
  if (!silent) {
    $('#ppgGrid').innerHTML = '<div class="route-empty"><h3>Starting venue PPG analysis…</h3><p>The page will update automatically while team histories are processed.</p></div>';
  }
  try {
    const data = await fetchJson(`/api/ppg-route-board?date=${encodeURIComponent(date)}`);
    if (version !== requestVersion) return;
    payload = data;
    $('#ppgFixtures').textContent = payload.summary?.fixtures || 0;
    $('#ppgAnalysed').textContent = payload.summary?.analysed || 0;
    $('#ppgFire').textContent = payload.summary?.fire || 0;
    $('#ppgSafer').textContent = payload.summary?.safer || 0;
    render();
    if (!payload.complete && !payload.failed) schedulePoll(date, version);
  } catch (error) {
    if (version !== requestVersion) return;
    payload = null;
    const message = error?.name === 'AbortError' ? 'The server did not respond in time.' : (error.message || 'Check the match-data connection and try again.');
    $('#ppgGrid').innerHTML = `<div class="route-empty"><h3>PPG analysis could not be completed</h3><p>${esc(message)}</p></div>`;
  }
}

function render() {
  if (!payload) return;
  const filter = $('#ppgDecisionFilter').value;
  const rows = (payload.qualified || []).filter(item => filter === 'ALL' || item.engine?.decision === filter);
  if (!rows.length) {
    if (payload.failed) {
      $('#ppgGrid').innerHTML = `<div class="route-empty"><h3>PPG analysis failed</h3><p>${esc(payload.error || 'Refresh to try again.')}</p></div>`;
      return;
    }
    if (!payload.complete) {
      const progress = payload.progress || {};
      $('#ppgGrid').innerHTML = `<div class="route-empty"><h3>Analysing venue PPG…</h3><p>${Number(progress.processed || payload.summary?.analysed || 0)} of ${Number(progress.total || payload.summary?.fixtures || 0)} fixtures processed. This page updates automatically.</p></div>`;
      return;
    }
    $('#ppgGrid').innerHTML = `<div class="route-empty"><h3>No qualifying PPG picks</h3><p>${esc(payload.warning || 'The fixtures fall outside the locked PPG routes, lack a five-match split, or the required market is unavailable.')}</p></div>`;
    return;
  }
  const progressBanner = !payload.complete ? `<div class="route-progress">Venue analysis continues in the background · ${Number(payload.progress?.processed || payload.summary?.analysed || 0)}/${Number(payload.progress?.total || payload.summary?.fixtures || 0)}</div>` : '';
  $('#ppgGrid').innerHTML = progressBanner + rows.map(item => {
    const fixture = item.fixture || {};
    const engine = item.engine || {};
    const selection = engine.selection || {};
    const route = (engine.routes || []).find(candidate => candidate.id === selection.routeId) || {};
    return `<article class="route-pick-card ppg-pick-card">
      <div class="route-pick-head">
        <div><h2>${esc(fixture.home?.name)} vs ${esc(fixture.away?.name)}</h2><p>${esc(fixture.league?.country || 'International')} · ${esc(fixture.league?.name || 'League')} · ${esc(kickoff(fixture.kickoff))}</p></div>
        <span class="decision-pill ${String(selection.decision || '').toLowerCase()}">${esc(selection.decision || engine.decision || 'FIRE')}</span>
      </div>
      <div class="route-market"><b>${esc(selection.label || selection.market)}</b><strong>${odd(selection.odds)}</strong></div>
      <div class="ppg-split-grid">
        <div><small>Home · last 5 home</small><strong>${Number(item.venueForm?.home?.ppg || 0).toFixed(2)} PPG</strong><div class="form-chips">${formChips(item.venueForm?.home?.form)}</div></div>
        <div><small>Away · last 5 away</small><strong>${Number(item.venueForm?.away?.ppg || 0).toFixed(2)} PPG</strong><div class="form-chips">${formChips(item.venueForm?.away?.form)}</div></div>
      </div>
      <p class="muted">${esc(engine.explanation || route.note || '')}</p>
    </article>`;
  }).join('');
}

load();
