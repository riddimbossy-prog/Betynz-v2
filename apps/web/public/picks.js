const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;
let pollTimer = null;
let requestVersion = 0;
let requestedDays = 1;

function engineName(code) {
  if (code === 'PPG_ROUTE') return 'PPG Route';
  if (code === 'CONVERGENCE_ROUTE') return 'Convergence';
  return 'Market Route';
}
function dayLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (dateString === today) return 'Today';
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (dateString === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function kickoffLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Kickoff TBA';
  return date.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function classificationLabel(code) {
  return ({ ELITE_BANKER:'ELITE BANKER', CONSENSUS_BANKER:'CONSENSUS BANKER', QUALIFIED_PICK:'QUALIFIED PICK', SAFER_PICK:'SAFER PICK', CONFLICT:'ENGINE CONFLICT', HOLD_MISSING_SHARED_PRICE:'ON HOLD' })[code] || code;
}
function allRows() { return payload?.consensus?.all || []; }

function populateFilters() {
  const rows = allRows();
  const oldDate = $('#dateFilter').value;
  const oldLeague = $('#leagueFilter').value;
  const dates = [...new Set(rows.map(row => row.date).filter(Boolean))].sort();
  const leagues = [...new Set(rows.map(row => `${row.country} · ${row.league}`))].sort();
  $('#dateFilter').innerHTML = '<option value="ALL">All seven days</option>' + dates.map(date => `<option value="${esc(date)}">${esc(dayLabel(date))}</option>`).join('');
  $('#leagueFilter').innerHTML = '<option value="ALL">All leagues</option>' + leagues.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  if (dates.includes(oldDate)) $('#dateFilter').value = oldDate;
  if (leagues.includes(oldLeague)) $('#leagueFilter').value = oldLeague;
}

function filteredRows() {
  const engine = $('#engineFilter').value;
  const tier = $('#tierFilter').value;
  const date = $('#dateFilter').value;
  const league = $('#leagueFilter').value;
  const query = $('#picksSearch').value.trim().toLowerCase();
  return allRows().filter(row => {
    const engineMatch = engine === 'ALL' || (row.engines || []).includes(engine) || (row.enginePicks || []).some(item => item.engine === engine);
    const tierMatch = tier === 'ALL' || row.classification === tier;
    const dateMatch = date === 'ALL' || row.date === date;
    const leagueMatch = league === 'ALL' || `${row.country} · ${row.league}` === league;
    const text = `${row.home?.name} ${row.away?.name} ${row.final?.label} ${row.agreementDirection} ${(row.enginePicks || []).map(item => item.routeName).join(' ')}`.toLowerCase();
    return engineMatch && tierMatch && dateMatch && leagueMatch && (!query || text.includes(query));
  });
}

function engineChips(row) {
  return (row.enginePicks || []).map(item => `<span class="engine-proof-chip ${item.decision === 'FIRE' ? 'fire' : 'safer'}"><b>${esc(engineName(item.engine))}</b><small>${esc(item.label || item.market)}</small></span>`).join('');
}

function consensusCard(row, compact = false) {
  const cls = String(row.classification || '').toLowerCase().replaceAll('_', '-');
  const status = row.status === 'FROZEN' ? 'FROZEN BEFORE KICKOFF' : `PROVISIONAL · FREEZES ${row.freezeMinutes || 30} MIN BEFORE KICKOFF`;
  return `<article class="consensus-pick-card ${cls} ${compact ? 'compact' : ''}" id="pick-${esc(row.fixtureId)}">
    <div class="consensus-card-top"><span class="consensus-tier">${esc(classificationLabel(row.classification))}</span><span class="freeze-state ${row.status === 'FROZEN' ? 'frozen' : ''}">${esc(status)}</span></div>
    <small>${esc(row.country)} · ${esc(row.league)} · ${esc(dayLabel(row.date))} · ${esc(kickoffLabel(row.kickoff))}</small>
    <h3>${esc(row.home?.name)} <i>vs</i> ${esc(row.away?.name)}</h3>
    ${row.final ? `<div class="official-tip"><span>OFFICIAL TIP</span><strong>${esc(row.final.label || row.final.market)}</strong><b>${odd(row.final.odds)}</b></div>` : ''}
    <div class="agreement-meter"><span style="--agreement:${Math.max(1, Number(row.agreementCount || 0))}"></span><b>${Number(row.agreementCount || 0)}/3 engines agree</b><em>${Number(row.score || 0).toFixed(0)} agreement score</em></div>
    <div class="engine-proof-row">${engineChips(row)}</div>
    ${compact ? '' : `<ul>${(row.reasons || []).slice(0, 3).map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>`}
  </article>`;
}

function conflictCard(row) {
  return `<article class="consensus-pick-card conflict compact">
    <div class="consensus-card-top"><span class="consensus-tier">ENGINE CONFLICT</span><span class="freeze-state">NO BANKER</span></div>
    <small>${esc(row.country)} · ${esc(row.league)} · ${esc(kickoffLabel(row.kickoff))}</small>
    <h3>${esc(row.home?.name)} <i>vs</i> ${esc(row.away?.name)}</h3>
    <div class="conflict-reasons">${(row.conflictReasons || ['Opposing directions qualified.']).map(reason => `<p>× ${esc(reason)}</p>`).join('')}</div>
    <div class="engine-proof-row">${engineChips(row)}</div>
  </article>`;
}

function empty(title, text) { return `<div class="picks-empty"><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; }

function setBoardAwareVisibility({ processing, elite, consensus, qualified, safer, conflicts }) {
  const groups = [
    ['eliteStage', elite, 'eliteCount'],
    ['consensusStage', consensus, 'consensusCount'],
    ['qualifiedStage', qualified, 'singleCount'],
    ['saferStage', safer, 'saferCount'],
    ['conflictStage', conflicts, 'conflictCount']
  ];
  for (const [sectionId, rows, countId] of groups) {
    const section = $(`#${sectionId}`);
    const countCard = $(`#${countId}`)?.closest('article');
    const hide = !processing && rows.length === 0;
    if (section) section.hidden = hide;
    if (countCard) countCard.hidden = hide;
  }
  const nothingVisible = !processing && groups.every(([, rows]) => rows.length === 0);
  const emptyPanel = $('#picksBoardEmpty');
  if (emptyPanel) {
    emptyPanel.hidden = !nothingVisible;
    if (nothingVisible) {
      const title = payload?.failed ? 'Analysis could not be completed' : 'Nothing qualified for this view';
      const text = payload?.failed
        ? (payload.error || 'Refresh analysis to try again.')
        : allRows().length
          ? 'The active filters hide every available pick. Change a filter to bring matching selections back.'
          : 'No engine route qualified for the selected date. Empty categories are hidden automatically.';
      emptyPanel.querySelector('h2').textContent = title;
      emptyPanel.querySelector('p').textContent = text;
    }
  }
  const kpis = document.querySelector('.picks-kpis');
  if (kpis) kpis.hidden = !processing && groups.every(([, rows]) => rows.length === 0);
}

function render() {
  if (!payload) return;
  const rows = filteredRows();
  const elite = rows.filter(row => row.classification === 'ELITE_BANKER');
  const consensus = rows.filter(row => row.classification === 'CONSENSUS_BANKER');
  const qualified = rows.filter(row => row.classification === 'QUALIFIED_PICK');
  const safer = rows.filter(row => row.classification === 'SAFER_PICK');
  const conflicts = rows.filter(row => row.classification === 'CONFLICT');
  const processing = !payload.complete && !payload.failed;
  const progress = payload.progress || {};
  const progressText = `${Number(progress.processed || 0)} of ${Number(progress.total || 0)} ${requestedDays === 1 ? 'fixtures' : 'days'} processed`;

  $('#eliteState').textContent = processing ? 'Checking…' : `${elite.length} shown`;
  $('#consensusState').textContent = processing ? 'Checking…' : `${consensus.length} shown`;
  $('#qualifiedState').textContent = processing ? 'Loading…' : `${qualified.length} shown`;
  $('#saferState').textContent = processing ? 'Loading…' : `${safer.length} shown`;
  $('#conflictState').textContent = processing ? 'Checking…' : `${conflicts.length} shown`;

  const processingEmpty = title => empty(title, `${progressText}. Results update automatically.`);
  const failedEmpty = title => empty(title, payload.error || 'Refresh analysis to try again.');
  const chooseEmpty = (finishedTitle, finishedText, loadingTitle) => payload.failed ? failedEmpty('Analysis could not be completed') : processing ? processingEmpty(loadingTitle) : empty(finishedTitle, finishedText);

  $('#eliteGrid').innerHTML = elite.length ? elite.map(row => consensusCard(row)).join('') : chooseEmpty('No Elite Banker matches this filter', 'Three independent engines must support the same safe direction.', 'Checking 3/3 engine agreement…');
  $('#consensusGrid').innerHTML = consensus.length ? consensus.map(row => consensusCard(row)).join('') : chooseEmpty('No Consensus Banker matches this filter', 'Two independent engines must agree before banker status appears.', 'Checking 2/3 engine agreement…');
  $('#qualifiedList').innerHTML = qualified.length ? qualified.map(row => consensusCard(row, true)).join('') : chooseEmpty('No single-engine qualified picks', 'Complete routes will appear here without being promoted to banker status.', 'Checking complete engine routes…');
  $('#saferList').innerHTML = safer.length ? safer.map(row => consensusCard(row, true)).join('') : chooseEmpty('No safer picks', 'Approved downgrade markets appear here.', 'Checking safer downgrade routes…');
  $('#conflictList').innerHTML = conflicts.length ? conflicts.map(conflictCard).join('') : chooseEmpty('No engine conflicts', 'No opposing qualified directions are visible under this filter.', 'Checking opposing engine directions…');
  setBoardAwareVisibility({ processing, elite, consensus, qualified, safer, conflicts });
  window.dispatchEvent(new CustomEvent('betynz:content-rendered'));
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function schedulePoll(from, days, version) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (version === requestVersion && ($('#picksDate').value || today) === from) load({ silent: true, days });
  }, 4500);
}

async function load({ silent = false, days = 1 } = {}) {
  const from = $('#picksDate').value || today;
  const version = ++requestVersion;
  requestedDays = days;
  clearTimeout(pollTimer);
  if (!silent) {
    for (const id of ['eliteGrid','consensusGrid','qualifiedList','saferList','conflictList']) $(`#${id}`).innerHTML = '<div class="picks-empty">Starting engine analysis…</div>';
  }
  try {
    const data = await fetchJson(`/api/consensus-picks?from=${encodeURIComponent(from)}&days=${days}`);
    if (version !== requestVersion) return;
    payload = data;
    $('#eliteCount').textContent = data.summary?.elite || 0;
    $('#consensusCount').textContent = data.summary?.consensus || 0;
    $('#singleCount').textContent = data.summary?.qualified || 0;
    $('#saferCount').textContent = data.summary?.safer || 0;
    $('#conflictCount').textContent = data.summary?.conflicts || 0;
    populateFilters();
    render();
    if (!data.complete && !data.failed) {
      schedulePoll(from, days, version);
    } else if (data.complete && !data.failed && days === 1) {
      // The selected day is useful first. Expand to the remaining six dates only
      // after it has completed so the initial page is never blocked by a week scan.
      pollTimer = setTimeout(() => {
        if (version === requestVersion && ($('#picksDate').value || today) === from) load({ silent: true, days: 7 });
      }, 300);
    }
  } catch (error) {
    if (version !== requestVersion) return;
    payload = { complete: true, failed: true, error: error?.name === 'AbortError' ? 'The analysis request timed out.' : (error.message || 'Refresh to try again.'), consensus: { all: [] }, summary: {} };
    populateFilters();
    render();
  }
}

$('#picksDate').value = today;
$('#picksRefresh').addEventListener('click', () => load({ days: 1 }));
$('#picksDate').addEventListener('change', () => load({ days: 1 }));
for (const id of ['engineFilter','tierFilter','dateFilter','leagueFilter']) $(`#${id}`).addEventListener('change', render);
$('#picksSearch').addEventListener('input', render);
load({ days: 1 });
