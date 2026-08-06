import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEventsFromObject, normalizeEvent, normalizedOddsFromMarkets, publicFixture } from '../src/parser.mjs';

const fixturePayload = {
  bizCode: 10000,
  data: {
    tournamentList: [{
      tournamentId: 'sr:tournament:17',
      tournamentName: 'Premier League',
      categoryName: 'England',
      events: [{
        eventId: 'sr:match:998877',
        gameId: '998877',
        estimateStartTime: 1785942000000,
        homeTeamName: 'Home United',
        awayTeamName: 'Away City',
        eventStatusDesc: 'Not start',
        markets: [
          { id: '1', desc: '1X2', outcomes: [
            { id: '1', desc: 'Home', odd: '1.72' },
            { id: '2', desc: 'Draw', odd: '3.55' },
            { id: '3', desc: 'Away', odd: '4.60' }
          ]},
          { id: 'dc', desc: 'Double Chance', outcomes: [
            { desc: '1X', odd: '1.18' }, { desc: '12', odd: '1.25' }, { desc: 'X2', odd: '2.00' }
          ]},
          { id: 'tg25', desc: 'Total Goals 2.5', outcomes: [
            { desc: 'Over', odd: '1.66' }, { desc: 'Under', odd: '2.08' }
          ]},
          { id: 'btts', desc: 'Both Teams To Score', outcomes: [
            { desc: 'Yes', odd: '1.73' }, { desc: 'No', odd: '1.95' }
          ]},
          { id: 'htt', desc: 'Home Team Total 1.5', outcomes: [
            { desc: 'Over', odd: '1.80' }, { desc: 'Under', odd: '1.88' }
          ]},
          { id: 'att', desc: 'Away Team Total 0.5', outcomes: [
            { desc: 'Over', odd: '1.55' }, { desc: 'Under', odd: '2.25' }
          ]},
          { id: 'fh', desc: 'First Half 1X2', outcomes: [
            { desc: 'Home', odd: '2.25' }, { desc: 'Draw', odd: '2.10' }, { desc: 'Away', odd: '4.80' }
          ]},
          { id: 'htft', desc: 'Half Time Full Time', outcomes: [
            { desc: 'Home/Home', odd: '2.70' }, { desc: 'Draw/Home', odd: '4.50' }
          ]}
        ]
      }]
    }]
  }
};

test('parses SportyBet fixtures and full common markets', () => {
  const rows = collectEventsFromObject(fixturePayload);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.id, 'sr:match:998877');
  assert.equal(row.home_team, 'Home United');
  assert.equal(row.away_team, 'Away City');
  assert.equal(row.league, 'Premier League');
  assert.equal(row.country, 'England');
  assert.equal(row.odds.homeWin, 1.72);
  assert.equal(row.odds.draw, 3.55);
  assert.equal(row.odds.awayWin, 4.60);
  assert.equal(row.odds.doubleChance1X, 1.18);
  assert.equal(row.odds.doubleChanceX2, 2.00);
  assert.equal(row.odds.over25, 1.66);
  assert.equal(row.odds.under25, 2.08);
  assert.equal(row.odds.bttsYes, 1.73);
  assert.equal(row.odds.bttsNo, 1.95);
  assert.equal(row.odds.homeOver15, 1.80);
  assert.equal(row.odds.awayOver05, 1.55);
  assert.equal(row.odds.firstHalfHome, 2.25);
  assert.equal(row.odds.firstHalfDraw, 2.10);
  assert.equal(row.odds.htft11, 2.70);
  assert.equal(row.odds.htftX1, 4.50);
  assert.equal(row.market_count, 8);
});

test('normalizes live score, minute, half-time score and incidents', () => {
  const row = normalizeEvent({
    eventId: 'live-1', homeTeamName: 'A', awayTeamName: 'B',
    eventStatusDesc: '2nd Half', minute: 67,
    score: '2:1', halfTimeScore: '1:0',
    incidents: [{ minute: 67, type: 'goal', teamName: 'A', playerName: 'Player One' }],
    markets: [{ id: '1', desc: '1X2', outcomes: [{desc:'Home',odd:'1.10'},{desc:'Draw',odd:'9.0'},{desc:'Away',odd:'25'}] }]
  });
  assert.equal(row.status, '2H');
  assert.equal(row.minute, 67);
  assert.deepEqual(row.score, { home: 2, away: 1, halftimeHome: 1, halftimeAway: 0 });
  assert.equal(row.events[0].type, 'goal');
  const publicRow = publicFixture(row, { includeMarkets: true, includeEvents: true });
  assert.equal(publicRow.score.home, 2);
  assert.equal(publicRow.events.length, 1);
});

test('finished fixtures retain final score for settlement', () => {
  const row = normalizeEvent({
    eventId: 'result-1', homeTeamName: 'C', awayTeamName: 'D',
    eventStatusDesc: 'Finished', homeScore: 3, awayScore: 0,
    halfTimeHome: 1, halfTimeAway: 0
  });
  assert.equal(row.status, 'FT');
  assert.equal(row.score.home, 3);
  assert.equal(row.score.away, 0);
});

test('odds parser does not invent missing prices', () => {
  const odds = normalizedOddsFromMarkets([{ id: '1', name: '1X2', line: null, outcomes: [{id:'1',name:'Home',odds:1.7}] }]);
  assert.equal(odds.homeWin, 1.7);
  assert.equal(odds.draw, undefined);
  assert.equal(odds.awayWin, undefined);
});
