const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;

$('#ppgDate').value = today;
$('#ppgRefresh').addEventListener('click', load);
$('#ppgDate').addEventListener('change', load);
$('#ppgDecisionFilter').addEventListener('change', render);

function kickoff(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Kickoff TBA' : date.toLocaleString([], { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function formChips(form = []) {
  return form.map(value => `<span class="form-${String(value).toLowerCase()}">${esc(value)}</span>`).join('') || '<span>—</span>';
}

async function load() {
  const date = $('#ppgDate').value || today;
  $('#ppgGrid').innerHTML = '<div class="route-empty"><h3>Analysing venue PPG…</h3><p>This page loads the last five home and away matches and caches the result.</p></div>';
  try {
    const response = await fetch(`/api/ppg-route-board?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
    $('#ppgFixtures').textContent = payload.summary?.fixtures || 0;
    $('#ppgAnalysed').textContent = payload.summary?.analysed || 0;
    $('#ppgFire').textContent = payload.summary?.fire || 0;
    $('#ppgSafer').textContent = payload.summary?.safer || 0;
    render();
  } catch {
    payload = null;
    $('#ppgGrid').innerHTML = '<div class="route-empty"><h3>PPG analysis is temporarily unavailable</h3><p>Check the match-data connection and try again.</p></div>';
  }
}

function render() {
  if (!payload) return;
  const filter = $('#ppgDecisionFilter').value;
  const rows = (payload.qualified || []).filter(item => filter === 'ALL' || item.engine?.decision === filter);
  if (!rows.length) {
    $('#ppgGrid').innerHTML = `<div class="route-empty"><h3>No qualifying PPG picks</h3><p>${esc(payload.warning || 'The fixtures fall outside the locked PPG routes, lack a five-match split, or the required market is unavailable.')}</p></div>`;
    return;
  }
  $('#ppgGrid').innerHTML = rows.map(item => {
    const fixture = item.fixture || {};
    const engine = item.engine || {};
    const selection = engine.selection || {};
    const route = (engine.routes || []).find(candidate => candidate.id === selection.routeId) || {};
    return `<article class="route-pick-card ppg-pick-card">
      <div class="route-pick-head">
        <div><h2>${esc(fixture.home?.name)} vs ${esc(fixture.away?.name)}</h2><p>${esc(fixture.league?.country || 'International')} · ${esc(fixture.league?.name || 'League')} · ${esc(kickoff(fixture.kickoff))}</p></div>
        <span class="decision-pill ${String(selection.decision || '').toLowerCase()}">${esc(selection.decision === 'SAFER' ? 'SAFER' : 'FIRE')}</span>
      </div>
      <div class="ppg-card-values">
        <div><small>HOME PPG</small><strong>${Number(engine.home?.ppg || 0).toFixed(2)}</strong><span>${engine.home?.points || 0}/${engine.home?.maximumPoints || 15} pts</span><em>${formChips(engine.home?.form)}</em></div>
        <b>VS</b>
        <div><small>AWAY PPG</small><strong>${Number(engine.away?.ppg || 0).toFixed(2)}</strong><span>${engine.away?.points || 0}/${engine.away?.maximumPoints || 15} pts</span><em>${formChips(engine.away?.form)}</em></div>
      </div>
      <div class="route-market"><b>${esc(selection.label || selection.market)}</b><strong>${odd(selection.odds)}</strong></div>
      <p class="muted">${esc(engine.explanation || '')}</p>
      <div class="route-card-checks">${(route.checks || []).map(check => `<span class="${check.pass ? 'pass' : 'fail'}">${check.pass ? '✓' : '×'} ${esc(check.label)} · ${esc(check.actual)}</span>`).join('')}</div>
    </article>`;
  }).join('');
}

load();
