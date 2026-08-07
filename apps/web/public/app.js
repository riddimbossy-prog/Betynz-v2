import { dataBackedButton } from './data-backed-ui.js';
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
  routeByFixture: new Map(),
  ppgByFixture: new Map(),
  apexByFixture: new Map(),
  convergenceByFixture: new Map(),
  momentumByFixture: new Map(),
  streakValueByFixture: new Map(),
  htftByFixture: new Map(),
  zeusByFixture: new Map(),
  consensusByFixture: new Map(),
  visualByFixture: new Map(),
  requestToken: 0,
  consensusPollTimer: null,
  routePollTimer: null,
  weekCountToken: 0,
  winsPollTimer: null,
  boardOddsPollTimer: null,
  boardOddsPollAttempt: 0,
  listSignature: ''
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
  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || 20000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(payload?.message || `HTTP ${response.status}`);
      error.code = payload?.error || `HTTP_${response.status}`;
      throw error;
    }
    return payload;
  } finally { clearTimeout(timer); }
}

function setHomeSpotlightMessage(message, detail = '') {
  const spotlight = $('#homePicksSpotlight');
  if (spotlight) spotlight.hidden = false;
  for (const id of ['homeEliteGrid', 'homeConsensusGrid', 'homeEarlyGrid']) {
    const grid = $(`#${id}`);
    if (grid) {
      grid.closest('[data-board-aware]')?.removeAttribute('hidden');
      grid.innerHTML = `<div class="spotlight-empty"><b>${esc(message)}</b><span>${esc(detail)}</span></div>`;
    }
  }
}

async function loadDate(date, force = false) {
  clearTimeout(state.boardOddsPollTimer);
  state.boardOddsPollTimer = null;
  state.boardOddsPollAttempt = 0;
  state.selectedDate = date;
  state.fixtures = [];
  state.filtered = [];
  state.routeByFixture = new Map();
  state.ppgByFixture = new Map();
  state.apexByFixture = new Map();
  state.convergenceByFixture = new Map();
  state.momentumByFixture = new Map();
  state.streakValueByFixture = new Map();
  state.htftByFixture = new Map();
  state.zeusByFixture = new Map();
  state.consensusByFixture = new Map();
  state.visualByFixture = new Map();
  state.selected = null;
  state.listSignature = '';
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
      $('#dayLoadState').textContent = payload.oddsPending
        ? `${state.fixtures.length} fixtures loaded. Bookmaker odds are loading in the background.`
        : `${state.fixtures.length} fixtures loaded. Deep statistics load only when you open a match.`;
      const missingVisualIds = state.fixtures.some(fixture => !Number(fixture?.home?.id) || !Number(fixture?.away?.id));
      if (missingVisualIds) hydrateVisuals(date).catch(() => {});
      if (payload.oddsPending) scheduleBoardOddsRefresh(date, 0);
      loadRouteSummary(date).catch(() => {});
      const loadCounts = () => loadRemainingWeekCounts(date).catch(() => {});
      if ('requestIdleCallback' in window) requestIdleCallback(loadCounts, { timeout: 6000 });
      else setTimeout(loadCounts, 4500);
    } else {
      $('#dayLoadState').textContent = payload.warning || 'No real matches are listed for this date yet.';
      setHomeSpotlightMessage('No qualified picks for this date yet.', 'The board updates when complete market and statistics routes become available.');
    }
  } catch (error) {
    if (requestToken !== state.requestToken) return;
    state.fixtures = [];
    state.filtered = [];
    state.routeByFixture = new Map();
    state.apexByFixture = new Map();
    state.convergenceByFixture = new Map();
  state.momentumByFixture = new Map();
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

function scheduleBoardOddsRefresh(date, attempt = 0) {
  clearTimeout(state.boardOddsPollTimer);
  if (state.selectedDate !== date || document.hidden || attempt > 30) return;
  const delay = attempt < 8 ? 3000 : attempt < 20 ? 7000 : 15000;
  state.boardOddsPollAttempt = attempt;
  state.boardOddsPollTimer = setTimeout(() => refreshBoardOdds(date, attempt).catch(() => {
    if (state.selectedDate === date) scheduleBoardOddsRefresh(date, attempt + 1);
  }), delay);
}

async function refreshBoardOdds(date, attempt = 0) {
  if (state.selectedDate !== date) return;
  const payload = await fetchJson(`/api/fixtures?date=${encodeURIComponent(date)}&odds_refresh=${Date.now()}`, { cache: 'no-store', timeoutMs: 12000 });
  if (state.selectedDate !== date) return;
  const fixtures = (payload.fixtures || []).filter(fixture => !/srl|simulated reality/i.test([fixture?.league?.name, fixture?.home?.name, fixture?.away?.name].join(' ')));
  if (fixtures.length) {
    state.fixtures = fixtures;
    populateLeagues();
    applyFilters();
    renderKpis();
    $('#dayLoadState').textContent = payload.oddsPending
      ? `${fixtures.length} fixtures loaded. Bookmaker odds are still loading in the background.`
      : `${fixtures.length} fixtures loaded. Deep statistics load only when you open a match.`;
  }
  if (payload.oddsPending) scheduleBoardOddsRefresh(date, attempt + 1);
  else {
    state.boardOddsPollTimer = null;
    loadRouteSummary(date).catch(() => {});
  }
}

function populateLeagues() {
  const select = $('#leagueFilter');
  const previous = select.value;
  const leagues = [...new Set(state.fixtures.map(fixture => `${fixture.league?.country || 'International'} · ${fixture.league?.name || 'League'}`))].sort();
  select.innerHTML = '<option value="ALL">All leagues</option>' + leagues.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  // Every date opens on the complete board. A previous league filter must not
  // silently reduce a new day to one competition.
  select.value = 'ALL';
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

function crestSource(team, country = '') {
  const id = Number(team?.id);
  if (Number.isFinite(id) && id > 0) return `/api/media/team/${encodeURIComponent(String(id))}.png`;
  const name = String(team?.name || '').trim();
  if (name.length >= 2) return `/api/team-crest?name=${encodeURIComponent(name)}&country=${encodeURIComponent(String(country || ''))}`;
  return '';
}

function bindCrestFallbacks(root = document) {
  root.querySelectorAll('.mini-crest img').forEach(image => {
    if (image.dataset.bound === '1') return;
    image.dataset.bound = '1';
    const fallback = image.parentElement?.querySelector('b');
    image.addEventListener('load', () => { image.hidden = false; if (fallback) fallback.hidden = true; }, { once: true });
    image.addEventListener('error', () => { image.hidden = true; if (fallback) fallback.hidden = false; }, { once: true });
  });
}

function teamCrest(team, country, fixtureId, side) {
  const visual = state.visualByFixture.get(String(fixtureId))?.[side] || null;
  const merged = { ...(team || {}), ...(visual || {}) };
  const logo = crestSource(merged, country);
  const fallback = esc(initials(merged?.name));
  return `<span class="mini-crest" data-fixture-id="${esc(fixtureId)}" data-side="${side}">${logo ? `<img src="${esc(logo)}" alt="${esc(merged?.name || '')} crest" loading="lazy"><b hidden>${fallback}</b>` : `<b>${fallback}</b>`}</span>`;
}

function renderList() {
  const list = $('#matchList');
  const visible = state.filtered;
  const signature = visible.map(fixture => {
    const id = String(fixture.id);
    const route = state.routeByFixture.get(id);
    const ppg = state.ppgByFixture.get(id);
    const apex = state.apexByFixture.get(id);
    const consensus = state.consensusByFixture.get(id);
    return [id, fixture.home?.id, fixture.away?.id, route?.decision, route?.selection?.market, ppg?.decision, ppg?.selection?.market, apex?.decision, apex?.selection?.market, consensus?.classification, consensus?.final?.market].join(':');
  }).join('|');
  if (state.listSignature === signature && list.children.length) return;
  state.listSignature = signature;
  if (!visible.length) {
    list.innerHTML = '<div class="empty-state"><h3>No matches found</h3><p>Change the date or filters.</p></div>';
    $('#visibleMatches').textContent = '0 matches shown';
    $('#loadMoreBtn').hidden = true;
    return;
  }
  list.innerHTML = visible.map(fixture => {
    const route = state.routeByFixture.get(String(fixture.id));
    const ppg = state.ppgByFixture.get(String(fixture.id));
    const apex = state.apexByFixture.get(String(fixture.id));
    const routeBadge = route?.selection
      ? `<span class="route-badge ${route.decision === 'SAFER' ? 'safer' : 'fire'}">MARKET · ${route.decision === 'SAFER' ? 'SAFER' : 'FIRE'} · ${esc(route.selection.label)}</span>`
      : route?.decision === 'CONFLICT'
        ? '<span class="route-badge conflict">MARKET CONFLICT</span>'
        : '';
    const ppgBadge = ppg?.selection
      ? `<span class="route-badge ppg ${ppg.decision === 'SAFER' ? 'safer' : 'fire'}">PPG · ${esc(ppg.selection.label)}</span>`
      : '';
    const apexBadge = apex?.selection
      ? `<span class="route-badge apex ${apex.decision === 'SAFER' ? 'safer' : 'fire'}">APEX · ${esc(apex.selection.label)}</span>`
      : '';
    const consensus = state.consensusByFixture.get(String(fixture.id));
    const consensusBadge = consensus?.final && ['ELITE_BANKER','CONSENSUS_BANKER'].includes(consensus.classification)
      ? `<span class="route-badge consensus ${consensus.classification === 'ELITE_BANKER' ? 'elite' : 'fire'}">${consensus.agreementCount}/5 · ${esc(consensus.final.label)}</span>`
      : consensus?.classification === 'CONFLICT' ? '<span class="route-badge conflict">ENGINE CONFLICT</span>' : '';
    const status = fixtureStatus(fixture);
    const hasScore = Number.isFinite(Number(fixture.score?.home)) && Number.isFinite(Number(fixture.score?.away));
    const scoreMarkup = hasScore && ['LIVE','SETTLED'].includes(status)
      ? `<b class="board-score">${Number(fixture.score.home)}–${Number(fixture.score.away)}</b><span>${esc(kickoffTime(fixture.kickoff))}</span>`
      : `<b>${esc(kickoffTime(fixture.kickoff))}</b>`;
    return `<button class="match-row" type="button" data-fixture-id="${esc(fixture.id)}">
      <span class="league-line"><b>${esc(fixture.league?.country || 'International')}</b> · ${esc(fixture.league?.name || 'League')} ${routeBadge} ${ppgBadge} ${apexBadge} ${consensusBadge}</span>
      <span class="teams-cell">
        <span class="team-line">${teamCrest(fixture.home, fixture.league?.country, fixture.id, 'home')}<b>${esc(fixture.home?.name || 'Home')}</b></span>
        <span class="team-line">${teamCrest(fixture.away, fixture.league?.country, fixture.id, 'away')}<b>${esc(fixture.away?.name || 'Away')}</b></span>
      </span>
      <span class="kickoff-cell">${scoreMarkup}<small class="status-${status.toLowerCase()}">${esc(status)}</small></span>
      <span class="board-1x2">
        <span><small>1</small><b>${odd(fixture.odds?.homeWin)}</b></span>
        <span><small>X</small><b>${odd(fixture.odds?.draw)}</b></span>
        <span><small>2</small><b>${odd(fixture.odds?.awayWin)}</b></span>
      </span>
      <span class="markets-count"><b>${Number(fixture.availableMarketCount) || Object.values(fixture.odds || {}).filter(validOdd).length}</b><small>markets</small></span>
    </button>`;
  }).join('');
  bindCrestFallbacks(list);
  $$('.match-row').forEach(button => button.addEventListener('click', () => openMatch(button.dataset.fixtureId)));
  $('#visibleMatches').textContent = `All ${state.filtered.length} matches for this day`;
  $('#loadMoreBtn').hidden = true;
}

function winCarouselItem(row) {
  const score = Number.isFinite(Number(row.homeScore)) && Number.isFinite(Number(row.awayScore))
    ? `${Number(row.homeScore)}–${Number(row.awayScore)}` : 'WON';
  const agreement = row.recordType === 'CONSENSUS' && row.agreementCount ? `${row.agreementCount}/5 · ` : '';
  return `<a class="win-carousel-item" href="/proof.html">
    <span class="win-check">✓</span>
    <span class="win-copy"><small>${esc(row.country || 'International')} · ${esc(row.league || 'League')}</small><b>${esc(row.home)} ${esc(score)} ${esc(row.away)}</b></span>
    <span class="win-market"><small>${esc(agreement)}${esc(row.recordType === 'CONSENSUS' ? 'CONSENSUS' : row.engine || 'ENGINE')}</small><strong>${esc(row.selection || row.market || 'Winning pick')} @ ${odd(row.odds)}</strong></span>
  </a>`;
}

function renderWinCarousel(payload) {
  const shell = $('#winCarousel');
  const track = $('#winCarouselTrack');
  if (!shell || !track) return;
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!rows.length) {
    shell.hidden = true;
    track.innerHTML = '';
    return;
  }
  const items = rows.map(winCarouselItem).join('');
  // Duplicate the sequence for a seamless CSS-only loop. Screen readers see
  // only the first copy; the duplicate is decorative.
  track.innerHTML = `<div class="win-carousel-sequence">${items}</div><div class="win-carousel-sequence" aria-hidden="true">${items}</div>`;
  track.style.setProperty('--ticker-duration', `${Math.max(24, rows.length * 5)}s`);
  shell.hidden = false;
  window.dispatchEvent(new CustomEvent('betynz:content-rendered'));
}

async function loadWinCarousel(attempt = 0) {
  clearTimeout(state.winsPollTimer);
  try {
    const payload = await fetchJson('/api/wins-carousel?days=14&limit=24', { cache: 'no-store', timeoutMs: 15000 });
    renderWinCarousel(payload);
    if (payload?.configured === false && !(payload?.rows || []).length) return;
    const delay = payload?.rows?.length ? 120000 : 45000;
    if (attempt < 180) state.winsPollTimer = setTimeout(() => loadWinCarousel(attempt + 1), delay);
  } catch {
    const shell = $('#winCarousel');
    if (shell) shell.hidden = true;
    if (attempt < 30) state.winsPollTimer = setTimeout(() => loadWinCarousel(attempt + 1), 60000);
  }
}

function homeConsensusCard(row, tone = '') {
  const final = row.final || {};
  return `<a class="spotlight-pick consensus-home-card ${tone}" href="/picks.html#pick-${esc(row.fixtureId)}">
    <span class="spotlight-tier">${esc(String(row.classification || '').replaceAll('_', ' '))}</span>
    <small>${esc(row.country || 'International')} · ${esc(row.league || 'League')} · ${esc(kickoffTime(row.kickoff))}</small>
    <h3>${esc(row.home?.name || 'Home')} <i>vs</i> ${esc(row.away?.name || 'Away')}</h3>
    <div class="home-official-tip"><span>OFFICIAL TIP</span><strong>${esc(final.label || final.market || 'Qualified direction')}</strong><b>${odd(final.odds)}</b></div>
    <p>${Number(row.agreementCount || 0)}/7 engines agree · ${row.status === 'FROZEN' ? 'Frozen' : 'Early provisional'}</p>
  </a>`;
}

function renderHomeBankers(payload) {
  const eliteGrid = $('#homeEliteGrid');
  const consensusGrid = $('#homeConsensusGrid');
  const earlyGrid = $('#homeEarlyGrid');
  if (!eliteGrid || !consensusGrid || !earlyGrid) return;
  if (payload?.failed) {
    setHomeSpotlightMessage('Engine analysis could not be completed.', payload.error || 'Refresh to try again.');
    return;
  }
  const all = payload?.consensus?.all || [];
  state.consensusByFixture = new Map(all.map(item => [String(item.fixtureId), item]));
  const todayRows = all.filter(item => item.date === state.selectedDate);
  const elite = todayRows.filter(item => item.classification === 'ELITE_BANKER').slice(0, 4);
  const consensus = todayRows.filter(item => item.classification === 'CONSENSUS_BANKER').slice(0, 4);
  const selected = new Date(`${state.selectedDate}T00:00:00.000Z`);
  selected.setUTCDate(selected.getUTCDate() + 1);
  const nextDate = selected.toISOString().slice(0, 10);
  const early = all.filter(item => item.date === nextDate && ['ELITE_BANKER','CONSENSUS_BANKER','QUALIFIED_PICK','SAFER_PICK'].includes(item.classification)).slice(0, 4);
  const processing = !payload?.complete;
  const progress = payload?.progress || {};
  const progressText = `${Number(progress.processed || 0)} of ${Number(progress.total || 0)} processed`;
  eliteGrid.innerHTML = elite.length ? elite.map(row => homeConsensusCard(row, 'elite')).join('') : processing
    ? `<div class="spotlight-empty"><b>Checking 7/7 agreement…</b><span>${esc(progressText)}. This updates automatically.</span></div>` : '';
  consensusGrid.innerHTML = consensus.length ? consensus.map(row => homeConsensusCard(row, 'consensus')).join('') : processing
    ? `<div class="spotlight-empty"><b>Checking 5–6/7 agreement…</b><span>${esc(progressText)}. This updates automatically.</span></div>` : '';
  earlyGrid.innerHTML = early.length ? early.map(row => homeConsensusCard(row, 'early')).join('') : processing
    ? '<div class="spotlight-empty"><b>Preparing early picks…</b><span>The selected date finishes before future dates are scanned.</span></div>' : '';

  const visibility = [
    ['homeEliteSection', elite.length],
    ['homeConsensusSection', consensus.length],
    ['homeEarlySection', early.length]
  ];
  for (const [id, count] of visibility) {
    const section = $(`#${id}`);
    if (section) section.hidden = !processing && !count;
  }
  const spotlight = $('#homePicksSpotlight');
  if (spotlight) spotlight.hidden = !processing && visibility.every(([, count]) => !count);
  renderList();
  window.dispatchEvent(new CustomEvent('betynz:content-rendered'));
}

async function loadHomeConsensus(date, attempt = 0, days = 1) {
  clearTimeout(state.consensusPollTimer);
  try {
    const qualified = await fetchJson(`/api/consensus-picks?from=${encodeURIComponent(date)}&days=${days}`, { cache: 'no-store', timeoutMs: 20000 });
    if (state.selectedDate !== date) return;
    renderHomeBankers(qualified);
    if (!qualified.complete && !qualified.failed && attempt < 120) {
      const delay = attempt < 16 ? 1500 : 4000;
      state.consensusPollTimer = setTimeout(() => loadHomeConsensus(date, attempt + 1, days), delay);
    } else if (qualified.complete && !qualified.failed && days === 1) {
      const expand = () => {
        if (state.selectedDate === date && !document.hidden) loadHomeConsensus(date, 0, 2).catch(() => {});
      };
      if ('requestIdleCallback' in window) requestIdleCallback(expand, { timeout: 8000 });
      else setTimeout(expand, 5000);
    }
  } catch (error) {
    if (state.selectedDate === date) setHomeSpotlightMessage('Engine analysis could not be completed.', error?.name === 'AbortError' ? 'The request timed out. Tap Refresh to retry.' : 'Tap Refresh to retry.');
  }
}

async function loadRouteSummary(date, attempt = 0) {
  clearTimeout(state.routePollTimer);
  const payload = await fetchJson(`/api/market-route-board?date=${encodeURIComponent(date)}`, { cache: 'no-store', timeoutMs: 20000 });
  if (state.selectedDate !== date) return;
  state.routeByFixture = new Map((payload.all || []).map(item => [String(item.fixture?.id), item.engine]));
  $('#routeTipCount').textContent = Number(payload.summary?.fire || 0) + Number(payload.summary?.safer || 0);
  renderList();
  if (attempt === 0) loadHomeConsensus(date).catch(() => {});
  if (!payload.complete && !payload.failed && attempt < 90) {
    const delay = attempt < 16 ? 1500 : 4000;
    state.routePollTimer = setTimeout(() => loadRouteSummary(date, attempt + 1).catch(() => {}), delay);
  }
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

async function loadPrecomputeStatus() {
  const el = $('#weekPrecomputeState');
  if (!el) return;
  try {
    const payload = await fetchJson('/api/precompute-status', { cache: 'no-store', timeoutMs: 8000 });
    const state = payload.weeklyPrecompute || {};
    const ready = Boolean(payload.visibleWeekReady);
    const preparedDates = Number(payload.preparedViews?.dates?.length || 0);
    el.classList.toggle('ready', ready);
    el.classList.toggle('working', !ready && Boolean(state.running));
    const text = ready
      ? `Prepared: all 7 visible days · engines + Consensus + Zeus ready`
      : state.running
        ? `Preparing ${state.currentDate || state.from || 'visible week'} · ${Number(state.processed || 0)}/${Number(state.total || 7)} days complete`
        : `${preparedDates} prepared day${preparedDates === 1 ? '' : 's'} cached · background prebuild will continue`;
    el.querySelector('span:last-child').textContent = text;
  } catch {
    el.querySelector('span:last-child').textContent = 'Prepared-week status unavailable; normal cached analysis remains active.';
  }
}

async function loadRemainingWeekCounts(selectedDate) {
  const token = ++state.weekCountToken;
  try {
    // One low-priority range request replaces six separate daily requests. This
    // preserves the API minute budget for PPG/Apex/Convergence/Momentum history.
    const from = dateOffset(0);
    const payload = await fetchJson(`/api/fixture-counts?from=${encodeURIComponent(from)}&days=7`, { cache: 'default', timeoutMs: 16000 });
    if (token !== state.weekCountToken) return;
    for (const row of payload.counts || []) {
      if (row.date === selectedDate) continue;
      updateWeekCount(row.date, Number.isFinite(Number(row.count)) ? Number(row.count) : null);
    }
  } catch {
    if (token !== state.weekCountToken) return;
    for (let offset = 1; offset < 7; offset += 1) {
      const date = dateOffset(offset);
      if (date !== selectedDate) updateWeekCount(date, null);
    }
  }
}

function setCrest(imageSelector, fallbackSelector, team, country = '') {
  const image = $(imageSelector);
  const fallback = $(fallbackSelector);
  fallback.textContent = initials(team?.name);
  const logo = crestSource(team, country);
  image.removeAttribute('src');
  if (!logo) {
    image.hidden = true;
    fallback.hidden = false;
    return;
  }
  image.hidden = false;
  fallback.hidden = true;
  image.onerror = () => { image.hidden = true; fallback.hidden = false; };
  image.onload = () => { image.hidden = false; fallback.hidden = true; };
  image.src = logo;
}


function attachDataBacked(selector, engineOrValidation, text='Backed by data') {
  const card = $(selector);
  if (!card) return;
  card.querySelector('.data-backed-inline')?.remove();
  const validation = engineOrValidation?.dataValidation || engineOrValidation?.selection?.dataValidation || engineOrValidation || null;
  const html = dataBackedButton(validation, text);
  if (!html) return;
  const holder = document.createElement('div');
  holder.className = 'data-backed-inline';
  holder.innerHTML = html;
  const anchor = card.querySelector('.route-market, .route-result-head, .route-selection, h3');
  if (anchor) anchor.insertAdjacentElement('afterend', holder);
  else card.prepend(holder);
}

function attachAllDataBacked(payload={}) {
  attachDataBacked('#routeResultCard', payload.engine);
  attachDataBacked('#ppgResultCard', payload.ppgEngine);
  attachDataBacked('#apexResultCard', payload.apexEngine);
  attachDataBacked('#convergenceResultCard', payload.convergenceEngine);
  attachDataBacked('#momentumResultCard', payload.momentumEngine);
  attachDataBacked('#atlasResultCard', payload.streakValueEngine);
  attachDataBacked('#htftResultCard', payload.htftEngine);
  attachDataBacked('#zeusResultCard', payload.zeusEngine);
  attachDataBacked('#consensusResultCard', payload.consensusEngine?.final?.dataValidation, 'Statistically backed');
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
  setCrest('#homeLogo', '#homeCrest', fixture.home, fixture.league?.country);
  setCrest('#awayLogo', '#awayCrest', fixture.away, fixture.league?.country);
  renderAllOdds(fixture.odds || {});
  renderEngine(state.routeByFixture.get(String(fixture.id)) || null);
  renderPpgEngine(state.ppgByFixture.get(String(fixture.id)) || null);
  renderApexEngine(state.apexByFixture.get(String(fixture.id)) || null);
  renderConvergenceEngine(state.convergenceByFixture.get(String(fixture.id)) || null);
  renderMomentumEngine(state.momentumByFixture.get(String(fixture.id)) || null);
  renderStreakValueEngine(state.streakValueByFixture.get(String(fixture.id)) || null);
  renderHtftEngine(state.htftByFixture.get(String(fixture.id)) || null);
  renderZeusEngine(state.zeusByFixture.get(String(fixture.id)) || null);
  const cachedPayload = {
    engine: state.routeByFixture.get(String(fixture.id)) || null,
    ppgEngine: state.ppgByFixture.get(String(fixture.id)) || null,
    apexEngine: state.apexByFixture.get(String(fixture.id)) || null,
    convergenceEngine: state.convergenceByFixture.get(String(fixture.id)) || null,
    momentumEngine: state.momentumByFixture.get(String(fixture.id)) || null,
    streakValueEngine: state.streakValueByFixture.get(String(fixture.id)) || null,
    htftEngine: state.htftByFixture.get(String(fixture.id)) || null,
    zeusEngine: state.zeusByFixture.get(String(fixture.id)) || null,
    consensusEngine: state.consensusByFixture.get(String(fixture.id)) || null
  };
  renderConsensusEngine(cachedPayload.consensusEngine);
  attachAllDataBacked(cachedPayload);
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
  state.apexByFixture.set(String(fixture.id), payload.apexEngine || null);
  state.convergenceByFixture.set(String(fixture.id), payload.convergenceEngine || null);
  state.momentumByFixture.set(String(fixture.id), payload.momentumEngine || null);
  state.streakValueByFixture.set(String(fixture.id), payload.streakValueEngine || null);
  state.htftByFixture.set(String(fixture.id), payload.htftEngine || null);
  state.zeusByFixture.set(String(fixture.id), payload.zeusEngine || null);
  state.consensusByFixture.set(String(fixture.id), payload.consensusEngine || null);
  renderEngine(payload.engine);
  renderPpgEngine(payload.ppgEngine);
  renderApexEngine(payload.apexEngine);
  renderConvergenceEngine(payload.convergenceEngine);
  renderMomentumEngine(payload.momentumEngine);
  renderStreakValueEngine(payload.streakValueEngine);
  renderHtftEngine(payload.htftEngine);
  renderZeusEngine(payload.zeusEngine);
  renderConsensusEngine(payload.consensusEngine);
  attachAllDataBacked(payload);
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
  renderApexEngineError();
  renderConvergenceEngineError();
  renderMomentumEngineError();
  renderStreakValueEngineError();
  renderHtftEngineError();
  renderZeusEngineError();
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


function renderApexEngineError() {
  $('#apexSelection').textContent = 'Apex intelligence unavailable';
  $('#apexExplanation').textContent = 'The composite evidence could not be loaded for this match.';
  $('#apexDecision').textContent = 'UNAVAILABLE';
  $('#apexScore').textContent = '—';
  $('#apexDataQuality').textContent = '—';
  $('#apexEvidenceFamilies').textContent = '—';
  $('#apexRouteName').textContent = 'No Apex route';
  $('#apexPrice').textContent = 'Odds —';
  $('#apexChecks').innerHTML = '';
  $('#apexReasons').innerHTML = '<li>Composite team evidence is unavailable.</li>';
}

function renderApexEngine(engine) {
  if (!engine) {
    $('#apexSelection').textContent = 'Building composite evidence…';
    $('#apexExplanation').textContent = 'Apex combines strength, form, momentum, attack, defence and exact market confirmation.';
    $('#apexDecision').textContent = 'WAITING';
    $('#apexScore').textContent = '—';
    $('#apexDataQuality').textContent = '—';
    $('#apexEvidenceFamilies').textContent = '—';
    $('#apexRouteName').textContent = 'No Apex route yet';
    $('#apexPrice').textContent = 'Odds —';
    $('#apexChecks').innerHTML = '<div class="loading">Loading composite evidence…</div>';
    $('#apexReasons').innerHTML = '<li>Five verified home and away venue matches are required.</li>';
    return;
  }
  const selection = engine.selection;
  const candidate = selection
    ? (engine.candidates || []).find(item => item.id === selection.routeId)
    : [...(engine.candidates || [])].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
  $('#apexSelection').textContent = selection?.label || (engine.decision === 'CONFLICT' ? 'No Pick — Composite Conflict' : engine.decision === 'WAITING' ? 'Waiting for complete evidence' : 'No qualifying Apex route');
  $('#apexExplanation').textContent = engine.explanation || 'No Apex route qualified.';
  $('#apexDecision').textContent = selection?.decision || engine.decision || 'NO SIGNAL';
  $('#apexScore').textContent = selection?.score ? `${selection.score}%` : candidate?.score ? `${candidate.score}%` : '—';
  $('#apexDataQuality').textContent = `${Number(engine.dataQuality || 0)}%`;
  $('#apexEvidenceFamilies').textContent = String(selection?.evidenceFamilies || candidate?.familyCount || '—');
  $('#apexRouteName').textContent = selection?.routeName || candidate?.name || 'No Apex route';
  $('#apexPrice').textContent = selection?.odds ? `Odds ${odd(selection.odds)}` : 'Odds —';
  $('#apexResultCard').className = `route-result-card apex-result-card ${String(selection?.decision || engine.decision || '').toLowerCase()}`;
  $('#apexChecks').innerHTML = (candidate?.checks || []).map(item => `<div class="route-check ${item.pass && !item.contradiction ? 'pass' : 'fail'}"><span>${item.pass && !item.contradiction ? '✓' : '×'}</span><div><b>${esc(item.label)}</b><small>${esc(item.actual)} · required ${esc(item.rule)}</small></div></div>`).join('') || '<div class="empty-state">No Apex checks available.</div>';
  $('#apexReasons').innerHTML = (selection?.reasons || [engine.explanation]).filter(Boolean).map(reason => `<li>${esc(reason)}</li>`).join('');
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


function renderMomentumEngineError() {
  $('#momentumSelection').textContent = 'Momentum unavailable';
  $('#momentumExplanation').textContent = 'Ordered form and goal streaks could not be calculated for this match.';
  $('#momentumDecision').textContent = 'UNAVAILABLE';
  $('#momentumScore').textContent = '—';
  $('#momentumRouteName').textContent = 'No momentum route';
  $('#momentumPrice').textContent = 'Odds —';
  $('#momentumTeamGrid').innerHTML = '';
  $('#momentumFamilies').innerHTML = '';
  $('#momentumChecks').innerHTML = '';
  $('#momentumReasons').innerHTML = '<li>Momentum evidence is unavailable.</li>';
}

function renderMomentumEngine(engine) {
  if (!engine) {
    $('#momentumSelection').textContent = 'Checking ordered streaks…';
    $('#momentumExplanation').textContent = 'Winning, unbeaten, winless, scoring, conceding and goal-line sequences must agree.';
    $('#momentumDecision').textContent = 'WAITING';
    $('#momentumScore').textContent = '—';
    $('#momentumRouteName').textContent = 'No momentum route yet';
    $('#momentumPrice').textContent = 'Odds —';
    $('#momentumTeamGrid').innerHTML = '<div class="loading">Loading sequence evidence…</div>';
    $('#momentumFamilies').innerHTML = '';
    $('#momentumChecks').innerHTML = '';
    $('#momentumReasons').innerHTML = '<li>Five verified home and away venue matches are required.</li>';
    return;
  }
  const selection = engine.selection;
  const candidate = selection
    ? (engine.candidates || []).find(item => item.id === selection.routeId)
    : [...(engine.candidates || [])].sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
  $('#momentumSelection').textContent = selection?.label || (engine.decision === 'CONFLICT' ? 'No Pick — Streak Conflict' : engine.decision === 'WAITING' ? 'Waiting for complete streak samples' : 'No qualifying momentum route');
  $('#momentumExplanation').textContent = engine.explanation || 'No momentum route qualified.';
  $('#momentumDecision').textContent = selection?.decision || engine.decision || 'NO SIGNAL';
  $('#momentumScore').textContent = selection?.score ? `${Number(selection.score).toFixed(0)}%` : candidate?.score ? `${Number(candidate.score).toFixed(0)}%` : '—';
  $('#momentumRouteName').textContent = selection?.routeName || candidate?.name || 'No momentum route';
  $('#momentumPrice').textContent = selection?.odds ? `Odds ${odd(selection.odds)}` : 'Odds —';
  $('#momentumResultCard').className = `route-result-card momentum-result-card ${String(selection?.decision || engine.decision || '').toLowerCase()}`;
  const teamCard = (label, split = {}) => {
    const form = (split.form || []).map(value => `<span class="form-dot ${String(value).toLowerCase()}">${esc(value)}</span>`).join('');
    const streaks = split.streaks || {};
    return `<article><small>${esc(label)}</small><div class="momentum-form-row"><div>${form || '<span class="muted">No form</span>'}</div><small>${Number(streaks.wins || 0)}W run · ${Number(streaks.unbeaten || 0)} unbeaten · ${Number(streaks.winless || 0)} winless</small></div></article>`;
  };
  $('#momentumTeamGrid').innerHTML = teamCard('HOME STREAK', engine.home) + teamCard('AWAY STREAK', engine.away);
  $('#momentumFamilies').innerHTML = (selection?.streakFamilies || candidate?.streakFamilies || []).map(value => `<span>${esc(String(value).replaceAll('_',' '))}</span>`).join('');
  $('#momentumChecks').innerHTML = (candidate?.checks || []).map(item => `<div class="route-check ${item.pass ? 'pass' : 'fail'}"><span>${item.pass ? '✓' : '×'}</span><div><b>${esc(item.label)}</b><small>${esc(item.actual)} · required ${esc(item.rule)}</small></div></div>`).join('') || '<div class="empty-state">No streak checks available.</div>';
  $('#momentumReasons').innerHTML = (selection?.reasons || candidate?.reasons || [engine.explanation]).filter(Boolean).slice(0, 8).map(reason => `<li>${esc(reason)}</li>`).join('');
}


function renderStreakValueEngineError() {
  $('#atlasSelection').textContent = 'Atlas is recovering';
  $('#atlasExplanation').textContent = 'The Stats API enrichment lane is temporarily unavailable. Cached evidence will be reused and the analysis will retry automatically.';
  $('#atlasDecision').textContent = 'RETRYING';
  $('#atlasScore').textContent = '—';
  $('#atlasRouteName').textContent = 'Waiting for streak evidence';
  $('#atlasPrice').textContent = 'Odds —';
  $('#atlasChecks').innerHTML = '<div class="loading">Retrying Stats API evidence…</div>';
}

function renderStreakValueEngine(engine) {
  if (!engine) {
    $('#atlasSelection').textContent = 'Checking Stats API streak value…';
    $('#atlasExplanation').textContent = 'Best/worst form and streaks must meet the 1.20–2.00 market gate; xG and SOT confirm goal routes.';
    $('#atlasDecision').textContent = 'WAITING';
    $('#atlasScore').textContent = '—';
    $('#atlasRouteName').textContent = 'No Atlas route yet';
    $('#atlasPrice').textContent = 'Odds —';
    $('#atlasChecks').innerHTML = '<div class="loading">Loading streak and value evidence…</div>';
    return;
  }
  const selection = engine.selection;
  const candidate = selection ? (engine.candidates || []).find(item => item.id === selection.routeId) : [...(engine.candidates || [])].sort((a,b)=>Number(b.score||0)-Number(a.score||0))[0];
  $('#atlasSelection').textContent = selection?.label || (engine.decision === 'WAITING' ? 'Waiting for Stats API samples' : engine.decision === 'CONFLICT' ? 'No pick — streak conflict' : 'No qualifying Atlas route');
  $('#atlasExplanation').textContent = engine.explanation || 'No streak-value route qualified.';
  $('#atlasDecision').textContent = selection?.decision || engine.decision || 'NO SIGNAL';
  $('#atlasScore').textContent = selection?.score ? `${Number(selection.score).toFixed(0)}%` : candidate?.score ? `${Number(candidate.score).toFixed(0)}%` : '—';
  $('#atlasRouteName').textContent = selection?.routeName || candidate?.name || 'No Atlas route';
  $('#atlasPrice').textContent = selection?.odds ? `Odds ${odd(selection.odds)}` : 'Odds —';
  $('#atlasResultCard').className = `route-result-card atlas-result-card ${String(selection?.decision || engine.decision || '').toLowerCase()}`;
  $('#atlasChecks').innerHTML = (candidate?.checks || []).map(item => `<div class="route-check ${item.pass ? 'pass' : 'fail'}"><span>${item.pass ? '✓' : '×'}</span><div><b>${esc(item.label)}</b><small>${esc(item.actual)} · required ${esc(item.rule)}</small></div></div>`).join('') || '<div class="empty-state">No Atlas checks available.</div>';
}

function renderHtftEngineError() {
  $('#htftSelection').textContent = 'Chronos is recovering';
  $('#htftExplanation').textContent = 'HT/FT history is temporarily unavailable. The shared history job will retry without blocking the match page.';
  $('#htftDecision').textContent = 'RETRYING';
  $('#htftScore').textContent = '—';
  $('#htftRouteName').textContent = 'Waiting for transition history';
  $('#htftPrice').textContent = 'Odds —';
  $('#htftChecks').innerHTML = '<div class="loading">Retrying HT/FT history…</div>';
}

function renderHtftEngine(engine) {
  if (!engine) {
    $('#htftSelection').textContent = 'Checking HT/FT transitions…';
    $('#htftExplanation').textContent = 'Lead-hold, draw-to-win, comeback and early-event patterns are checked against current momentum.';
    $('#htftDecision').textContent = 'WAITING';
    $('#htftScore').textContent = '—';
    $('#htftRouteName').textContent = 'No HT/FT route yet';
    $('#htftPrice').textContent = 'Odds —';
    $('#htftChecks').innerHTML = '<div class="loading">Loading transition evidence…</div>';
    return;
  }
  const selection = engine.selection;
  const candidate = selection ? (engine.candidates || []).find(item => item.id === selection.routeId) : [...(engine.candidates || [])].sort((a,b)=>Number(b.score||0)-Number(a.score||0))[0];
  $('#htftSelection').textContent = selection?.label || (engine.decision === 'WAITING' ? 'Waiting for HT/FT samples' : engine.decision === 'CONFLICT' ? 'No pick — transition conflict' : 'No qualifying HT/FT route');
  $('#htftExplanation').textContent = engine.explanation || 'No HT/FT transition route qualified.';
  $('#htftDecision').textContent = selection?.decision || engine.decision || 'NO SIGNAL';
  $('#htftScore').textContent = selection?.score ? `${Number(selection.score).toFixed(0)}%` : candidate?.score ? `${Number(candidate.score).toFixed(0)}%` : '—';
  $('#htftRouteName').textContent = selection?.routeName || candidate?.name || 'No HT/FT route';
  $('#htftPrice').textContent = selection?.odds ? `Odds ${odd(selection.odds)}` : 'Odds —';
  $('#htftResultCard').className = `route-result-card htft-result-card ${String(selection?.decision || engine.decision || '').toLowerCase()}`;
  $('#htftChecks').innerHTML = (candidate?.checks || []).map(item => `<div class="route-check ${item.pass ? 'pass' : 'fail'}"><span>${item.pass ? '✓' : '×'}</span><div><b>${esc(item.label)}</b><small>${esc(item.actual)} · required ${esc(item.rule)}</small></div></div>`).join('') || '<div class="empty-state">No HT/FT checks available.</div>';
}

function renderZeusEngineError() {
  $('#zeusSelection').textContent = 'Zeus is recovering';
  $('#zeusExplanation').textContent = 'The statistical supervisor is waiting for the shared evidence lanes to recover.';
  $('#zeusDecision').textContent = 'RETRYING';
  $('#zeusScore').textContent = '—';
  $('#zeusDataQuality').textContent = '—';
  $('#zeusDirection').textContent = '—';
  $('#zeusRouteName').textContent = 'Waiting for statistical evidence';
  $('#zeusPrice').textContent = 'Odds —';
  $('#zeusChecks').innerHTML = '<div class="loading">Rebuilding Zeus evidence…</div>';
}

function renderZeusEngine(engine) {
  if (!engine) {
    $('#zeusSelection').textContent = 'Assembling the statistical picture…';
    $('#zeusExplanation').textContent = 'Zeus supervises the seven specialist engines using raw statistics, data quality and contradiction control.';
    $('#zeusDecision').textContent = 'WAITING';
    $('#zeusScore').textContent = '—';
    $('#zeusDataQuality').textContent = '—';
    $('#zeusDirection').textContent = '—';
    $('#zeusRouteName').textContent = 'No Zeus direction yet';
    $('#zeusPrice').textContent = 'Odds —';
    $('#zeusChecks').innerHTML = '<div class="loading">Loading statistical evidence families…</div>';
    return;
  }
  const selection = engine.selection || null;
  const candidate = selection
    ? (engine.candidates || []).find(item => item.id === selection.routeId)
    : [...(engine.candidates || [])].sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0))[0];
  const verdict = engine.supervisor?.verdict || 'HOLD';
  $('#zeusSelection').textContent = selection?.label || (verdict === 'VETO' ? 'Zeus veto — statistical contradiction' : engine.decision === 'WAITING' ? 'Waiting for complete statistical evidence' : 'No Clear Statistical Edge');
  $('#zeusExplanation').textContent = engine.explanation || engine.supervisor?.reason || 'Zeus did not authorize a direction.';
  $('#zeusDecision').textContent = selection?.decision || verdict || engine.decision || 'HOLD';
  $('#zeusScore').textContent = Number(engine.confidence || 0) ? `${Math.round(Number(engine.confidence))}%` : '—';
  $('#zeusDataQuality').textContent = `${Math.round(Number(engine.dataQuality || 0))}/100`;
  $('#zeusDirection').textContent = String(engine.dominantDirection || 'NO CLEAR EDGE').replaceAll('_',' ');
  $('#zeusRouteName').textContent = selection?.routeName || candidate?.name || engine.supervisor?.reason || 'No Zeus route';
  $('#zeusPrice').textContent = selection?.odds ? `Odds ${odd(selection.odds)}` : 'Odds —';
  $('#zeusResultCard').className = `route-result-card zeus-result-card ${String(selection?.decision || verdict || '').toLowerCase()}`;
  const evidence = (candidate?.evidence || []).filter(item => item.available).sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,6);
  const contradictions = (engine.contradictions || candidate?.contradictions || []).slice(0,3);
  $('#zeusChecks').innerHTML = evidence.map(item => `<div class="route-check ${Number(item.score||0)>=62?'pass':'fail'}"><span>${Number(item.score||0)>=62?'✓':'·'}</span><div><b>${esc(item.label)}</b><small>${esc(item.detail)} · score ${Math.round(Number(item.score||0))}</small></div></div>`).join('')
    + contradictions.map(item => `<div class="route-check fail"><span>!</span><div><b>${esc(item.level)} · ${esc(item.label)}</b><small>${esc(item.detail)}</small></div></div>`).join('')
    || '<div class="empty-state">Zeus evidence is still building.</div>';
}

function renderConsensusEngineError() {
  $('#consensusSelection').textContent = 'Consensus unavailable';
  $('#consensusExplanation').textContent = 'The seven independent engine decisions and Zeus supervision could not be completed for this match.';
  $('#consensusDecision').textContent = 'UNAVAILABLE';
  $('#consensusScore').textContent = '—';
  $('#consensusMarket').textContent = 'No shared market';
  $('#consensusPrice').textContent = '—';
  $('#consensusAgreement').textContent = '0/7 engines agree';
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
    $('#consensusAgreement').textContent = '0/7 engines agree';
    $('#consensusFreeze').textContent = 'Provisional';
    $('#consensusMeter').style.width = '0%';
    $('#consensusEnginePicks').innerHTML = '<span class="engine-proof-chip"><b>Waiting</b><small>Engine routes are still loading</small></span>';
    $('#consensusConflicts').innerHTML = '';
    return;
  }
  const final = engine.final || null;
  const classification = String(engine.classification || 'NO_SIGNAL');
  $('#consensusSelection').textContent = final?.label || (classification === 'CONFLICT' ? 'No Banker — Engine Conflict' : classification === 'HOLD_MISSING_SHARED_PRICE' ? 'Agreement found — shared price missing' : classification === 'HOLD_DATA_VALIDATION' ? 'Agreement found — validating shared market data' : classification === 'ZEUS_HOLD' ? 'Zeus hold — statistical edge not authorized' : 'No shared engine direction');
  $('#consensusExplanation').textContent = (engine.reasons || [])[0] || (classification === 'CONFLICT' ? 'Opposing engine directions prevent a banker.' : classification === 'HOLD_DATA_VALIDATION' ? 'The exact shared market is waiting for independent statistical confirmation.' : classification === 'ZEUS_HOLD' ? (engine.zeus?.reason || 'Zeus found a material statistical contradiction.') : 'No compatible route agreement qualified.');
  $('#consensusDecision').textContent = classification.replaceAll('_', ' ');
  $('#consensusScore').textContent = Number(engine.score || 0) ? `${Number(engine.score).toFixed(0)}%` : '—';
  $('#consensusMarket').textContent = final?.label || 'No shared market';
  $('#consensusPrice').textContent = final?.odds ? odd(final.odds) : '—';
  $('#consensusAgreement').textContent = `${Number(engine.agreementCount || 0)}/7 engines agree`;
  $('#consensusFreeze').textContent = engine.status === 'FROZEN' ? 'Frozen before kickoff' : `Provisional · freezes ${engine.freezeMinutes || 30} min before kickoff`;
  $('#consensusMeter').style.width = `${Math.max(0, Math.min(100, Number(engine.agreementCount || 0) / 7 * 100))}%`;
  $('#consensusResultCard').className = `route-result-card consensus-result-card ${classification.toLowerCase().replaceAll('_', '-')}`;
  $('#consensusEnginePicks').innerHTML = (engine.enginePicks || []).map(item => `<span class="engine-proof-chip ${item.decision === 'FIRE' ? 'fire' : 'safer'}"><b>${esc(item.engineName || item.engine)}</b><small>${esc(item.label || item.market)} · ${esc(item.decision || '')}</small></span>`).join('') || '<span class="engine-proof-chip"><b>No qualified engines</b><small>Waiting for a complete route</small></span>';
  $('#consensusConflicts').innerHTML = (engine.conflictReasons || []).map(reason => `<p>× ${esc(reason)}</p>`).join('') + (engine.zeusVerdict ? `<p class="zeus-consensus-note">⚡ Zeus: ${esc(engine.zeusVerdict)}${engine.zeus?.confidence ? ` · ${Math.round(Number(engine.zeus.confidence))}/100` : ''}</p>` : '');
}

function highlightFavourite(side) {
  $('#homeOddCard').classList.toggle('favourite', side === 'home');
  $('#awayOddCard').classList.toggle('favourite', side === 'away');
  $('#drawOddCard').classList.remove('favourite');
}

function renderVenueForm(venueForm) {
  const grid = $('#venueFormGrid');
  if (!venueForm?.home && !venueForm?.away) {
    grid.innerHTML = '<div class="empty-state"><h3>Venue form is not available yet</h3><p>Market Route can still read odds, while Apex waits for both complete five-match venue samples.</p></div>';
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
  $('#statusFilter').addEventListener('change', event => {
    const quick = $('#quickStatusFilter');
    if (quick) quick.value = event.target.value;
    applyFilters();
  });
  $('#quickStatusFilter')?.addEventListener('change', event => {
    $('#statusFilter').value = event.target.value;
    applyFilters();
    $('#matchList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#searchInput').addEventListener('input', applyFilters);
  $('#closeMatchDialog').addEventListener('click', closeDialog);
  $('#matchIntelDialog').addEventListener('click', event => { if (event.target === $('#matchIntelDialog')) closeDialog(); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#matchIntelDialog').open) closeDialog(); });
  setupTabs();
}

buildWeekStrip();
setupEvents();
loadWinCarousel().catch(() => {});
loadPrecomputeStatus().catch(() => {});
setInterval(() => loadPrecomputeStatus().catch(() => {}), 30000);
loadDate(state.selectedDate);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
