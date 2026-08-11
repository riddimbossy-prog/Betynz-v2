"use strict";
const {CONFIG,round1,round2,clamp,verdict,positionBand}=require('./goldenStats.cjs');
function chooseFavourite(homeName, awayName, home, away) {
if (home.ppg === away.ppg) return null;
return home.ppg > away.ppg
? { name: homeName, side: "Home", stats: home, opponent: away }
: { name: awayName, side: "Away", stats: away, opponent: home };
}
function scoreWinDNB(homeName, awayName, home, away, positions) {
const favourite = chooseFavourite(homeName, awayName, home, away);
const reasons = [];
if (!favourite) {
return {
market: "Win / DNB",
score: 3.0,
verdict: "Weak",
qualified: false,
favourite: null,
bet: "Skip",
reasons: ["Split PPG is level; the winner market is mathematically balanced."],
straightWinEligible: false,
dnbEligible: false,
};
}
const fav = favourite.stats;
const opp = favourite.opponent;
const ppgGap = round2(fav.ppg - opp.ppg);
const opponentWeakEnough = opp.ppg < CONFIG.opponentMaxPPGExclusive;
const dnbEligible =
fav.ppg >= CONFIG.dnbFavouriteMinPPG && opponentWeakEnough;
const straightWinEligible =
fav.ppg >= CONFIG.straightWinFavouriteMinPPG && opponentWeakEnough;
if (fav.ppg < CONFIG.dnbFavouriteMinPPG) {
return {
market: "Win / DNB",
score: 4.0,
verdict: "Weak",
qualified: false,
favourite: favourite.name,
favouriteSide: favourite.side,
bet: "Skip",
reasons: [
`${favourite.name} has only ${fav.ppg} split PPG; Law 7 rejects winner markets below 2.0 PPG.`,
],
straightWinEligible: false,
dnbEligible: false,
};
}
if (!opponentWeakEnough) {
return {
market: "Win / DNB",
score: 4.5,
verdict: "Weak",
qualified: false,
favourite: favourite.name,
favouriteSide: favourite.side,
bet: "Skip",
reasons: [
`Opponent has ${opp.ppg} split PPG; Law 7 rejects winner markets when the opponent is >=1.0 PPG.`,
],
straightWinEligible: false,
dnbEligible: false,
};
}
let score = 0;
score += 4.0;
reasons.push(
`${favourite.name} clears the DNB gate with ${fav.ppg} PPG while the opponent has ${opp.ppg} PPG.`
);
if (ppgGap >= 1.8) {
score += 2.2;
reasons.push(`Huge split PPG mismatch (${ppgGap} PPG gap).`);
} else if (ppgGap >= 1.4) {
score += 1.7;
reasons.push(`Strong split PPG mismatch (${ppgGap} PPG gap).`);
} else if (ppgGap >= 1.0) {
score += 1.1;
reasons.push(`Clear split PPG advantage (${ppgGap} PPG gap).`);
}
if (straightWinEligible) {
score += 1.6;
reasons.push(
`${favourite.name} also clears the straight-win PPG gate (>=2.3; effectively 2.4+ over five games).`
);
} else {
score += 0.7;
reasons.push("DNB protection remains preferred because the straight-win PPG gate is not cleared.");
}
if (opp.avgGA > CONFIG.defensiveBleedGAExclusive) {
score += 1.1;
reasons.push(
`Opponent concedes ${opp.avgGA} per split match, above the >2.30 defensive-bleed threshold.`
);
}
if (fav.avgGF >= CONFIG.strongAttackAvgGF) {
score += 0.7;
reasons.push(
`${favourite.name} has a strong split attack (${fav.avgGF} goals scored per match).`
);
}
if (positions.home && positions.away && positions.tableSize) {
const favPos = favourite.side === "Home" ? positions.home : positions.away;
const oppPos = favourite.side === "Home" ? positions.away : positions.home;
const favBand = positionBand(favPos, positions.tableSize);
const oppBand = positionBand(oppPos, positions.tableSize);
if (favBand === "Top 3" && oppBand === "Bottom 3") {
score += 1.0;
reasons.push("Recent split-form table confirms an ideal Top 3 vs Bottom 3 mismatch.");
} else if (straightWinEligible) {
reasons.push(
"Straight-win PPG gate is met, but an ideal Top 3 vs Bottom 3 split-form confirmation is absent."
);
}
} else {
reasons.push("League-wide split-form positions were not supplied, so no table-position bonus is used.");
}
score = round1(clamp(score));
let bet;
if (straightWinEligible && score >= 8.0) {
bet = `${favourite.name} Win`;
} else if (dnbEligible) {
bet = `${favourite.name} DNB`;
} else {
bet = "Skip";
}
return {
market: "Win / DNB",
score,
verdict: verdict(score),
qualified: dnbEligible && score >= CONFIG.bankerMinScore,
favourite: favourite.name,
favouriteSide: favourite.side,
bet,
reasons,
straightWinEligible,
dnbEligible,
};
}
module.exports={scoreWinDNB};
