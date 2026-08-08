import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  apiFootballConfigured,
  apiFootballRequest,
  apiFootballRateState,
  fixtureMatchScore,
  matchApiFootballFixture,
  enrichApiFootballVisuals,
  enrichApiFootballStatsBoard,
  getApiFootballIntelligence,
  getApiFootballFixtureBoard,
  getApiFootballFastFixtureBoard,
  getApiFootballFixtureCounts,
  getApiFootballLiveBoard,
  getApiFootballResults,
  getApiFootballFixtureEvents,
  normalizeApiFootballFixture
} from '../src/lib/apiFootball.mjs';
import { extractVenueStats } from '../src/lib/venueStats.mjs';

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
    server.on('error', reject);
  });
}

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function apiFixture({ id = 9001, date = '2035-06-15T18:00:00Z', homeId = 101, awayId = 202, home = 'Alpha FC', away = 'Beta United', homeGoals = null, awayGoals = null, status = 'NS' } = {}) {
  return {
    fixture: { id, date, timezone: 'UTC', venue: { id: 1, name: 'Test Ground' }, status: { short: status } },
    league: { id: 55, name: 'Premier Test', country: 'Ghana', season: 2035, logo: 'https://img.test/league.png', flag: 'https://img.test/gh.png' },
    teams: {
      home: { id: homeId, name: home, logo: `https://img.test/${homeId}.png` },
      away: { id: awayId, name: away, logo: `https://img.test/${awayId}.png` }
    },
    goals: { home: homeGoals, away: awayGoals },
    score: { halftime: { home: homeGoals == null ? null : Math.min(homeGoals, 1), away: awayGoals == null ? null : Math.min(awayGoals, 1) } }
  };
}

const sourceFixture = {
  id: '9001',
  sourceId: '9001',
  kickoff: '2035-06-15T18:00:00Z',
  league: { name: 'Premier Test', country: 'Ghana' },
  home: { name: 'Alpha FC' },
  away: { name: 'Beta United' },
  odds: { homeWin: 1.7, draw: 3.6, awayWin: 4.8 }
};

test('API-Football matcher respects team direction and kickoff', () => {
  const correct = apiFixture();
  const reversed = apiFixture({ id: 9002, homeId: 202, awayId: 101, home: 'Beta United', away: 'Alpha FC' });
  assert.ok(fixtureMatchScore(sourceFixture, correct) > 0.9);
  assert.equal(fixtureMatchScore(sourceFixture, reversed), 0);
  assert.equal(matchApiFootballFixture(sourceFixture, [reversed, correct])?.fixture?.fixture?.id, 9001);
});


test('seven-day fixture counts use one priority range request', async t => {
  const from = '2034-08-06';
  let fixtureCalls = 0;
  const rows = [
    apiFixture({ id: 4001, date: '2034-08-06T10:00:00Z' }),
    apiFixture({ id: 4002, date: '2034-08-07T10:00:00Z' }),
    apiFixture({ id: 4003, date: '2034-08-07T14:00:00Z' }),
    apiFixture({ id: 4004, date: '2034-08-09T10:00:00Z' })
  ];
  const { server, base } = await listen((req, res) => {
    const url = new URL(req.url, base);
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/fixtures' && url.searchParams.get('from') === from) {
      fixtureCalls += 1;
      return res.end(JSON.stringify({ response: rows, errors: [], paging: { current: 1, total: 1 } }));
    }
    return res.end(JSON.stringify({ response: [], errors: [], paging: { current: 1, total: 1 } }));
  });
  t.after(() => server.close());

  const keys = ['API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER','API_FOOTBALL_RETRIES','API_FOOTBALL_REQUEST_MIN_INTERVAL_MS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    API_FOOTBALL_KEY: 'range-key',
    API_FOOTBALL_BASE_URL: base,
    API_FOOTBALL_KEY_HEADER: 'x-apisports-key',
    API_FOOTBALL_RETRIES: '0',
    API_FOOTBALL_REQUEST_MIN_INTERVAL_MS: '0'
  });
  t.after(() => restoreEnv(previous));

  const result = await getApiFootballFixtureCounts(from, 7);
  assert.equal(fixtureCalls, 1);
  assert.equal(result.counts.find(row => row.date === '2034-08-06').count, 1);
  assert.equal(result.counts.find(row => row.date === '2034-08-07').count, 2);
  assert.equal(result.counts.find(row => row.date === '2034-08-08').count, 0);
  assert.equal(result.total, 4);
});

test('API_FOOTBALL_KEY supplies crests, venue history and deep intelligence server-side', async t => {
  const requests = [];
  const historyHome = Array.from({ length: 6 }, (_, index) => apiFixture({
    id: 8000 + index,
    date: `2035-06-${String(10 - index).padStart(2, '0')}T18:00:00Z`,
    homeId: 101,
    awayId: 300 + index,
    home: 'Alpha FC',
    away: `Home Opponent ${index}`,
    homeGoals: index < 4 ? 2 : 1,
    awayGoals: index < 4 ? 0 : 1,
    status: 'FT'
  }));
  const historyAway = Array.from({ length: 6 }, (_, index) => apiFixture({
    id: 7000 + index,
    date: `2035-06-${String(10 - index).padStart(2, '0')}T18:00:00Z`,
    homeId: 400 + index,
    awayId: 202,
    home: `Away Opponent ${index}`,
    away: 'Beta United',
    homeGoals: index < 3 ? 0 : 1,
    awayGoals: index < 3 ? 1 : 1,
    status: 'FT'
  }));

  const { server, base } = await listen((req, res) => {
    assert.equal(req.headers['x-apisports-key'], 'test-api-football-key');
    const url = new URL(req.url, base);
    requests.push(`${url.pathname}?${url.searchParams.toString()}`);
    res.setHeader('content-type', 'application/json');
    const send = response => res.end(JSON.stringify({ response, errors: [] }));

    if (url.pathname === '/fixtures' && url.searchParams.has('date')) return send([apiFixture()]);
    if (url.pathname === '/fixtures' && url.searchParams.get('team') === '101') return send(historyHome);
    if (url.pathname === '/fixtures' && url.searchParams.get('team') === '202') return send(historyAway);
    if (url.pathname === '/standings') return send([{ league: { id: 55, name: 'Premier Test', country: 'Ghana', season: 2035, standings: [[{ rank: 1, team: { id: 101, name: 'Alpha FC' }, points: 40 }, { rank: 4, team: { id: 202, name: 'Beta United' }, points: 31 }]] } }]);
    if (url.pathname === '/teams/statistics') return res.end(JSON.stringify({ response: { form: 'WWDWL', fixtures: { played: { total: 20 } }, goals: { for: { average: { total: '1.80' } }, against: { average: { total: '1.00' } } }, clean_sheet: { total: 8 }, failed_to_score: { total: 3 } }, errors: [] }));
    if (url.pathname === '/fixtures/headtohead') return send([historyHome[0], historyAway[0]]);
    if (url.pathname === '/predictions') return send([{ predictions: { winner: { name: 'Alpha FC' }, advice: 'Double chance: Alpha FC or draw' } }]);
    if (url.pathname === '/injuries') return send([{ player: { id: 9, name: 'Test Player' }, team: { id: 202, name: 'Beta United' } }]);
    if (url.pathname === '/fixtures/statistics') return send([{ team: { id: 101, name: 'Alpha FC' }, statistics: [{ type: 'Shots on Goal', value: 6 }] }]);
    if (url.pathname === '/fixtures/lineups') return send([{ team: { id: 101, name: 'Alpha FC' }, formation: '4-3-3' }]);
    if (url.pathname === '/fixtures/events') return send([{ time: { elapsed: 12 }, team: { id: 101 }, type: 'Goal' }]);
    if (url.pathname === '/fixtures/players') return send([{ team: { id: 101 }, players: [] }]);
    if (url.pathname === '/teams') return send([{ team: { id: 101, name: 'Alpha FC', logo: 'https://img.test/101.png' }, venue: { country: 'Ghana' } }]);
    return send([]);
  });
  t.after(() => server.close());

  const keys = [
    'API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER','API_FOOTBALL_RETRIES',
    'API_FOOTBALL_DEEP_STATS','API_FOOTBALL_HISTORY_LAST','API_FOOTBALL_MAPPING_THRESHOLD'
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    API_FOOTBALL_KEY: 'test-api-football-key',
    API_FOOTBALL_BASE_URL: base,
    API_FOOTBALL_KEY_HEADER: 'x-apisports-key',
    API_FOOTBALL_RETRIES: '0',
    API_FOOTBALL_DEEP_STATS: 'true',
    API_FOOTBALL_HISTORY_LAST: '40',
    API_FOOTBALL_MAPPING_THRESHOLD: '0.55'
  });
  t.after(() => restoreEnv(previous));

  assert.equal(apiFootballConfigured(), true);
  const visuals = await enrichApiFootballVisuals('2035-06-15', [sourceFixture]);
  assert.equal(visuals.source, 'API_FOOTBALL');
  assert.equal(visuals.visuals[0].home.logo, 'https://img.test/101.png');
  assert.equal(visuals.visuals[0].away.logo, 'https://img.test/202.png');
  assert.equal(visuals.visuals[0].league.logo, 'https://img.test/league.png');

  const intelligence = await getApiFootballIntelligence({ date: '2035-06-15', homeName: 'Alpha FC', awayName: 'Beta United' }, sourceFixture, { mode: 'deep' });
  assert.equal(intelligence.mapped, true);
  assert.equal(intelligence.home.history.length, 5);
  assert.equal(intelligence.away.history.length, 5);
  assert.equal(intelligence.standings.standings[0][0].rank, 1);
  assert.equal(intelligence.teamStatistics.home.form, 'WWDWL');
  assert.equal(intelligence.h2h.length, 2);
  assert.equal(intelligence.injuries.length, 1);
  assert.equal(intelligence.fixtureStatistics[0].statistics[0].type, 'Shots on Goal');
  assert.equal(intelligence.lineups[0].formation, '4-3-3');
  assert.equal(intelligence.events[0].type, 'Goal');

  const stats = extractVenueStats(intelligence, { homeName: 'Alpha FC', awayName: 'Beta United' });
  assert.equal(stats.samples.complete, true);
  assert.equal(stats.homeSplit.played, 5);
  assert.equal(stats.awaySplit.played, 5);
  assert.ok(requests.some(value => value.startsWith('/standings?')));
  assert.ok(requests.some(value => value.startsWith('/fixtures%2Fstatistics?')) === false);
  assert.ok(requests.some(value => value.startsWith('/fixtures/statistics?')));
});


test('API-Football engine enrichment has no 30-fixture daily cap', async t => {
  const match = apiFixture({ id: 9901, date: '2036-01-10T15:00:00Z' });
  const { server, base } = await listen((req, res) => {
    assert.equal(req.headers['x-apisports-key'], 'no-cap-key');
    const url = new URL(req.url, base);
    res.setHeader('content-type', 'application/json');
    const send = response => res.end(JSON.stringify({ response, errors: [] }));
    if (url.pathname === '/fixtures' && url.searchParams.has('date')) return send([match]);
    if (url.pathname === '/fixtures') return send([]);
    if (url.pathname === '/teams/statistics') return res.end(JSON.stringify({ response: {}, errors: [] }));
    return send([]);
  });
  t.after(() => server.close());

  const keys = ['API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER','API_FOOTBALL_RETRIES','API_FOOTBALL_ENRICH_CONCURRENCY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    API_FOOTBALL_KEY: 'no-cap-key',
    API_FOOTBALL_BASE_URL: base,
    API_FOOTBALL_KEY_HEADER: 'x-apisports-key',
    API_FOOTBALL_RETRIES: '0',
    API_FOOTBALL_ENRICH_CONCURRENCY: '4'
  });
  t.after(() => restoreEnv(previous));

  const fixtures = Array.from({ length: 45 }, (_, index) => ({
    ...sourceFixture,
    id: `day-${index + 1}`,
    sourceId: `day-${index + 1}`, 
    kickoff: '2036-01-10T15:00:00Z'
  }));
  const enriched = await enrichApiFootballStatsBoard('2036-01-10', fixtures);
  assert.equal(enriched.fixtureScope, 'ALL_DAILY_FIXTURES_RETURNED_BY_PROVIDER');
  assert.equal(enriched.fixtures.length, 45);
  assert.match(enriched.warning || '', /venue histories were unavailable/i);
  assert.ok(enriched.fixtures.every(row => row.apiFootballFixtureId === 9901));
});

test('API-Football alone supplies daily fixtures, paginated odds, live scores, results and events', async t => {
  const date = '2037-02-14';
  const scheduled = apiFixture({ id: 12001, date: `${date}T14:00:00Z`, status: 'NS' });
  const second = apiFixture({ id: 12002, date: `${date}T16:00:00Z`, homeId: 303, awayId: 404, home: 'Gamma FC', away: 'Delta FC', status: 'NS' });
  const liveRow = apiFixture({ id: 12003, date: `${date}T18:00:00Z`, homeGoals: 2, awayGoals: 1, status: '2H' });
  liveRow.fixture.status.elapsed = 67;
  const resultRow = apiFixture({ id: 12004, date: `${date}T12:00:00Z`, homeGoals: 3, awayGoals: 1, status: 'FT' });
  const bookmaker = (fixtureId, homeOdd) => ({
    fixture: { id: fixtureId },
    update: `${date}T10:00:00Z`,
    bookmakers: [{
      id: 8,
      name: 'Test Book',
      bets: [
        { name: 'Match Winner', values: [{ value: 'Home', odd: String(homeOdd) }, { value: 'Draw', odd: '3.60' }, { value: 'Away', odd: '4.80' }] },
        { name: 'Goals Over/Under', values: [{ value: 'Over 2.5', odd: '1.72' }, { value: 'Under 2.5', odd: '2.05' }] },
        { name: 'Both Teams To Score', values: [{ value: 'Yes', odd: '1.75' }, { value: 'No', odd: '1.95' }] }
      ]
    }]
  });

  const { server, base } = await listen((req, res) => {
    assert.equal(req.headers['x-apisports-key'], 'sole-source-key');
    const url = new URL(req.url, base);
    res.setHeader('content-type', 'application/json');
    const send = (response, paging = { current: 1, total: 1 }) => res.end(JSON.stringify({ response, errors: [], paging }));
    if (url.pathname === '/fixtures' && url.searchParams.get('date') === date) return send([scheduled, second, resultRow]);
    if (url.pathname === '/fixtures' && url.searchParams.get('live') === 'all') return send([liveRow]);
    if (url.pathname === '/odds') {
      const page = Number(url.searchParams.get('page') || 1);
      return page === 1 ? send([bookmaker(12001, 1.70)], { current: 1, total: 2 }) : send([bookmaker(12002, 1.88)], { current: 2, total: 2 });
    }
    if (url.pathname === '/fixtures/events') return send([{ time: { elapsed: 67, extra: null }, team: { id: 101, name: 'Alpha FC' }, player: { id: 9, name: 'Scorer' }, type: 'Goal', detail: 'Normal Goal' }]);
    return send([]);
  });
  t.after(() => server.close());

  const keys = ['API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER','API_FOOTBALL_RETRIES','API_FOOTBALL_MAX_ODDS_PAGES'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    API_FOOTBALL_KEY: 'sole-source-key',
    API_FOOTBALL_BASE_URL: base,
    API_FOOTBALL_KEY_HEADER: 'x-apisports-key',
    API_FOOTBALL_RETRIES: '0',
    API_FOOTBALL_MAX_ODDS_PAGES: '0'
  });
  t.after(() => restoreEnv(previous));

  const board = await getApiFootballFixtureBoard(date);
  assert.equal(board.source, 'API_FOOTBALL');
  assert.equal(board.fixtures.length, 3);
  assert.equal(board.oddsPages, 2);
  assert.equal(board.fixtures.find(row => row.id === '12001').odds.homeWin, 1.70);
  assert.equal(board.fixtures.find(row => row.id === '12001').odds.over25, 1.72);
  assert.equal(board.fixtures.find(row => row.id === '12002').odds.homeWin, 1.88);
  assert.equal(board.fixtures[0].home.logo.startsWith('https://img.test/'), true);

  const live = await getApiFootballLiveBoard();
  assert.equal(live.source, 'API_FOOTBALL');
  assert.equal(live.fixtures[0].minute, 67);
  assert.equal(live.fixtures[0].score.home, 2);

  const results = await getApiFootballResults(date);
  assert.equal(results.source, 'API_FOOTBALL');
  assert.equal(results.fixtures.length, 1);
  assert.equal(results.fixtures[0].status, 'FT');
  assert.equal(results.fixtures[0].score.home, 3);

  const events = await getApiFootballFixtureEvents(12003);
  assert.equal(events[0].minute, 67);
  assert.equal(events[0].type, 'Goal');

  const normalized = normalizeApiFootballFixture(scheduled, bookmaker(12001, 1.70));
  assert.equal(normalized.rawSource, 'API_FOOTBALL');
  assert.equal(normalized.league.logo, 'https://img.test/league.png');
  assert.equal(normalized.availableMarketCount >= 7, true);
});


test('API-Football 200-body minute-limit errors enter cooldown and retry automatically', async t => {
  let calls = 0;
  const { server, base } = await listen((req, res) => {
    calls += 1;
    res.setHeader('content-type', 'application/json');
    if (calls === 1) {
      return res.end(JSON.stringify({ response: [], errors: { requests: 'Too many requests. You have exceeded the limit of requests per minute of your subscription.' } }));
    }
    return res.end(JSON.stringify({ response: [{ ok: true }], errors: [] }));
  });
  t.after(() => server.close());

  const keys = [
    'API_FOOTBALL_KEY','API_FOOTBALL_BASE_URL','API_FOOTBALL_KEY_HEADER','API_FOOTBALL_RETRIES',
    'API_FOOTBALL_RATE_LIMIT_RETRIES','API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS','API_FOOTBALL_REQUESTS_PER_MINUTE',
    'API_FOOTBALL_REQUEST_CONCURRENCY','API_FOOTBALL_REQUEST_MIN_INTERVAL_MS'
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    API_FOOTBALL_KEY: 'rate-key',
    API_FOOTBALL_BASE_URL: base,
    API_FOOTBALL_KEY_HEADER: 'x-apisports-key',
    API_FOOTBALL_RETRIES: '0',
    API_FOOTBALL_RATE_LIMIT_RETRIES: '2',
    API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS: '50',
    API_FOOTBALL_REQUESTS_PER_MINUTE: '600',
    API_FOOTBALL_REQUEST_CONCURRENCY: '1',
    API_FOOTBALL_REQUEST_MIN_INTERVAL_MS: '0'
  });
  t.after(() => restoreEnv(previous));

  const body = await apiFootballRequest('/rate-limit-recovery', { test: Date.now() }, 1);
  assert.equal(body.response[0].ok, true);
  assert.equal(calls, 2);
  const state = apiFootballRateState();
  assert.ok(state.rateLimitCount >= 1);
  assert.equal(typeof state.queueDepth, 'number');
});
