import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {LIMITS,eliteDominanceProfile,winlessWeaknessProfile}=require('./goldenTeamStrength.cjs');

const elite=eliteDominanceProfile({
  team:{ppg:2.4,avgGF:2.4,avgGA:.8},
  opponent:{ppg:1.2,avgGF:1.3,avgGA:1.6},
  teamRank:2,opponentRank:8,tableSize:12,teamName:'Elite FC'
});
assert.equal(elite.qualified,true);
assert.equal(elite.profile,'ELITE_DOMINANCE');
assert.equal(LIMITS.eliteMinAvgGF,2.2);

const eliteBad=eliteDominanceProfile({
  team:{ppg:2.4,avgGF:2.0,avgGA:.8},
  opponent:{},teamRank:2,opponentRank:8,tableSize:12
});
assert.equal(eliteBad.qualified,false);
assert.equal(eliteBad.gates.attack,false);

const weak=winlessWeaknessProfile({
  weakTeam:{wins:0,ppg:.6,avgGF:1.0,avgGA:2.6},
  opponent:{ppg:1.4,avgGF:1.3,avgGA:2.2},
  weakRank:12,opponentRank:6,tableSize:12,weakName:'Weak FC',opponentName:'Other FC'
});
assert.equal(weak.qualified,true);
assert.equal(weak.profile,'WINLESS_WEAKNESS');
assert.ok(weak.edges.attack>=.2);
assert.ok(weak.edges.defence>=.2);

const bottomFiveOpponent=winlessWeaknessProfile({
  weakTeam:{wins:0,ppg:.6,avgGF:1.0,avgGA:2.6},
  opponent:{ppg:1.0,avgGF:1.4,avgGA:2.0},
  weakRank:12,opponentRank:9,tableSize:12
});
assert.equal(bottomFiveOpponent.qualified,false);
assert.equal(bottomFiveOpponent.gates.opponentNotBottom5,false);

console.log('Team strength profile tests passed');
