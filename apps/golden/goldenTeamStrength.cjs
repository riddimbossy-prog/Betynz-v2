"use strict";

const LIMITS=Object.freeze({
  eliteTopRank:3,
  eliteMinAvgGF:2.20,
  eliteMaxAvgGA:1.00,
  eliteMinPPGExclusive:2.20,
  opponentOutsideTop:6,
  weakBottomBand:3,
  weakMinAvgGAExclusive:2.20,
  weakMaxPPGExclusive:1.00,
  weakMaxAvgGFExclusive:1.20,
  opponentBottomBand:5,
  marginalAttackEdge:0.20,
  marginalDefenceEdge:0.20,
});

const n=v=>Number(v);
const finite=v=>Number.isFinite(n(v));
const r2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

function validRank(position,size){
  return finite(position)&&finite(size)&&n(position)>=1&&n(size)>=1&&n(position)<=n(size);
}
function isBottom(position,size,band){
  return validRank(position,size)&&n(position)>=Math.max(1,n(size)-band+1);
}
function isNotBottom(position,size,band){
  return validRank(position,size)&&n(position)<Math.max(1,n(size)-band+1);
}

function eliteDominanceProfile({team,opponent,teamRank,opponentRank,tableSize,teamName='Team'}={}){
  const t=team||{};
  const gates={
    top3:validRank(teamRank,tableSize)&&n(teamRank)<=LIMITS.eliteTopRank,
    attack:finite(t.avgGF)&&n(t.avgGF)>=LIMITS.eliteMinAvgGF,
    defence:finite(t.avgGA)&&n(t.avgGA)<=LIMITS.eliteMaxAvgGA,
    ppg:finite(t.ppg)&&n(t.ppg)>LIMITS.eliteMinPPGExclusive,
    opponentOutsideTop6:validRank(opponentRank,tableSize)&&n(opponentRank)>LIMITS.opponentOutsideTop,
  };
  const qualified=Object.values(gates).every(Boolean);
  const reasons=[];const failures=[];
  (gates.top3?reasons:failures).push(gates.top3?`${teamName} is Top 3 in the relevant split table (#${teamRank}/${tableSize}).`:`${teamName} must be Top 3 in the relevant split table.`);
  (gates.attack?reasons:failures).push(gates.attack?`${teamName} scores ${r2(t.avgGF)} goals per split match (minimum 2.20).`:`${teamName} must average at least 2.20 goals scored in the relevant split.`);
  (gates.defence?reasons:failures).push(gates.defence?`${teamName} concedes ${r2(t.avgGA)} per split match (maximum 1.00).`:`${teamName} must concede 1.00 or less in the relevant split.`);
  (gates.ppg?reasons:failures).push(gates.ppg?`${teamName} has ${r2(t.ppg)} split PPG, above 2.20.`:`${teamName} must be above 2.20 split PPG.`);
  (gates.opponentOutsideTop6?reasons:failures).push(gates.opponentOutsideTop6?`Opponent is outside the Top 6 (#${opponentRank}/${tableSize}).`:`Opponent must be outside the Top 6 of the relevant split table.`);
  return{profile:'ELITE_DOMINANCE',qualified,gates,reasons,failures,limits:LIMITS};
}

function winlessWeaknessProfile({weakTeam,opponent,weakRank,opponentRank,tableSize,weakName='Weak team',opponentName='Opponent'}={}){
  const w=weakTeam||{},o=opponent||{};
  const attackEdge=finite(o.avgGF)&&finite(w.avgGF)?r2(n(o.avgGF)-n(w.avgGF)):null;
  const defenceEdge=finite(w.avgGA)&&finite(o.avgGA)?r2(n(w.avgGA)-n(o.avgGA)):null;
  const gates={
    winless:Number(w.wins)===0,
    weakLeak:finite(w.avgGA)&&n(w.avgGA)>LIMITS.weakMinAvgGAExclusive,
    weakPPG:finite(w.ppg)&&n(w.ppg)<LIMITS.weakMaxPPGExclusive,
    weakBottom3:validRank(weakRank,tableSize)&&isBottom(weakRank,tableSize,LIMITS.weakBottomBand),
    weakAttack:finite(w.avgGF)&&n(w.avgGF)<LIMITS.weakMaxAvgGFExclusive,
    opponentNotBottom5:validRank(opponentRank,tableSize)&&isNotBottom(opponentRank,tableSize,LIMITS.opponentBottomBand),
    opponentScoresMore:finite(attackEdge)&&attackEdge>=LIMITS.marginalAttackEdge,
    opponentConcedesLess:finite(defenceEdge)&&defenceEdge>=LIMITS.marginalDefenceEdge,
  };
  const qualified=Object.values(gates).every(Boolean);
  const reasons=[];const failures=[];
  (gates.winless?reasons:failures).push(gates.winless?`${weakName} is winless in the exact five-match split sample.`:`${weakName} must have zero wins in the relevant split sample.`);
  (gates.weakLeak?reasons:failures).push(gates.weakLeak?`${weakName} concedes ${r2(w.avgGA)} per split match, above 2.20.`:`${weakName} must concede more than 2.20 per split match.`);
  (gates.weakPPG?reasons:failures).push(gates.weakPPG?`${weakName} has ${r2(w.ppg)} split PPG, below 1.00.`:`${weakName} must be below 1.00 split PPG.`);
  (gates.weakBottom3?reasons:failures).push(gates.weakBottom3?`${weakName} is Bottom 3 in the relevant split table (#${weakRank}/${tableSize}).`:`${weakName} must be Bottom 3 in the relevant split table.`);
  (gates.weakAttack?reasons:failures).push(gates.weakAttack?`${weakName} scores only ${r2(w.avgGF)} per split match, below 1.20.`:`${weakName} must score less than 1.20 per split match.`);
  (gates.opponentNotBottom5?reasons:failures).push(gates.opponentNotBottom5?`${opponentName} is not Bottom 5 (#${opponentRank}/${tableSize}).`:`${opponentName} cannot be Bottom 5.`);
  (gates.opponentScoresMore?reasons:failures).push(gates.opponentScoresMore?`${opponentName} scores ${attackEdge.toFixed(2)} more per split match (minimum edge 0.20).`:`${opponentName} must score at least 0.20 more per split match than ${weakName}.`);
  (gates.opponentConcedesLess?reasons:failures).push(gates.opponentConcedesLess?`${opponentName} concedes ${defenceEdge.toFixed(2)} fewer per split match (minimum edge 0.20).`:`${opponentName} must concede at least 0.20 fewer per split match than ${weakName}.`);
  return{profile:'WINLESS_WEAKNESS',qualified,gates,reasons,failures,edges:{attack:attackEdge,defence:defenceEdge},limits:LIMITS};
}

module.exports={LIMITS,eliteDominanceProfile,winlessWeaknessProfile};
