const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;
let pollTimer = null;
let requestVersion = 0;
let pollCount = 0;

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
    if (!response.ok) { const error = new Error(data.message || `HTTP ${response.status}`); error.status = response.status; error.transient = [502,503,504].includes(response.status); throw error; }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function schedulePoll(date, version) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (version === requestVersion && ($('#ppgDate').value || today) === date) load({ silent: true });
  }, payload?.providerQueue?.coolingDown ? 5000 : (pollCount++ < 16 ? 1500 : 4000));
}

async function load({ silent = false } = {}) {
  const date = $('#ppgDate').value || today;
  const version = ++requestVersion;
  clearTimeout(pollTimer);
  if (!silent) {
    pollCount = 0;
    $('#ppgGrid').innerHTML = '<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>Starting venue PPG analysis…</h3><p>The page will update automatically while team histories are processed.</p></div>';
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
    if (error?.transient || error?.name === 'AbortError') {
      const grid = document.querySelector('[id$="Grid"]');
      if (grid) grid.innerHTML = '<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>Analysis service is recovering…</h3><p>A temporary gateway delay was detected. Your analysis will retry automatically without losing completed picks.</p></div>';
      schedulePoll(date, version);
      return;
    }
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
      const queue = payload.providerQueue || progress.providerQueue || {};
      const cooling = Boolean(queue.coolingDown || progress.stage === 'RATE_LIMIT_COOLDOWN');
      const seconds = Math.max(1, Math.ceil(Number(queue.retryInMs || 0) / 1000));
      const title = cooling ? 'Provider cooldown active…' : 'Analysing venue PPG…';
      const detail = cooling
        ? `API-Football reached the subscription minute limit. PPG will resume automatically${Number(queue.retryInMs) > 0 ? ` in about ${seconds}s` : ''}. ${Number(progress.processed || 0)} fixtures are already complete.`
        : `${Number(progress.processed || payload.summary?.analysed || 0)} of ${Number(progress.total || payload.summary?.fixtures || 0)} fixtures processed. This page updates automatically.`;
      $('#ppgGrid').innerHTML = `<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;
      return;
    }
    $('#ppgGrid').innerHTML = `<div class="route-empty"><h3>No qualifying PPG picks</h3><p>${esc(payload.warning || 'The fixtures fall outside the locked PPG routes, lack a five-match split, or the required market is unavailable.')}</p></div>`;
    return;
  }
  const queue = payload.providerQueue || payload.progress?.providerQueue || {};
  const progressLabel = queue.coolingDown
    ? `Provider cooldown · ${Number(payload.progress?.processed || 0)}/${Number(payload.progress?.total || 0)} completed`
    : `Venue analysis continues in the background · ${Number(payload.progress?.processed || payload.summary?.analysed || 0)}/${Number(payload.progress?.total || payload.summary?.fixtures || 0)}`;
  const progressBanner = !payload.complete ? `<div class="route-progress apex-progress-glow">${esc(progressLabel)}</div>` : '';
  $('#ppgGrid').innerHTML = progressBanner + rows.map((item, index) => {
    const fixture = item.fixture || {};
    const engine = item.engine || {};
    const selection = engine.selection || {};
    const route = (engine.routes || []).find(candidate => candidate.id === selection.routeId) || {};
    return `<article class="route-pick-card ppg-pick-card apex-soft-reveal" style="--reveal-index:${index}">
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
