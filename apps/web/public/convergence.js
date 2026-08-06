const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;

$('#convergenceDate').value = today;
$('#convergenceRefresh').addEventListener('click', load);
$('#convergenceDate').addEventListener('change', load);
$('#convergenceDecisionFilter').addEventListener('change', render);

function kickoff(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Kickoff TBA' : date.toLocaleString([], { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

async function load() {
  const date = $('#convergenceDate').value || today;
  $('#convergenceGrid').innerHTML = '<div class="route-empty"><h3>Analysing all real fixtures…</h3><p>Every non-SRL match is checked. Attack, defence, venue and market evidence are cached after analysis.</p></div>';
  try {
    const response = await fetch(`/api/convergence-route-board?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
    $('#convFixtures').textContent = payload.summary?.fixtures || 0;
    $('#convAnalysed').textContent = payload.summary?.analysed || 0;
    $('#convFire').textContent = payload.summary?.fire || 0;
    $('#convSafer').textContent = payload.summary?.safer || 0;
    render();
  } catch {
    payload = null;
    $('#convergenceGrid').innerHTML = '<div class="route-empty"><h3>Convergence analysis is temporarily unavailable</h3><p>Check the match-data connection and retry.</p></div>';
  }
}

function render() {
  if (!payload) return;
  const filter = $('#convergenceDecisionFilter').value;
  const rows = (payload.qualified || []).filter(item => filter === 'ALL' || item.engine?.decision === filter);
  if (!rows.length) {
    $('#convergenceGrid').innerHTML = `<div class="route-empty"><h3>No qualifying convergence picks</h3><p>${esc(payload.warning || 'No market received enough agreement across attack, defence, venue and market evidence.')}</p></div>`;
    return;
  }
  $('#convergenceGrid').innerHTML = rows.map(item => {
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
