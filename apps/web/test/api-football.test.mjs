import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  apiFootballConfigured,
  fixtureMatchScore,
  matchApiFootballFixture,
  enrichApiFootballVisuals,
  enrichApiFootballStatsBoard,
  getApiFootballIntelligence
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
  id: 'sr:match:alpha-beta',
  sourceId: 'sr:match:alpha-beta',
  kickoff: '2035-06-15T18:00:00Z',
  league: { name: 'Premier Test', country: 'Ghana' },
  home: { name: 'Alpha FC' },
  away: { name: 'Beta United' },
  odds: { homeWin: 1.7, draw: 3.6, awayWin: 4.8 }
};

test('API-Football matcher respects team direction and kickoff', () => {
  const correct = apiFixture();
  const reversed = apiFixture({ homeId: 202, awayId: 101, home: 'Beta United', away: 'Alpha FC' });
  assert.ok(fixtureMatchScore(sourceFixture, correct) > 0.9);
  assert.equal(fixtureMatchScore(sourceFixture, reversed), 0);
  assert.equal(matchApiFootballFixture(sourceFixture, [reversed, correct])?.fixture?.fixture?.id, 9001);
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
    id: `sr:match:no-cap-${index + 1}`,
    sourceId: `sr:match:no-cap-${index + 1}`,
    kickoff: '2036-01-10T15:00:00Z'
  }));
  const enriched = await enrichApiFootballStatsBoard('2036-01-10', fixtures);
  assert.equal(enriched.fixtureScope, 'ALL_DAILY_FIXTURES');
  assert.equal(enriched.fixtures.length, 45);
  assert.equal(enriched.warning, null);
  assert.ok(enriched.fixtures.every(row => row.apiFootballFixtureId === 9901));
});
