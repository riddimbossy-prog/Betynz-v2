const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;

$('#routeDate').value = today;
$('#routeRefresh').addEventListener('click', load);
$('#routeDate').addEventListener('change', load);
$('#routeDecisionFilter').addEventListener('change', render);

async function load() {
  const date = $('#routeDate').value || today;
  $('#routeGrid').innerHTML = '<div class="route-empty">Loading market routes…</div>';
  try {
    const response = await fetch(`/api/market-route-board?date=${encodeURIComponent(date)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
    $('#routeFixtures').textContent = payload.summary?.fixtures || 0;
    $('#routeFire').textContent = payload.summary?.fire || 0;
    $('#routeSafer').textContent = payload.summary?.safer || 0;
    $('#routeNoSignal').textContent = payload.summary?.noSignal || 0;
    render();
  } catch {
    payload = null;
    $('#routeGrid').innerHTML = '<div class="route-empty">Market routes are temporarily unavailable.</div>';
  }
}

function render() {
  if (!payload) return;
  const filter = $('#routeDecisionFilter').value;
  const rows = (payload.qualified || []).filter(item => filter === 'ALL' || item.engine?.decision === filter);
  if (!rows.length) {
    $('#routeGrid').innerHTML = '<div class="route-empty">No qualifying route for this filter.</div>';
    return;
  }
  $('#routeGrid').innerHTML = rows.map(item => {
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
