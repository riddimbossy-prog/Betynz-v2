import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compileSelection } from '../src/engine/markets.mjs';
import { applyScore, grade, scoreFromPayload, verdictOf } from '../public/settle.js';

const market = (name, outcome, specifier = '') => ({ id: 1, desc: name, specifier, outcomes: [{ desc: outcome, odds: 1.4 }] });

test('browser grader matches the engine on full-time markets', () => {
  const cases = [
    ['1x2', 'Home', { home: 2, away: 0 }],
    ['1x2', 'Draw', { home: 1, away: 1 }],
    ['Over/Under', 'Over 1.5', { home: 1, away: 1 }],
    ['Over/Under', 'Under 2.5', { home: 2, away: 1 }],
    ['Both teams to score', 'Yes', { home: 1, away: 0 }],
    ['Double chance', 'Home or Draw', { home: 0, away: 1 }],
    ['Draw no bet', 'Home', { home: 1, away: 1 }],
    ['Home team clean sheet', 'Yes', { home: 1, away: 0 }],
  ];
  for (const [name, outcome, score] of cases) {
    const row = market(name, outcome, name === 'Over/Under' ? 'total=2.5' : '');
    const compiled = compileSelection(row, row.outcomes[0]);
    assert.equal(grade(compiled, score), evaluate(compiled, score), `${name} ${outcome}`);
  }
});

test('a final score paints winners and losers', () => {
  const match = {
    id: 'sr:match:1',
    kickoff: '2026-10-03T18:00:00.000Z',
    tip: { compiled: { kind: 'total', period: 'ft', stat: 'goals', team: 'away', line: 0.5, direction: 'over' } },
    categoryTips: [],
    htft: { pick: { id: 'home-1x' } },
  };
  const payload = { periods: { ft: { home: 1, away: 1 }, p1: { home: 1, away: 0 } }, result: { home: 1, away: 1, period: 'nt' } };
  const now = Date.parse('2026-10-03T20:00:00.000Z');
  const score = scoreFromPayload(payload, match.kickoff, now);
  assert.equal(score.final, true);
  applyScore(match, score, now);
  assert.equal(match.tip.settlement.verdict, 'won');
  assert.equal(verdictOf(grade(match.htft.pick && { kind: 'double-chance', period: 'ft', stat: 'goals', sides: ['home', 'draw'] }, score)), 'won');
  assert.equal(match.htft.settlement.verdict, 'won');
  match.tip.compiled = { kind: 'total', period: 'ft', stat: 'goals', team: null, line: 2.5, direction: 'over' };
  applyScore(match, score, now);
  assert.equal(match.tip.settlement.verdict, 'lost');
});

test('a live match is not coloured before full time', () => {
  const early = scoreFromPayload({ periods: { ft: { home: 1, away: 0 }, p1: { home: 1, away: 0 } } }, '2026-10-03T19:30:00.000Z', Date.parse('2026-10-03T20:00:00.000Z'));
  assert.equal(early.final, false);
});
