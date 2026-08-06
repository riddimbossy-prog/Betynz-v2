const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;
let pollTimer = null;
let requestVersion = 0;
let pollCount = 0;

$('#convergenceDate').value = today;
$('#convergenceRefresh').addEventListener('click', () => load());
$('#convergenceDate').addEventListener('change', () => load());
$('#convergenceDecisionFilter').addEventListener('change', render);

function kickoff(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Kickoff TBA' : date.toLocaleString([], { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function schedulePoll(date, version) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (version === requestVersion && ($('#convergenceDate').value || today) === date) load({ silent: true });
  }, pollCount++ < 16 ? 1500 : 4000);
}

async function load({ silent = false } = {}) {
  const date = $('#convergenceDate').value || today;
  const version = ++requestVersion;
  clearTimeout(pollTimer);
  if (!silent) $('#convergenceGrid').innerHTML = '<div class="route-empty"><h3>Starting four-block analysis…</h3><p>The page will update automatically while venue histories are processed.</p></div>';
  try {
    const data = await fetchJson(`/api/convergence-route-board?date=${encodeURIComponent(date)}`);
    if (version !== requestVersion) return;
    payload = data;
    $('#convFixtures').textContent = payload.summary?.fixtures || 0;
    $('#convAnalysed').textContent = payload.summary?.analysed || 0;
    $('#convFire').textContent = payload.summary?.fire || 0;
    $('#convSafer').textContent = payload.summary?.safer || 0;
    render();
    if (!payload.complete && !payload.failed) schedulePoll(date, version);
  } catch (error) {
    if (version !== requestVersion) return;
    payload = null;
    const message = error?.name === 'AbortError' ? 'The server did not respond in time.' : (error.message || 'Check the match-data connection and retry.');
    $('#convergenceGrid').innerHTML = `<div class="route-empty"><h3>Convergence analysis could not be completed</h3><p>${esc(message)}</p></div>`;
  }
}

function render() {
  if (!payload) return;
  const filter = $('#convergenceDecisionFilter').value;
  const rows = (payload.qualified || []).filter(item => filter === 'ALL' || item.engine?.decision === filter);
  if (!rows.length) {
    if (payload.failed) {
      $('#convergenceGrid').innerHTML = `<div class="route-empty"><h3>Convergence analysis failed</h3><p>${esc(payload.error || 'Refresh to try again.')}</p></div>`;
      return;
    }
    if (!payload.complete) {
      const progress = payload.progress || {};
      $('#convergenceGrid').innerHTML = `<div class="route-empty"><h3>Building convergence evidence…</h3><p>${Number(progress.processed || payload.summary?.analysed || 0)} of ${Number(progress.total || payload.summary?.fixtures || 0)} fixtures processed. This page updates automatically.</p></div>`;
      return;
    }
    $('#convergenceGrid').innerHTML = `<div class="route-empty"><h3>No qualifying convergence picks</h3><p>${esc(payload.warning || 'No market received enough agreement across attack, defence, venue and market evidence.')}</p></div>`;
    return;
  }
  const progressBanner = !payload.complete ? `<div class="route-progress">Four-block analysis continues · ${Number(payload.progress?.processed || payload.summary?.analysed || 0)}/${Number(payload.progress?.total || payload.summary?.fixtures || 0)}</div>` : '';
  $('#convergenceGrid').innerHTML = progressBanner + rows.map(item => {
    const fixture = item.fixture || {};
    const engine = item.engine || {};
    const selection = engine.selection || {};
    const candidate = (engine.candidates || []).find(row => row.id === selection.routeId) || {};
    return `<article class="route-pick-card convergence-pick-card">
      <div class="route-pick-head">
        <div><h2>${esc(fixture.home?.name)} vs ${esc(fixture.away?.name)}</h2><p>${esc(fixture.league?.country || 'International')} · ${esc(fixture.league?.name || 'League')} · ${esc(kickoff(fixture.kickoff))}</p></div>
        <span class="decision-pill ${String(selection.decision || '').toLowerCase()}">${esc(selection.decision || 'FIRE')}</span>
      </div>
      <div class="route-market"><b>${esc(selection.label || selection.market)}</b><strong>${odd(selection.odds)}</strong></div>
      <div class="conv-card-blocks">${(candidate.blocks || []).map(block => `<div><small>${esc(block.name)}</small><b>${Number(block.score || 0).toFixed(0)}/25</b></div>`).join('')}</div>
      <p class="muted">${esc(engine.explanation || '')}</p>
      <div class="route-card-checks">${(candidate.blockers || []).map(reason => `<span class="fail">× ${esc(reason)}</span>`).join('') || `<span class="pass">✓ ${Number(selection.score || candidate.score || 0).toFixed(0)}% total convergence</span>`}</div>
    </article>`;
  }).join('');
}

load();
