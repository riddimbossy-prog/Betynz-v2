"use strict";
const {CONFIG,round1,round2,clamp,verdict}=require('./goldenCore.cjs');

function scoreOver25(home, away) {
let score = 0;
const reasons = [];
const homeBleed = home.avgGA > CONFIG.defensiveBleedGAExclusive;
const awayBleed = away.avgGA > CONFIG.defensiveBleedGAExclusive;
const homeStrongAttack = home.avgGF >= CONFIG.strongAttackAvgGF;
const awayStrongAttack = away.avgGF >= CONFIG.strongAttackAvgGF;
const homeDirectional = home.over25Rate >= CONFIG.strongOver25Rate;
const awayDirectional = away.over25Rate >= CONFIG.strongOver25Rate;
const directionalConfirmed = homeDirectional && awayDirectional;

if (homeBleed || awayBleed) {
score += 2.4;
const team = homeBleed && awayBleed ? "Both teams" : homeBleed ? "Home team" : "Away team";
reasons.push(`${team} exceed the defensive-bleed line (>2.30 conceded per split match).`);
}
if (homeBleed && awayBleed) {
score += 1.6;
reasons.push("Both split defences bleed heavily, making the goals route safer than picking a winner.");
}
if ((homeBleed && awayStrongAttack) || (awayBleed && homeStrongAttack)) {
score += 2.0;
reasons.push("A >2.30-conceding defence is facing a strong split attack (>=1.80 goals scored per game).");
} else if (homeStrongAttack || awayStrongAttack) {
score += 1.0;
reasons.push("At least one side has a strong recent split attack.");
}
const combinedOverRate = (home.over25Rate + away.over25Rate) / 2;
if (combinedOverRate >= 0.80) {
score += 2.0;
reasons.push(`Very strong split O2.5 frequency (${Math.round(combinedOverRate * 100)}% combined).`);
} else if (combinedOverRate >= CONFIG.strongOver25Rate) {
score += 1.4;
reasons.push(`Positive split O2.5 frequency (${Math.round(combinedOverRate * 100)}% combined).`);
} else if (combinedOverRate < 0.40) {
score -= 1.0;
reasons.push("Recent split O2.5 frequency is weak.");
}
const projectedTotalSignal = (home.avgGF + home.avgGA + away.avgGF + away.avgGA) / 2;
if (projectedTotalSignal >= 3.4) {
score += 1.4;
reasons.push(`High combined split goal environment (${round2(projectedTotalSignal)} goals signal).`);
} else if (projectedTotalSignal >= CONFIG.highTotalGoalAverage) {
score += 0.8;
reasons.push(`Healthy combined split goal environment (${round2(projectedTotalSignal)} goals signal).`);
}
if (home.avgGF < 0.6 && away.avgGF < 0.6) {
score -= 2.0;
reasons.push("Both attacks are producing too little in their relevant splits.");
}

let hardCap = null;
if (!directionalConfirmed) {
hardCap = 6.9;
reasons.push(`Golden Banker O2.5 requires BOTH split profiles at ${Math.round(CONFIG.strongOver25Rate*100)}%+ O2.5 (${Math.round(home.over25Rate*100)}% / ${Math.round(away.over25Rate*100)}%).`);
}
if (home.over25Rate < 0.40 || away.over25Rate < 0.40) {
hardCap = Math.min(hardCap ?? 10, 5.9);
reasons.push("One side is below 40% O2.5 in the exact split sample, so the high-goals route is rejected.");
}
score = clamp(score);
if (hardCap !== null) score = Math.min(score, hardCap);
score = round1(score);
return {
market: "Over 2.5 Goals",
score,
verdict: verdict(score),
qualified: directionalConfirmed && score >= CONFIG.bankerMinScore,
reasons,
directionalConfirmed,
};
}

function scoreBTTS(home, away) {
let score = 0;
const reasons = [];
const bothReliableScorers = home.scoreRate >= CONFIG.reliableScoreRate && away.scoreRate >= CONFIG.reliableScoreRate;
const bothRegularConceders = home.concedeRate >= CONFIG.regularConcedeRate && away.concedeRate >= CONFIG.regularConcedeRate;
const bothBttsStrong = home.bttsRate >= 0.80 && away.bttsRate >= 0.80;
const directionalConfirmed = bothReliableScorers && bothRegularConceders && bothBttsStrong;

if (bothReliableScorers) {
score += 3.0;
reasons.push("Both teams scored in at least 80% of their relevant split matches.");
} else {
const averageScoreRate = (home.scoreRate + away.scoreRate) / 2;
if (averageScoreRate >= 0.70) {
score += 1.2;
reasons.push("Scoring frequency is acceptable but not elite on both sides.");
}
}
if (bothRegularConceders) {
score += 2.8;
reasons.push("Both teams conceded in at least 80% of their relevant split matches.");
} else {
const averageConcedeRate = (home.concedeRate + away.concedeRate) / 2;
if (averageConcedeRate >= 0.70) {
score += 1.0;
reasons.push("Both defences show enough recent split vulnerability to support BTTS.");
}
}
if (home.avgGF >= 1.20 && away.avgGF >= 1.20) {
score += 1.7;
reasons.push("Both teams average at least 1.20 goals scored in their relevant splits.");
}
const combinedBTTSRate = (home.bttsRate + away.bttsRate) / 2;
if (combinedBTTSRate >= 0.80) {
score += 1.8;
reasons.push(`Very strong split BTTS rate (${Math.round(combinedBTTSRate * 100)}% combined).`);
} else if (combinedBTTSRate >= CONFIG.strongBTTSRate) {
score += 1.2;
reasons.push(`Positive split BTTS rate (${Math.round(combinedBTTSRate * 100)}% combined).`);
}
if (home.avgGA > CONFIG.defensiveBleedGAExclusive && away.avgGA > CONFIG.defensiveBleedGAExclusive) {
score += 0.8;
reasons.push("Both teams are above the defensive-bleed threshold.");
}

let hardCap = null;
if (!bothBttsStrong) {
hardCap = 6.9;
reasons.push(`Golden Banker BTTS requires BOTH exact split BTTS rates at 80%+ (${Math.round(home.bttsRate*100)}% / ${Math.round(away.bttsRate*100)}%).`);
}
if (!bothReliableScorers || !bothRegularConceders) {
hardCap = Math.min(hardCap ?? 10, 6.9);
reasons.push("BTTS cannot be banker-grade unless both teams independently score and concede in at least 80% of the relevant split sample.");
}
const lowPPGTeam = home.ppg < 1.0 ? "Home team" : away.ppg < 1.0 ? "Away team" : null;
const poorScoringTeam = home.scoreRate < CONFIG.poorScoreRate ? "Home team" : away.scoreRate < CONFIG.poorScoreRate ? "Away team" : null;
if (lowPPGTeam) {
hardCap = Math.min(hardCap ?? 10, 6.9);
reasons.push(`${lowPPGTeam} has <1.0 split PPG, activating the BTTS trap: BTTS cannot be a banker.`);
}
if (poorScoringTeam) {
hardCap = Math.min(hardCap ?? 10, 5.9);
reasons.push(`${poorScoringTeam} scores in fewer than 60% of its split matches, so BTTS is rejected.`);
}
score = clamp(score);
if (hardCap !== null) score = Math.min(score, hardCap);
score = round1(score);
return {
market: "BTTS / GG",
score,
verdict: verdict(score),
qualified: directionalConfirmed && score >= CONFIG.bankerMinScore,
reasons,
trapActivated: hardCap !== null,
directionalConfirmed,
};
}
module.exports={scoreOver25,scoreBTTS};
