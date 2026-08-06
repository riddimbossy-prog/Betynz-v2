const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const MARKET_LABELS = {
  homeWin: 'Home Win', draw: 'Draw', awayWin: 'Away Win',
  doubleChance1X: 'Double Chance 1X', doubleChance12: 'Double Chance 12', doubleChanceX2: 'Double Chance X2',
  over05: 'Over 0.5', under05: 'Under 0.5', over15: 'Over 1.5', under15: 'Under 1.5',
  over25: 'Over 2.5', under25: 'Under 2.5', over35: 'Over 3.5', under35: 'Under 3.5',
  bttsYes: 'BTTS Yes', bttsNo: 'BTTS No',
  homeOver05: 'Home Team Over 0.5', homeUnder05: 'Home Team Under 0.5',
  homeOver15: 'Home Team Over 1.5', homeUnder15: 'Home Team Under 1.5',
  awayOver05: 'Away Team Over 0.5', awayUnder05: 'Away Team Under 0.5',
  awayOver15: 'Away Team Over 1.5', awayUnder15: 'Away Team Under 1.5',
  firstHalfOver05: '1H Over 0.5', firstHalfUnder05: '1H Under 0.5',
  firstHalfOver15: '1H Over 1.5', firstHalfUnder15: '1H Under 1.5'
};

const state = {
  selectedDate: new Date().toISOString().slice(0, 10),
  fixtures: [],
  filtered: [],
  selected: null,
  limit: window.innerWidth <= 560 ? 12 : window.innerWidth <= 1000 ? 20 : 30,
  routeByFixture: new Map(),
  ppgByFixture: new Map(),
  convergenceByFixture: new Map(),
  consensusByFixture: new Map(),
  visualByFixture: new Map(),
  requestToken: 0
};

const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const isLive = fixture => /LIVE|1H|2H|HT|INPLAY/.test(String(fixture?.status || '').toUpperCase());
const isSettled = fixture => /FT|AET|PEN|FINISHED|ENDED|COMPLETED/.test(String(fixture?.status || '').toUpperCase());
const validOdd = value => Number(value) > 1;

function dateOffset(offset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function dateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const today = dateOffset(0);
  const tomorrow = dateOffset(1);
  return {
    top: dateString === today ? 'Today' : dateString === tomorrow ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }),
    bottom: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  };
}

function kickoffTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBA';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fixtureStatus(fixture) {
  if (isLive(fixture)) return 'LIVE';
  if (isSettled(fixture)) return 'SETTLED';
  if (/POSTPONED|PST/.test(String(fixture?.status || '').toUpperCase())) return 'POSTPONED';
  return [fixture?.odds?.homeWin, fixture?.odds?.draw, fixture?.odds?.awayWin].some(validOdd) ? 'UPCOMING' : 'WAITING';
}

function buildWeekStrip() {
  const strip = $('#weekStrip');
  strip.innerHTML = '';
  for (let i = 0; i < 7; i += 1) {
    const date = dateOffset(i);
    const label = dateLabel(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.date = date;
    button.className = date === state.selectedDate ? 'active' : '';
    button.innerHTML = `<span>${esc(label.top)}</span><b>${esc(label.bottom)}</b><small>— matches</small>`;
    button.addEventListener('click', () => loadDate(date));
    strip.appendChild(button);
  }
}

function updateWeekCount(date, count) {
  const button = $(`#weekStrip button[data-date="${CSS.escape(date)}"]`);
  if (!button) return;
  button.querySelector('small').textContent = Number.isFinite(Number(count)) ? `${Number(count)} matches` : 'Unavailable';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(payload?.message || `HTTP ${response.status}`);
    error.code = payload?.error || `HTTP_${response.status}`;
    throw error;
  }
  return payload;
}

function setHomeSpotlightMessage(message, detail = '') {
  for (const id of ['homeEliteGrid', 'homeConsensusGrid', 'homeEarlyGrid']) {
    const grid = $(`#${id}`);
    if (grid) grid.innerHTML = `<div class="spotlight-empty"><b>${esc(message)}</b><span>${esc(detail)}</span></div>`;
  }
}

async function loadDate(date, force = false) {
  state.selectedDate = date;
  state.limit = window.innerWidth <= 560 ? 12 : window.innerWidth <= 1000 ? 20 : 30;
  state.fixtures = [];
  state.filtered = [];
  state.routeByFixture = new Map();
  state.ppgByFixture = new Map();
  state.convergenceByFixture = new Map();
  state.consensusByFixture = new Map();
  state.visualByFixture = new Map();
  state.selected = null;
  $('#dateInput').value = date;
  $$('#weekStrip button').forEach(button => button.classList.toggle('active', button.dataset.date === date));
  const label = dateLabel(date);
  $('#boardTitle').textContent = `${label.top}’s Football`;
  $('#dayLoadState').textContent = 'Loading fixtures…';
  $('#matchList').innerHTML = '<div class="loading">Loading matches…</div>';
  $('#visibleMatches').textContent = '0 matches shown';
  $('#loadMoreBtn').hidden = true;
  $('#routeTipCount').textContent = '—';
  renderKpis();
  setHomeSpotlightMessage('Checking engine agreement…', 'Elite, consensus and early picks are being analysed.');
  const requestToken = ++state.requestToken;
  try {
    const payload = await fetchJson(`/api/fixtures?date=${encodeURIComponent(date)}${force ? `&refresh=${Date.now()}` : ''}`, { cache: force ? 'no-store' : 'default' });
    if (requestToken !== state.requestToken) return;
    state.fixtures = (payload.fixtures || []).filter(fixture => !/srl|simulated reality/i.test([fixture?.league?.name, fixture?.home?.name, fixture?.away?.name].join(' ')));
    updateWeekCount(date, state.fixtures.length);
    populateLeagues();
    applyFilters();
    renderKpis();
    if (state.fixtures.length) {
      $('#dayLoadState').textContent = `${state.fixtures.length} fixtures loaded. Deep statistics load only when you open a match.`;
      hydrateVisuals(date).catch(() => {});
      loadRouteSummary(date).catch(() => {});
    } else {
      $('#dayLoadState').textContent = payload.warning || 'No real matches are listed for this date yet.';
      setHomeSpotlightMessage('No qualified picks for this date yet.', 'The board updates when complete market and statistics routes become available.');
    }
  } catch (error) {
    if (requestToken !== state.requestToken) return;
    state.fixtures = [];
    state.filtered = [];
    state.routeByFixture = new Map();
    state.ppgByFixture = new Map();
    state.convergenceByFixture = new Map();
    state.visualByFixture = new Map();
    renderKpis();
    populateLeagues();
    updateWeekCount(date, null);
    $('#visibleMatches').textContent = '0 matches shown';
    $('#loadMoreBtn').hidden = true;
    const configIssue = error?.code === 'FEED_NOT_CONFIGURED';
    $('#matchList').innerHTML = `<div class="empty-state"><h3>${configIssue ? 'Football feed connection needs attention' : 'Matches are temporarily unavailable'}</h3><p>${configIssue ? 'Update the private feed settings in Render, then redeploy.' : 'Tap Refresh to retry this date.'}</p></div>`;
    $('#dayLoadState').textContent = configIssue ? 'The private football feed is not configured.' : 'This date could not be loaded. No older match list is being shown.';
    setHomeSpotlightMessage('Qualified picks could not be checked.', 'Refresh after the fixture connection returns.');
  }
}

function populateLeagues() {
  const select = $('#leagueFilter');
  const previous = select.value;
  const leagues = [...new Set(state.fixtures.map(fixture => `${fixture.league?.country || 'International'} · ${fixture.league?.name || 'League'}`))].sort();
  select.innerHTML = '<option value="ALL">All leagues</option>' + leagues.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  if (leagues.includes(previous)) select.value = previous;
}

function applyFilters() {
  const league = $('#leagueFilter').value;
  const status = $('#statusFilter').value;
  const search = normalize($('#searchInput').value);
  state.filtered = state.fixtures.filter(fixture => {
    const fixtureLeague = `${fixture.league?.country || 'International'} · ${fixture.league?.name || 'League'}`;
    const fixtureState = fixtureStatus(fixture);
    const teamText = normalize(`${fixture.home?.name} ${fixture.away?.name}`);
    return (league === 'ALL' || fixtureLeague === league)
      && (status === 'ALL' || fixtureState === status)
      && (!search || teamText.includes(search));
  });
  renderList();
}

function renderKpis() {
  $('#matchCount').textContent = state.fixtures.length;
  $('#oddsCount').textContent = state.fixtures.filter(fixture => [fixture.odds?.homeWin, fixture.odds?.draw, fixture.odds?.awayWin].every(validOdd)).length;
  $('#liveCount').textContent = state.fixtures.filter(isLive).length;
  if (!state.routeByFixture.size) $('#routeTipCount').textContent = '—';
}

function teamCrest(team, country, fixtureId, side) {
  const logo = team?.logo || state.visualByFixture.get(String(fixtureId))?.[side]?.logo;
  return `<span class="mini-crest" data-fixture-id="${esc(fixtureId)}" data-side="${side}">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : `<b>${esc(initials(team?.name))}</b>`}</span>`;
}

function renderList() {
  const list = $('#matchList');
  const visible = state.filtered.slice(0, state.limit);
  if (!visible.length) {
    list.innerHTML = '<div class="empty-state"><h3>No matches found</h3><p>Change the date or filters.</p></div>';
    $('#visibleMatches').textContent = '0 matches shown';
    $('#loadMoreBtn').hidden = true;
    return;
  }
  list.innerHTML = visible.map(fixture => {
    const route = state.routeByFixture.get(String(fixture.id));
    const ppg = state.ppgByFixture.get(String(fixture.id));
    const routeBadge = route?.selection
      ? `<span class="route-badge ${route.decision === 'SAFER' ? 'safer' : 'fire'}">MARKET · ${route.decision === 'SAFER' ? 'SAFER' : 'FIRE'} · ${esc(route.selection.label)}</span>`
      : route?.decision === 'CONFLICT'
        ? '<span class="route-badge conflict">MARKET CONFLICT</span>'
        : '';
    const ppgBadge = ppg?.selection
      ? `<span class="route-badge ppg ${ppg.decision === 'SAFER' ? 'safer' : 'fire'}">PPG · ${esc(ppg.selection.label)}</span>`
      : '';
    const consensus = state.consensusByFixture.get(String(fixture.id));
    const consensusBadge = consensus?.final && ['ELITE_BANKER','CONSENSUS_BANKER'].includes(consensus.classification)
      ? `<span class="route-badge consensus ${consensus.classification === 'ELITE_BANKER' ? 'elite' : 'fire'}">${consensus.agreementCount}/3 · ${esc(consensus.final.label)}</span>`
      : consensus?.classification === 'CONFLICT' ? '<span class="route-badge conflict">ENGINE CONFLICT</span>' : '';
    const status = fixtureStatus(fixture);
    return `<button class="match-row" type="button" data-fixture-id="${esc(fixture.id)}">
      <span class="league-line"><b>${esc(fixture.league?.country || 'International')}</b> · ${esc(fixture.league?.name || 'League')} ${routeBadge} ${ppgBadge} ${consensusBadge}</span>
      <span class="teams-cell">
        <span class="team-line">${teamCrest(fixture.home, fixture.league?.country, fixture.id, 'home')}<b>${esc(fixture.home?.name || 'Home')}</b></span>
        <span class="team-line">${teamCrest(fixture.away, fixture.league?.country, fixture.id, 'away')}<b>${esc(fixture.away?.name || 'Away')}</b></span>
      </span>
      <span class="kickoff-cell"><b>${esc(kickoffTime(fixture.kickoff))}</b><small class="status-${status.toLowerCase()}">${esc(status)}</small></span>
      <span class="board-1x2">
        <span><small>1</small><b>${odd(fixture.odds?.homeWin)}</b></span>
        <span><small>X</small><b>${odd(fixture.odds?.draw)}</b></span>
        <span><small>2</small><b>${odd(fixture.odds?.awayWin)}</b></span>
      </span>
      <span class="markets-count"><b>${Number(fixture.availableMarketCount) || Object.values(fixture.odds || {}).filter(validOdd).length}</b><small>markets</small></span>
    </button>`;
  }).join('');
  $$('.match-row').forEach(button => button.addEventListener('click', () => openMatch(button.dataset.fixtureId)));
  $('#visibleMatches').textContent = `Showing ${visible.length} of ${state.filtered.length} matches`;
  $('#loadMoreBtn').hidden = visible.length >= state.filtered.length;
}

function homeConsensusCard(row, tone = '') {
  const final = row.final || {};
  return `<a class="spotlight-pick consensus-home-card ${tone}" href="/picks.html#pick-${esc(row.fixtureId)}">
    <span class="spotlight-tier">${esc(String(row.classification || '').replaceAll('_', ' '))}</span>
    <small>${esc(row.country || 'International')} · ${esc(row.league || 'League')} · ${esc(kickoffTime(row.kickoff))}</small>
    <h3>${esc(row.home?.name || 'Home')} <i>vs</i> ${esc(row.away?.name || 'Away')}</h3>
    <div class="home-official-tip"><span>OFFICIAL TIP</span><strong>${esc(final.label || final.market || 'Qualified direction')}</strong><b>${odd(final.odds)}</b></div>
    <p>${Number(row.agreementCount || 0)}/3 engines agree · ${row.status === 'FROZEN' ? 'Frozen' : 'Early provisional'}</p>
  </a>`;
}

function renderHomeBankers(payload) {
  const eliteGrid = $('#homeEliteGrid');
  const consensusGrid = $('#homeConsensusGrid');
  const earlyGrid = $('#homeEarlyGrid');
  if (!eliteGrid || !consensusGrid || !earlyGrid) return;
  const all = payload?.consensus?.all || [];
  state.consensusByFixture = new Map(all.map(item => [String(item.fixtureId), item]));
  const todayRows = all.filter(item => item.date === state.selectedDate);
  const elite = todayRows.filter(item => item.classification === 'ELITE_BANKER').slice(0, 4);
  const consensus = todayRows.filter(item => item.classification === 'CONSENSUS_BANKER').slice(0, 4);
  const selected = new Date(`${state.selectedDate}T00:00:00.000Z`);
  selected.setUTCDate(selected.getUTCDate() + 1);
  const nextDate = selected.toISOString().slice(0, 10);
  const early = all.filter(item => item.date === nextDate && ['ELITE_BANKER','CONSENSUS_BANKER','QUALIFIED_PICK','SAFER_PICK'].includes(item.classification)).slice(0, 4);
  eliteGrid.innerHTML = elite.length ? elite.map(row => homeConsensusCard(row, 'elite')).join('') : '<div class="spotlight-empty"><b>No 3/3 agreement yet.</b><span>Elite Bankers appear only when all three engines support one safe direction.</span></div>';
  consensusGrid.innerHTML = consensus.length ? consensus.map(row => homeConsensusCard(row, 'consensus')).join('') : '<div class="spotlight-empty"><b>No 2/3 agreement yet.</b><span>Consensus Bankers need two independent engines to agree.</span></div>';
  earlyGrid.innerHTML = early.length ? early.map(row => homeConsensusCard(row, 'early')).join('') : '<div class="spotlight-empty"><b>No early pick published yet.</b><span>Future selections appear as soon as their required markets and statistics qualify.</span></div>';
  renderList();
  window.dispatchEvent(new CustomEvent('betynz:content-rendered'));
}

async function loadRouteSummary(date) {
  const payload = await fetchJson(`/api/market-route-board?date=${encodeURIComponent(date)}`, { cache: 'default' });
  if (state.selectedDate !== date) return;
  state.routeByFixture = new Map((payload.all || []).map(item => [String(item.fixture?.id), item.engine]));
  $('#routeTipCount').textContent = Number(payload.summary?.fire || 0) + Number(payload.summary?.safer || 0);
  renderList();
  fetchJson(`/api/consensus-picks?from=${encodeURIComponent(date)}&days=2`, { cache: 'default' })
    .then(qualified => { if (state.selectedDate === date) renderHomeBankers(qualified); })
    .catch(() => {});
}

async function hydrateVisuals(date) {
  const payload = await fetchJson(`/api/fixture-visuals?date=${encodeURIComponent(date)}`, { cache: 'default' });
  if (state.selectedDate !== date) return;
  state.visualByFixture = new Map((payload.visuals || []).map(item => [String(item.fixtureId), item]));
  for (const fixture of state.fixtures) {
    const visual = state.visualByFixture.get(String(fixture.id));
    if (!visual) continue;
    fixture.home = { ...fixture.home, ...(visual.home || {}) };
    fixture.away = { ...fixture.away, ...(visual.away || {}) };
    fixture.league = { ...fixture.league, ...(visual.league || {}) };
  }
  renderList();
}

function setCrest(imageSelector, fallbackSelector, team) {
  const image = $(imageSelector);
  const fallback = $(fallbackSelector);
  fallback.textContent = initials(team?.name);
  const logo = String(team?.logo || '');
  if (!logo) {
    image.hidden = true;
    fallback.hidden = false;
    return;
  }
  image.hidden = false;
  fallback.hidden = true;
  image.onerror = () => { image.hidden = true; fallback.hidden = false; };
  image.src = logo;
}

function openMatch(id) {
  const fixture = state.fixtures.find(item => String(item.id) === String(id));
  if (!fixture) return;
  state.selected = fixture;
  $('#detailLeague').textContent = `${fixture.league?.country || 'International'} · ${fixture.league?.name || 'League'}`;
  $('#detailKickoff').textContent = new Date(fixture.kickoff).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $('#homeName').textContent = fixture.home?.name || 'Home';
  $('#awayName').textContent = fixture.away?.name || 'Away';
  $('#homeOddLabel').textContent = `${fixture.home?.name || 'Home'} win`;
  $('#awayOddLabel').textContent = `${fixture.away?.name || 'Away'} win`;
  $('#detailHomeOdd').textContent = odd(fixture.odds?.homeWin);
  $('#detailDrawOdd').textContent = odd(fixture.odds?.draw);
  $('#detailAwayOdd').textContent = odd(fixture.odds?.awayWin);
  $('#matchStatus').textContent = fixtureStatus(fixture);
  setCrest('#homeLogo', '#homeCrest', fixture.home);
  setCrest('#awayLogo', '#awayCrest', fixture.away);
  renderAllOdds(fixture.odds || {});
  renderEngine(state.routeByFixture.get(String(fixture.id)) || null);
  renderPpgEngine(state.ppgByFixture.get(String(fixture.id)) || null);
  renderConvergenceEngine(state.convergenceByFixture.get(String(fixture.id)) || null);
  renderConsensusEngine(state.consensusByFixture.get(String(fixture.id)) || null);
  renderVenueForm(null);
  $('#matchIntelDialog').showModal();
  document.body.classList.add('dialog-open');
  loadIntelligence(fixture).catch(() => renderEngineError());
}

async function loadIntelligence(fixture) {
  const params = new URLSearchParams({
    date: state.selectedDate,
    event_id: String(fixture.sourceId || fixture.id || ''),
    home: fixture.home?.name || '',
    away: fixture.away?.name || '',
    league: fixture.league?.name || '',
    country: fixture.league?.country || '',
    kickoff: fixture.kickoff || '',
    home_id: fixture.home?.id || '',
    away_id: fixture.away?.id || ''
  });
  const payload = await fetchJson(`/api/match-intelligence?${params.toString()}`, { cache: 'default' });
  if (!state.selected || String(state.selected.id) !== String(fixture.id)) return;
  if (!payload.available) return renderEngineError();
  state.ppgByFixture.set(String(fixture.id), payload.ppgEngine || null);
  state.convergenceByFixture.set(String(fixture.id), payload.convergenceEngine || null);
  state.consensusByFixture.set(String(fixture.id), payload.consensusEngine || null);
  renderEngine(payload.engine);
  renderPpgEngine(payload.ppgEngine);
  renderConvergenceEngine(payload.convergenceEngine);
  renderConsensusEngine(payload.consensusEngine);
  renderVenueForm(payload.venueForm);
  renderList();
}

function renderEngineError() {
  $('#routeSelection').textContent = 'Market route unavailable';
  $('#routeExplanation').textContent = 'The match could not be analysed right now. Refresh and try again.';
  $('#routeDecision').textContent = 'UNAVAILABLE';
  $('#routeScore').textContent = '—';
  $('#routeChecks').innerHTML = '';
  renderPpgEngineError();
  renderConvergenceEngineError();
  renderConsensusEngineError();
}

function renderEngine(engine) {
  if (!engine) {
    $('#routeSelection').textContent = 'Checking odds route…';
    $('#routeExplanation').textContent = 'Under 3.5 opens the direction, then 1X2, BTTS, team totals and draw odds confirm the market.';
    $('#routeDecision').textContent = 'WAITING';
    $('#routeScore').textContent = '—';
    $('#routeName').textContent = 'No route yet';
    $('#routePrice').textContent = 'Odds —';
    $('#routeChecks').innerHTML = '<div class="loading">Checking thresholds…</div>';
    return;
  }
  const selection = engine.selection;
  const closest = selection
    ? (engine.candidates || []).find(candidate => candidate.id === selection.routeId)
    : [...(engine.candidates || [])].sort((a, b) => (a.failures?.length || 99) - (b.failures?.length || 99) || b.score - a.score)[0];
  $('#balanceBadge').textContent = engine.structure?.balance || 'UNKNOWN';
  highlightFavourite(engine.structure?.favouriteSide);
  $('#routeSelection').textContent = selection?.label || (engine.decision === 'CONFLICT' ? 'No Pick — Market Conflict' : 'No market route passed');
  $('#routeExplanation').textContent = engine.explanation || 'No complete route found.';
  $('#routeDecision').textContent = selection?.decision || engine.decision || 'NO SIGNAL';
  $('#routeScore').textContent = selection?.score ? `${selection.score}%` : closest?.score ? `${closest.score}%` : '—';
  $('#routeName').textContent = selection?.routeName || closest?.name || 'No route';
  $('#routePrice').textContent = selection?.odds ? `Odds ${odd(selection.odds)}` : 'Odds —';
  $('#routeResultCard').className = `route-result-card ${String(selection?.decision || engine.decision || '').toLowerCase()}`;
  const checks = closest?.checks || [];
  $('#routeChecks').innerHTML = checks.map(item => `<div class="route-check ${item.pass ? 'pass' : 'fail'}"><span>${item.pass ? '✓' : '×'}</span><div><b>${esc(item.label)}</b><small>${esc(item.actual)} · required ${esc(item.rule)}</small></div></div>`).join('') || '<div class="empty-state">No route checks available.</div>';
  $('#factorList').innerHTML = (selection?.reasons || closest?.reasons || [engine.explanation]).slice(0, 7).map(reason => `<li>${esc(reason)}</li>`).join('');
  const alternatives = (engine.candidates || []).filter(candidate => candidate.id !== closest?.id).sort((a, b) => a.failures.length - b.failures.length || b.score - a.score).slice(0, 4);
  $('#routeAlternatives').innerHTML = alternatives.map(candidate => `<div><span>${esc(candidate.name)}</span><b>${candidate.failures.length} missed · ${candidate.score}%</b></div>`).join('') || 'No alternatives loaded.';
}

function renderPpgEngineError() {
  $('#ppgSelection').textContent = 'PPG route unavailable';
  $('#ppgExplanation').textContent = 'Venue PPG could not be loaded for this match.';
  $('#ppgDecision').textContent = 'UNAVAILABLE';
  $('#ppgScore').textContent = '—';
  $('#ppgHomeValue').textContent = '—';
  $('#ppgAwayValue').textContent = '—';
  $('#ppgHomePoints').textContent = '0/15 points';
  $('#ppgAwayPoints').textContent = '0/15 points';
  $('#ppgRouteName').textContent = 'No PPG route';
  $('#ppgPrice').textContent = 'Odds —';
  $('#ppgChecks').innerHTML = '';
  $('#ppgReasons').innerHTML = '<li>Venue PPG is unavailable.</li>';
}

function renderPpgEngine(engine) {
  if (!engine) {
    $('#ppgSelection').textContent = 'Checking venue PPG…';
    $('#ppgExplanation').textContent = 'The engine compares the last five home matches with the last five away matches.';
    $('#ppgDecision').textContent = 'WAITING';
    $('#ppgScore').textContent = '—';
    $('#ppgHomeValue').textContent = '—';
    $('#ppgAwayValue').textContent = '—';
    $('#ppgHomePoints').textContent = '0/15 points';
    $('#ppgAwayPoints').textContent = '0/15 points';
    $('#ppgRouteName').textContent = 'No PPG route yet';
    $('#ppgPrice').textContent = 'Odds —';
    $('#ppgChecks').innerHTML = '<div class="loading">Loading venue samples…</div>';
    $('#ppgReasons').innerHTML = '<li>Five verified home and away venue matches are required.</li>';
    return;
  }
  const selection = engine.selection;
  const route = selection
    ? (engine.routes || []).find(item => item.id === selection.routeId)
    : (engine.routes || []).find(item => item.pass) || (engine.routes || [])[0];
  $('#ppgSelection').textContent = selection?.label || (engine.decision === 'WAITING' ? 'Waiting for complete PPG samples' : 'No qualifying PPG route');
  $('#ppgExplanation').textContent = engine.explanation || 'No PPG route qualified.';
  $('#ppgDecision').textContent = selection?.decision || engine.decision || 'NO SIGNAL';
  $('#ppgScore').textContent = selection?.score ? `${selection.score}%` : '—';
  $('#ppgHomeValue').textContent = Number.isFinite(Number(engine.home?.ppg)) ? Number(engine.home.ppg).toFixed(2) : '—';
  $('#ppgAwayValue').textContent = Number.isFinite(Number(engine.away?.ppg)) ? Number(engine.away.ppg).toFixed(2) : '—';
  $('#ppgHomePoints').textContent = `${Number(engine.home?.points || 0)}/${Number(engine.home?.maximumPoints || 15)} points`;
  $('#ppgAwayPoints').textContent = `${Number(engine.away?.points || 0)}/${Number(engine.away?.maximumPoints || 15)} points`;
  $('#ppgRouteName').textContent = selection?.routeName || route?.name || 'No PPG route';
  $('#ppgPrice').textContent = selection?.odds ? `Odds ${odd(selection.odds)}` : 'Odds —';
  $('#ppgResultCard').className = `route-result-card ppg-result-card ${String(selection?.decision || engine.decision || '').toLowerCase()}`;
  $('#ppgChecks').innerHTML = (route?.checks || []).map(item => `<div class="route-check ${item.pass ? 'pass' : 'fail'}"><span>${item.pass ? '✓' : '×'}</span><div><b>${esc(item.label)}</b><small>${esc(item.actual)} · required ${esc(item.rule)}</small></div></div>`).join('') || '<div class="empty-state">No PPG checks available.</div>';
  $('#ppgReasons').innerHTML = (selection?.reasons || [engine.explanation]).filter(Boolean).map(reason => `<li>${esc(reason)}</li>`).join('');
}


function renderConvergenceEngineError() {
  $('#convergenceSelection').textContent = 'Convergence unavailable';
  $('#convergenceExplanation').textContent = 'The four evidence blocks could not be calculated for this match.';
  $('#convergenceDecision').textContent = 'UNAVAILABLE';
  $('#convergenceScore').textContent = '—';
  $('#convergenceRouteName').textContent = 'No convergence route';
  $('#convergencePrice').textContent = 'Odds —';
  $('#convergenceBlocks').innerHTML = '';
  $('#convergenceReasons').innerHTML = '<li>Attack, defence, venue and market evidence are unavailable.</li>';
}

function renderConvergenceEngine(engine) {
  if (!engine) {
    $('#convergenceSelection').textContent = 'Checking four evidence blocks…';
    $('#convergenceExplanation').textContent = 'Attack, defence, venue performance and market expectation must independently agree.';
    $('#convergenceDecision').textContent = 'WAITING';
    $('#convergenceScore').textContent = '—';
    $('#convergenceRouteName').textContent = 'No convergence route yet';
    $('#convergencePrice').textContent = 'Odds —';
    $('#convergenceBlocks').innerHTML = '<div class="loading">Loading attack, defence, venue and market evidence…</div>';
    $('#convergenceReasons').innerHTML = '<li>Five verified home and away venue matches are required.</li>';
    return;
  }
  const selection = engine.selection;
  const candidate = selection
    ? (engine.candidates || []).find(item => item.id === selection.routeId)
    : [...(engine.candidates || [])].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
  $('#convergenceSelection').textContent = selection?.label || (engine.decision === 'CONFLICT' ? 'No Pick — Evidence Conflict' : engine.decision === 'WAITING' ? 'Waiting for complete evidence' : 'No convergent market');
  $('#convergenceExplanation').textContent = engine.explanation || 'No convergence route qualified.';
  $('#convergenceDecision').textContent = selection?.decision || engine.decision || 'NO SIGNAL';
  $('#convergenceScore').textContent = selection?.score ? `${Number(selection.score).toFixed(0)}%` : candidate?.score ? `${Number(candidate.score).toFixed(0)}%` : '—';
  $('#convergenceRouteName').textContent = selection?.routeName || candidate?.name || 'No convergence route';
  $('#convergencePrice').textContent = selection?.odds ? `Odds ${odd(selection.odds)}` : 'Odds —';
  $('#convergenceResultCard').className = `route-result-card convergence-result-card ${String(selection?.decision || engine.decision || '').toLowerCase()}`;
  $('#convergenceBlocks').innerHTML = (candidate?.blocks || []).map(block => `<article class="convergence-block"><small>${esc(block.name)}</small><strong>${Number(block.score || 0).toFixed(0)}/25</strong><span>${block.passed || 0}/${block.total || 0} checks</span><div>${(block.checks || []).map(item => `<i class="${item.pass ? 'pass' : 'fail'}">${item.pass ? '✓' : '×'} ${esc(item.label)}</i>`).join('')}</div></article>`).join('') || '<div class="empty-state">No convergence blocks available.</div>';
  $('#convergenceReasons').innerHTML = (selection?.reasons || candidate?.reasons || [engine.explanation]).filter(Boolean).slice(0, 8).map(reason => `<li>${esc(reason)}</li>`).join('');
}

function renderConsensusEngineError() {
  $('#consensusSelection').textContent = 'Consensus unavailable';
  $('#consensusExplanation').textContent = 'The three engine decisions could not be compared for this match.';
  $('#consensusDecision').textContent = 'UNAVAILABLE';
  $('#consensusScore').textContent = '—';
  $('#consensusMarket').textContent = 'No shared market';
  $('#consensusPrice').textContent = '—';
  $('#consensusAgreement').textContent = '0/3 engines agree';
  $('#consensusFreeze').textContent = 'Unavailable';
  $('#consensusMeter').style.width = '0%';
  $('#consensusEnginePicks').innerHTML = '';
  $('#consensusConflicts').innerHTML = '';
}

function renderConsensusEngine(engine) {
  if (!engine) {
    $('#consensusSelection').textContent = 'Checking engine agreement…';
    $('#consensusExplanation').textContent = 'The safest shared market is selected only after independent engine directions are compared.';
    $('#consensusDecision').textContent = 'WAITING';
    $('#consensusScore').textContent = '—';
    $('#consensusMarket').textContent = 'No shared market yet';
    $('#consensusPrice').textContent = '—';
    $('#consensusAgreement').textContent = '0/3 engines agree';
    $('#consensusFreeze').textContent = 'Provisional';
    $('#consensusMeter').style.width = '0%';
    $('#consensusEnginePicks').innerHTML = '<span class="engine-proof-chip"><b>Waiting</b><small>Engine routes are still loading</small></span>';
    $('#consensusConflicts').innerHTML = '';
    return;
  }
  const final = engine.final || null;
  const classification = String(engine.classification || 'NO_SIGNAL');
  $('#consensusSelection').textContent = final?.label || (classification === 'CONFLICT' ? 'No Banker — Engine Conflict' : classification === 'HOLD_MISSING_SHARED_PRICE' ? 'Agreement found — shared price missing' : 'No shared engine direction');
  $('#consensusExplanation').textContent = (engine.reasons || [])[0] || (classification === 'CONFLICT' ? 'Opposing engine directions prevent a banker.' : 'No compatible route agreement qualified.');
  $('#consensusDecision').textContent = classification.replaceAll('_', ' ');
  $('#consensusScore').textContent = Number(engine.score || 0) ? `${Number(engine.score).toFixed(0)}%` : '—';
  $('#consensusMarket').textContent = final?.label || 'No shared market';
  $('#consensusPrice').textContent = final?.odds ? odd(final.odds) : '—';
  $('#consensusAgreement').textContent = `${Number(engine.agreementCount || 0)}/3 engines agree`;
  $('#consensusFreeze').textContent = engine.status === 'FROZEN' ? 'Frozen before kickoff' : `Provisional · freezes ${engine.freezeMinutes || 30} min before kickoff`;
  $('#consensusMeter').style.width = `${Math.max(0, Math.min(100, Number(engine.agreementCount || 0) / 3 * 100))}%`;
  $('#consensusResultCard').className = `route-result-card consensus-result-card ${classification.toLowerCase().replaceAll('_', '-')}`;
  $('#consensusEnginePicks').innerHTML = (engine.enginePicks || []).map(item => `<span class="engine-proof-chip ${item.decision === 'FIRE' ? 'fire' : 'safer'}"><b>${esc(item.engineName || item.engine)}</b><small>${esc(item.label || item.market)} · ${esc(item.decision || '')}</small></span>`).join('') || '<span class="engine-proof-chip"><b>No qualified engines</b><small>Waiting for a complete route</small></span>';
  $('#consensusConflicts').innerHTML = (engine.conflictReasons || []).map(reason => `<p>× ${esc(reason)}</p>`).join('');
}

function highlightFavourite(side) {
  $('#homeOddCard').classList.toggle('favourite', side === 'home');
  $('#awayOddCard').classList.toggle('favourite', side === 'away');
  $('#drawOddCard').classList.remove('favourite');
}

function renderVenueForm(venueForm) {
  const grid = $('#venueFormGrid');
  if (!venueForm?.home && !venueForm?.away) {
    grid.innerHTML = '<div class="empty-state"><h3>Venue form is not available yet</h3><p>The Market Route can still read odds, but the PPG Route waits until both five-match venue samples are available.</p></div>';
    return;
  }
  grid.innerHTML = [
    ['Home team · last 5 home', venueForm.home],
    ['Away team · last 5 away', venueForm.away]
  ].map(([title, split]) => {
    if (!split) return `<article class="venue-card"><h3>${esc(title)}</h3><p class="muted">No verified sample.</p></article>`;
    const form = (split.form || []).map(value => `<span class="form-${String(value).toLowerCase()}">${esc(value)}</span>`).join('');
    return `<article class="venue-card">
      <small>${esc(title)}</small>
      <div class="venue-head"><strong>${Number(split.ppg || 0).toFixed(2)} PPG</strong><span>${split.points}/${split.maximumPoints} points</span></div>
      <div class="form-chips">${form || '<span>—</span>'}</div>
      <div class="venue-metrics">
        <div><span>Record</span><b>${split.wins}W · ${split.draws}D · ${split.losses}L</b></div>
        <div><span>Goals</span><b>${Number(split.goalsForAvg || 0).toFixed(2)} scored · ${Number(split.goalsAgainstAvg || 0).toFixed(2)} conceded</b></div>
        <div><span>Over 1.5</span><b>${split.over15}/${split.played}</b></div>
        <div><span>Over 2.5</span><b>${split.over25}/${split.played}</b></div>
        <div><span>Under 3.5</span><b>${split.under35}/${split.played}</b></div>
        <div><span>BTTS</span><b>${split.btts}/${split.played}</b></div>
        <div><span>Clean sheets</span><b>${split.cleanSheets}/${split.played}</b></div>
        <div><span>Failed to score</span><b>${split.failedToScore}/${split.played}</b></div>
      </div>
    </article>`;
  }).join('');
}

function renderAllOdds(odds) {
  const rows = Object.entries(odds).filter(([, value]) => validOdd(value));
  $('#marketCountLabel').textContent = `${rows.length} markets`;
  $('#allOddsGrid').innerHTML = rows.length ? rows.map(([key, value]) => `<div><span>${esc(MARKET_LABELS[key] || key)}</span><b>${odd(value)}</b></div>`).join('') : '<div class="empty-state">No verified markets available.</div>';
}

function closeDialog() {
  $('#matchIntelDialog').close();
  document.body.classList.remove('dialog-open');
}

function setupTabs() {
  $$('.tabs button').forEach(button => button.addEventListener('click', () => {
    $$('.tabs button').forEach(item => item.classList.toggle('active', item === button));
    $$('.tab-panel').forEach(panel => { panel.hidden = panel.dataset.tabPanel !== button.dataset.tab; });
  }));
}

function setupEvents() {
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#refreshBtn').addEventListener('click', () => loadDate(state.selectedDate, true));
  $('#dateInput').addEventListener('change', event => loadDate(event.target.value));
  $('#leagueFilter').addEventListener('change', applyFilters);
  $('#statusFilter').addEventListener('change', applyFilters);
  $('#searchInput').addEventListener('input', applyFilters);
  $('#loadMoreBtn').addEventListener('click', () => { state.limit += window.innerWidth <= 560 ? 12 : 20; renderList(); });
  $('#closeMatchDialog').addEventListener('click', closeDialog);
  $('#matchIntelDialog').addEventListener('click', event => { if (event.target === $('#matchIntelDialog')) closeDialog(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#matchIntelDialog').open) closeDialog(); });
  setupTabs();
}

buildWeekStrip();
setupEvents();
loadDate(state.selectedDate);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
