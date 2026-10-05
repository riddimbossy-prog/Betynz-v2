import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeSrc, flagCode, isInternational } from '../public/badges.js';

test('club tickets prefer the crest and fall back to the country flag', () => {
  const league = { country: 'Jamaica', name: 'Premier League' };
  assert.equal(badgeSrc({ name: 'Waterhouse FC', logo: 'https://s.sporty.net/a.png' }, league), 'https://s.sporty.net/a.png');
  assert.equal(badgeSrc({ name: 'Waterhouse FC', logo: null }, league), 'https://flagcdn.com/w80/jm.png');
  assert.equal(badgeSrc({ name: 'Waterhouse FC', logo: 'javascript:alert(1)' }, league), 'https://flagcdn.com/w80/jm.png');
});

test('international matches use the team flag, not the club crest', () => {
  const league = { country: 'International', name: 'UEFA Nations League' };
  assert.equal(isInternational(league), true);
  assert.equal(flagCode('Côte d\'Ivoire'), 'ci');
  assert.equal(badgeSrc({ name: 'Serbia U21', logo: 'https://s.sporty.net/a.png' }, league), 'https://flagcdn.com/w80/rs.png');
  assert.equal(badgeSrc({ name: 'England', logo: null }, league), 'https://flagcdn.com/w80/gb-eng.png');
});

test('a champions league club still uses its crest', () => {
  const league = { country: 'International', name: 'UEFA Champions League' };
  assert.equal(badgeSrc({ name: 'Chelsea', logo: 'https://s.sporty.net/chelsea.png' }, league), 'https://s.sporty.net/chelsea.png');
});
