import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  resolveDataApiConfig,
  normalizeFixture,
  fetchDataApiFixtures,
  enrichDataApiFixtures,
  enrichDataApiMarketOdds,
  getDataApiLiveFixtures,
  isSrlFixture
} from '../src/lib/dataApi.mjs';
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

test('Betynz Data API configuration uses only the dedicated variables', () => {
  const config = resolveDataApiConfig({
    BETYNZ_DATA_API_BASE_URL: 'https://api.example/sportybet/',
    BETYNZ_DATA_API_KEY: 'secret',
    BETYNZ_DATA_API_FIXTURES_PATH: 'search_matches?date={date}&page=1&page_size=100'
  });
  assert.equal(config.configured, true);
  assert.equal(config.mode, 'CUSTOM_DATA_API');
  assert.equal(config.pathTemplate, 'search_matches?date={date}&page=1&page_size=100');
});

test('Betynz Data API fixture normalization preserves 1X2, goals and media', () => {
  const fixture = normalizeFixture({
    id: 'sporty-100',
    date: '2031-04-05',
    time: '19:00',
    home_team: { name: 'Alpha FC', logo: '/res/img/team/alpha.png' },
    away_team: { name: 'Beta FC', logo: '/res/img/team/beta.png' },
    league: { name: 'Premier A', country: 'Ghana' },
    odds: { home: 1.52, draw: 3.80, away: 6.20, over15: 1.25, under25: 1.55, under35: 1.22 }
  }, 0, '2031-04-05');
  assert.equal(fixture.sourceId, 'sporty-100');
  assert.equal(fixture.odds.homeWin, 1.52);
  assert.equal(fixture.odds.draw, 3.80);
  assert.equal(fixture.odds.awayWin, 6.20);
  assert.equal(fixture.odds.over15, 1.25);
  assert.match(fixture.home.logo, /^https:\/\/www\.sportybet\.com\//);
});

test('Betynz Data API fixture detail enriches Market Route markets', async t => {
  const targetDate = '2031-04-05';
  const { server, base } = await listen((req, res) => {
    const url = new URL(req.url, base);
    assert.equal(url.pathname, '/get_fixture_stats');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      fixture: {
        id: 'be-detail-1', date: targetDate, time: '19:00',
        home_team: { name: 'Alpha FC', logo: '/res/img/team/alpha.png' },
        away_team: { name: 'Beta FC', logo: '/res/img/team/beta.png' },
        league: { name: 'Premier A', country: 'Ghana' },
        odds: {
          home: 1.48, draw: 3.90, away: 6.40,
          over15: 1.22, over25: 1.62, under25: 2.15, under35: 1.55,
          bttsYes: 1.72, bttsNo: 1.50,
          homeOver05: 1.12, homeOver15: 1.48,
          awayOver05: 1.75, awayOver15: 3.10,
          homeDoubleChance: 1.08
        }
      }
    }));
  });
  t.after(() => server.close());

  const keys = ['BETYNZ_DATA_API_BASE_URL','BETYNZ_DATA_API_KEY','BETYNZ_DATA_API_FIXTURE_STATS_PATH'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    BETYNZ_DATA_API_BASE_URL: base,
    BETYNZ_DATA_API_KEY: 'test-key',
    BETYNZ_DATA_API_FIXTURE_STATS_PATH: 'get_fixture_stats'
  });
  t.after(() => restoreEnv(previous));

  const fixture = normalizeFixture({
    id: 'be-detail-1', date: targetDate, time: '19:00',
    home_team: { name: 'Alpha FC' }, away_team: { name: 'Beta FC' },
    league: { name: 'Premier A', country: 'Ghana' },
    odds: { home: 1.48, draw: 3.90, away: 6.40 }
  }, 0, targetDate);

  const result = await enrichDataApiMarketOdds(targetDate, [fixture]);
  const enriched = result.fixtures[0];
  assert.equal(enriched.odds.under35, 1.55);
  assert.equal(enriched.odds.bttsNo, 1.50);
  assert.equal(enriched.odds.homeOver15, 1.48);
  assert.equal(enriched.odds.awayOver05, 1.75);
  assert.ok(enriched.availableMarketCount >= 10);
});

test('Betynz Data API fixture board loads every real match and excludes SRL', async t => {
  const targetDate = '2032-07-08';
  const { server, base } = await listen((req, res) => {
    assert.equal(req.headers['x-api-key'], 'test-key');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      matches: [
        {
          id: 'real-1', date: targetDate, time: '18:30',
          home_team: { name: 'Real Alpha' }, away_team: { name: 'Real Beta' },
          league: { name: 'National League', country: 'Ghana' },
          odds: { home: 1.80, draw: 3.20, away: 4.10 }
        },
        {
          id: 'srl-1', date: targetDate, time: '19:00',
          home_team: { name: 'Alpha SRL' }, away_team: { name: 'Beta SRL' },
          league: { name: 'Simulated Reality League', country: 'International' },
          odds: { home: 2.00, draw: 3.20, away: 3.40 }
        }
      ]
    }));
  });
  t.after(() => server.close());

  const keys = ['BETYNZ_DATA_API_BASE_URL','BETYNZ_DATA_API_KEY','BETYNZ_DATA_API_FIXTURES_PATH','BETYNZ_DATA_API_MAX_PAGES'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    BETYNZ_DATA_API_BASE_URL: base,
    BETYNZ_DATA_API_KEY: 'test-key',
    BETYNZ_DATA_API_FIXTURES_PATH: 'search_matches?date={date}&page=1&page_size=100',
    BETYNZ_DATA_API_MAX_PAGES: '0',
  });
  t.after(() => restoreEnv(previous));

  const result = await fetchDataApiFixtures(targetDate);
  assert.equal(result.source, 'SPORTYBET_CUSTOM_API');
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.fixtures[0].sourceId, 'real-1');
  assert.equal(isSrlFixture(result.fixtures[0]), false);
});

test('Betynz Data API histories create complete venue PPG samples', async t => {
  const targetDate = '2033-09-10';
  const homeMatches = Array.from({ length: 5 }, (_, index) => ({
    id: `h-${index}`, date: `2033-09-0${5-index}`, home_team: 'Alpha FC', away_team: `H Opp ${index}`,
    score: index < 4 ? '2:0' : '1:1'
  }));
  const awayMatches = Array.from({ length: 5 }, (_, index) => ({
    id: `a-${index}`, date: `2033-09-0${5-index}`, home_team: `A Opp ${index}`, away_team: 'Beta FC',
    score: index < 3 ? '0:1' : '1:1'
  }));

  const { server, base } = await listen((req, res) => {
    const url = new URL(req.url, base);
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/get_team_history') {
      res.end(JSON.stringify({ matches: url.searchParams.get('team') === 'home' ? homeMatches : awayMatches }));
      return;
    }
    if (url.pathname === '/get_fixture_stats') {
      res.end(JSON.stringify({ fixture: { id: 'be-stats-1' } }));
      return;
    }
    res.end(JSON.stringify({ data: [] }));
  });
  t.after(() => server.close());

  const keys = [
    'BETYNZ_DATA_API_BASE_URL','BETYNZ_DATA_API_KEY','BETYNZ_DATA_API_FIXTURE_STATS_PATH',
    'BETYNZ_DATA_API_TEAM_HISTORY_PATH','BETYNZ_DATA_API_TEAM_STREAKS_PATH','BETYNZ_DATA_API_STANDINGS_PATH',
    'BETYNZ_DATA_API_COMPETITION_STATS_PATH','BETYNZ_DATA_API_ENRICH_CONCURRENCY'
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    BETYNZ_DATA_API_BASE_URL: base,
    BETYNZ_DATA_API_KEY: 'test-key',
    BETYNZ_DATA_API_FIXTURE_STATS_PATH: 'get_fixture_stats',
    BETYNZ_DATA_API_TEAM_HISTORY_PATH: 'get_team_history',
    BETYNZ_DATA_API_TEAM_STREAKS_PATH: 'get_team_streaks',
    BETYNZ_DATA_API_STANDINGS_PATH: 'get_standings',
    BETYNZ_DATA_API_COMPETITION_STATS_PATH: 'get_competition_stats',
    BETYNZ_DATA_API_ENRICH_CONCURRENCY: '2'
  });
  t.after(() => restoreEnv(previous));

  const fixture = normalizeFixture({
    id: 'be-stats-1', date: targetDate, time: '18:00',
    home_team: { name: 'Alpha FC' }, away_team: { name: 'Beta FC' },
    league: { name: 'Premier A', country: 'Ghana' }, odds: { home: 1.75, draw: 3.40, away: 4.50 }
  }, 0, targetDate);

  const result = await enrichDataApiFixtures(targetDate, [fixture], extractVenueStats);
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.fixtures[0].stats.samples.complete, true);
  assert.equal(result.fixtures[0].stats.homeSplit.played, 5);
  assert.equal(result.fixtures[0].stats.awaySplit.played, 5);
  assert.ok(result.fixtures[0].stats.homeSplit.ppg > 2);
  assert.ok(result.fixtures[0].stats.awaySplit.ppg >= 2);
});


test('SportyBet live feed preserves score minute half-time and incidents', async t => {
  const targetDate = '2034-01-15';
  const { server, base } = await listen((req, res) => {
    assert.equal(req.headers['x-api-key'], 'test-key');
    const url = new URL(req.url, base);
    assert.equal(url.pathname, '/live');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      source: 'SPORTYBET_CUSTOM_API',
      fixtures: [{
        id: 'sr:match:live-100',
        kickoff: `${targetDate}T18:00:00Z`,
        status: '2H',
        minute: 67,
        home_team: { name: 'Alpha FC' },
        away_team: { name: 'Beta FC' },
        league: { name: 'Premier A', country: 'Ghana' },
        score: { home: 2, away: 1, halftimeHome: 1, halftimeAway: 0 },
        events: [{ minute: 67, type: 'goal', team: 'home' }],
        odds: { homeWin: 1.20, draw: 6.00, awayWin: 15.00 }
      }]
    }));
  });
  t.after(() => server.close());

  const keys = ['BETYNZ_DATA_API_BASE_URL','BETYNZ_DATA_API_KEY','BETYNZ_DATA_API_LIVE_PATH'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    BETYNZ_DATA_API_BASE_URL: base,
    BETYNZ_DATA_API_KEY: 'test-key',
    BETYNZ_DATA_API_LIVE_PATH: 'live'
  });
  t.after(() => restoreEnv(previous));

  const result = await getDataApiLiveFixtures(targetDate);
  assert.equal(result.source, 'SPORTYBET_CUSTOM_API');
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.fixtures[0].minute, 67);
  assert.equal(result.fixtures[0].score.home, 2);
  assert.equal(result.fixtures[0].score.htHome, 1);
  assert.equal(result.fixtures[0].events.length, 1);
});
