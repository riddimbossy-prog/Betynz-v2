"use strict";
const CONFIG = Object.freeze({
sampleSize: 5,
maxBankers: 4,
bankerMinScore: 7.0,
dnbFavouriteMinPPG: 2.0,
straightWinFavouriteMinPPG: 2.3, // With 5 games, reachable qualifying value is effectively 2.4+
straightWinTopRank: 2,
opponentMaxPPGExclusive: 1.0,
defensiveBleedGAExclusive: 2.30, // With 5 games, effective trigger is 2.4+
strongAttackAvgGF: 1.80,
reliableScoreRate: 0.80,
regularConcedeRate: 0.80,
poorScoreRate: 0.60,
strongOver25Rate: 0.60,
strongBTTSRate: 0.60,
highTotalGoalAverage: 2.80,
topBand: 3,
bottomBand: 3,
});
function round1(n) {
return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}
function round2(n) {
return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function clamp(n, min = 0, max = 10) {
return Math.max(min, Math.min(max, n));
}
function normalizeMatch(m) {
if (!m || typeof m !== "object") {
throw new Error("Each split match must be an object.");
}
const gf = Number(
m.gf ?? m.goalsFor ?? m.scored ?? m.teamGoals
);
const ga = Number(
m.ga ?? m.goalsAgainst ?? m.conceded ?? m.opponentGoals
);
if (!Number.isFinite(gf) || !Number.isFinite(ga) || gf < 0 || ga < 0) {
throw new Error(
`Invalid split-match goals. Expected non-negative gf/ga, got gf=${gf}, ga=${ga}`
);
}
let points;
if (m.points !== undefined && m.points !== null) {
points = Number(m.points);
if (![0, 1, 3].includes(points)) {
throw new Error(`Invalid points=${points}. Expected 0, 1, or 3.`);
}
} else {
points = gf > ga ? 3 : gf === ga ? 1 : 0;
}
return { gf, ga, points };
}
function validateLast5(matches, label) {
if (!Array.isArray(matches)) {
throw new Error(`${label} must be an array of exactly 5 split matches.`);
}
if (matches.length !== CONFIG.sampleSize) {
throw new Error(
`${label} must contain exactly ${CONFIG.sampleSize} matches. Received ${matches.length}.`
);
}
return matches.map(normalizeMatch);
}
function calculateSplitStats(matches, label = "Last 5") {
const list = validateLast5(matches, label);
const sum = list.reduce(
(a, m) => {
a.points += m.points;
a.gf += m.gf;
a.ga += m.ga;
a.scored += m.gf > 0 ? 1 : 0;
a.conceded += m.ga > 0 ? 1 : 0;
a.over25 += m.gf + m.ga > 2.5 ? 1 : 0;
a.btts += m.gf > 0 && m.ga > 0 ? 1 : 0;
a.cleanSheets += m.ga === 0 ? 1 : 0;
a.failedToScore += m.gf === 0 ? 1 : 0;
a.wins += m.points === 3 ? 1 : 0;
a.draws += m.points === 1 ? 1 : 0;
a.losses += m.points === 0 ? 1 : 0;
return a;
},
{
points: 0,
gf: 0,
ga: 0,
scored: 0,
conceded: 0,
over25: 0,
btts: 0,
cleanSheets: 0,
failedToScore: 0,
wins: 0,
draws: 0,
losses: 0,
}
);
const n = list.length;
return Object.freeze({
sampleSize: n,
points: sum.points,
ppg: round2(sum.points / n),
avgGF: round2(sum.gf / n),
avgGA: round2(sum.ga / n),
scoreRate: round2(sum.scored / n),
concedeRate: round2(sum.conceded / n),
over25Rate: round2(sum.over25 / n),
bttsRate: round2(sum.btts / n),
cleanSheetRate: round2(sum.cleanSheets / n),
failToScoreRate: round2(sum.failedToScore / n),
wins: sum.wins,
draws: sum.draws,
losses: sum.losses,
totalGoalsAverage: round2((sum.gf + sum.ga) / n),
});
}
function verdict(score) {
if (score >= 7) return "Strong";
if (score >= 5) return "Moderate";
return "Weak";
}
function confidence(score) {
if (score >= 8.5) return "High";
if (score >= 7) return "Medium";
return "Low";
}
function positionBand(position, tableSize) {
if (!Number.isFinite(position) || !Number.isFinite(tableSize)) return "Unknown";
if (position <= CONFIG.topBand) return "Top 3";
if (position > tableSize - CONFIG.bottomBand) return "Bottom 3";
return "Middle";
}
function resolvePositions(input) {
const hp = Number(input.homeFormPosition);
const ap = Number(input.awayFormPosition);
const size = Number(input.formTableSize);
const homeSize = Number(input.homeFormTableSize);
const awaySize = Number(input.awayFormTableSize);
const tableSize = Number.isFinite(size) && size > 0 ? size : null;
return {
home: Number.isFinite(hp) && hp > 0 ? hp : null,
away: Number.isFinite(ap) && ap > 0 ? ap : null,
tableSize,
homeTableSize: Number.isFinite(homeSize) && homeSize > 0 ? homeSize : tableSize,
awayTableSize: Number.isFinite(awaySize) && awaySize > 0 ? awaySize : tableSize,
};
}
module.exports={CONFIG,round1,round2,clamp,calculateSplitStats,verdict,confidence,positionBand,resolvePositions};
