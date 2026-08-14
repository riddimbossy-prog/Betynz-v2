"use strict";

const LIMITS=Object.freeze({
  maxWinOddExclusive:1.55,
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

function bottom(position,size,band){
  return validRank(position,size)&&n(position)>=Math.max(1,n(size)-band+1);
}

function top(position,band){
  return finite(position)&&n(position)>=1&&n(position)<=band;
}

function notBottom(position,size,band){
  return validRank(position,size)&&n(position)<Math.max(1,n(size)-band+1);
}

function evaluateEliteRoute({candidate,opponent,candidateRank,opponentRank,tableSize,odd,candidateName='Candidate'}={}){
  const c=candidate||{},o=opponent||{},price=n(odd);
  const gates={
    odds:finite(price)&&price>1&&price<LIMITS.maxWinOddExclusive,
    top3:validRank(candidateRank,tableSize)&&top(candidateRank,LIMITS.eliteTopRank),
    attack:finite(c.avgGF)&&n(c.avgGF)>=LIMITS.eliteMinAvgGF,
    defence:finite(c.avgGA)&&n(c.avgGA)<=LIMITS.eliteMaxAvgGA,
    ppg:finite(c.ppg)&&n(c.ppg)>LIMITS.eliteMinPPGExclusive,
    opponentOutsideTop6:validRank(opponentRank,tableSize)&&n(opponentRank)>LIMITS.opponentOutsideTop,
  };
  const qualified=Object.values(gates).every(Boolean);
  const reasons=[];const failures=[];
  (gates.odds?reasons:failures).push(gates.odds?`${candidateName} win odds ${price.toFixed(2)} are below 1.55.`:`Win odds must be below 1.55; received ${finite(price)?price.toFixed(2):'unavailable'}.`);
  (gates.top3?reasons:failures).push(gates.top3?`${candidateName} is Top 3 in the relevant split table (#${candidateRank}/${tableSize}).`:`${candidateName} must be Top 3 in the relevant split table.`);
  (gates.attack?reasons:failures).push(gates.attack?`${candidateName} scores ${r2(c.avgGF)} per split match (minimum 2.20).`:`${candidateName} must score at least 2.20 per split match.`);
  (gates.defence?reasons:failures).push(gates.defence?`${candidateName} concedes only ${r2(c.avgGA)} per split match (maximum 1.00).`:`${candidateName} must concede 1.00 or less per split match.`);
  (gates.ppg?reasons:failures).push(gates.ppg?`${candidateName} has ${r2(c.ppg)} split PPG, above 2.20.`:`${candidateName} must be above 2.20 split PPG.`);
  (gates.opponentOutsideTop6?reasons:failures).push(gates.opponentOutsideTop6?`Opponent is outside the Top 6 (#${opponentRank}/${tableSize}).`:`Opponent must be outside the Top 6 of the relevant split table.`);
  return{route:'ELITE_TOP3',qualified,gates,reasons,failures};
}

function evaluateWinlessFadeRoute({weak,opponent,weakRank,opponentRank,tableSize,odd,weakName='Weak team',opponentName='Opponent'}={}){
  const w=weak||{},o=opponent||{},price=n(odd);
  const attackEdge=finite(o.avgGF)&&finite(w.avgGF)?r2(n(o.avgGF)-n(w.avgGF)):null;
  const defenceEdge=finite(w.avgGA)&&finite(o.avgGA)?r2(n(w.avgGA)-n(o.avgGA)):null;
  const gates={
    odds:finite(price)&&price>1&&price<LIMITS.maxWinOddExclusive,
    winless:Number(w.wins)===0,
    weakLeak:finite(w.avgGA)&&n(w.avgGA)>LIMITS.weakMinAvgGAExclusive,
    weakPPG:finite(w.ppg)&&n(w.ppg)<LIMITS.weakMaxPPGExclusive,
    weakBottom3:validRank(weakRank,tableSize)&&bottom(weakRank,tableSize,LIMITS.weakBottomBand),
    weakAttack:finite(w.avgGF)&&n(w.avgGF)<LIMITS.weakMaxAvgGFExclusive,
    opponentNotBottom5:validRank(opponentRank,tableSize)&&notBottom(opponentRank,tableSize,LIMITS.opponentBottomBand),
    opponentScoresMore:finite(attackEdge)&&attackEdge>=LIMITS.marginalAttackEdge,
    opponentConcedesLess:finite(defenceEdge)&&defenceEdge>=LIMITS.marginalDefenceEdge,
  };
  const qualified=Object.values(gates).every(Boolean);
  const reasons=[];const failures=[];
  (gates.odds?reasons:failures).push(gates.odds?`${opponentName} win odds ${price.toFixed(2)} are below 1.55.`:`${opponentName} win odds must be below 1.55.`);
  (gates.winless?reasons:failures).push(gates.winless?`${weakName} is winless in the exact five-match split sample.`:`${weakName} must have zero wins in the relevant split sample.`);
  (gates.weakLeak?reasons:failures).push(gates.weakLeak?`${weakName} leaks ${r2(w.avgGA)} goals per split match, above 2.20.`:`${weakName} must concede more than 2.20 per split match.`);
  (gates.weakPPG?reasons:failures).push(gates.weakPPG?`${weakName} has only ${r2(w.ppg)} split PPG, below 1.00.`:`${weakName} must be below 1.00 split PPG.`);
  (gates.weakBottom3?reasons:failures).push(gates.weakBottom3?`${weakName} is Bottom 3 in the relevant split table (#${weakRank}/${tableSize}).`:`${weakName} must be Bottom 3 in the relevant split table.`);
  (gates.weakAttack?reasons:failures).push(gates.weakAttack?`${weakName} scores only ${r2(w.avgGF)} per split match, below 1.20.`:`${weakName} must score less than 1.20 per split match.`);
  (gates.opponentNotBottom5?reasons:failures).push(gates.opponentNotBottom5?`${opponentName} is not Bottom 5 (#${opponentRank}/${tableSize}).`:`${opponentName} cannot be Bottom 5.`);
  (gates.opponentScoresMore?reasons:failures).push(gates.opponentScoresMore?`${opponentName} scores ${attackEdge.toFixed(2)} more goals per split match (minimum edge 0.20).`:`${opponentName} must score at least 0.20 more per split match than ${weakName}.`);
  (gates.opponentConcedesLess?reasons:failures).push(gates.opponentConcedesLess?`${opponentName} concedes ${defenceEdge.toFixed(2)} fewer goals per split match (minimum edge 0.20).`:`${opponentName} must concede at least 0.20 fewer per split match than ${weakName}.`);
  return{route:'WINLESS_BOTTOM3_FADE',qualified,gates,reasons,failures,edges:{attack:attackEdge,defence:defenceEdge}};
}

function evaluateStraightWin({home,away,homeName='Home',awayName='Away',odds={},positions={}}={}){
  const h=home||{},a=away||{};
  const hp=n(positions.home),ap=n(positions.away);
  const hs=n(positions.homeTableSize??positions.tableSize),as=n(positions.awayTableSize??positions.tableSize);
  const sameSize=finite(hs)&&finite(as)&&hs===as?hs:null;
  const homeTableSize=finite(hs)?hs:sameSize,awayTableSize=finite(as)?as:sameSize;

  const candidates=[];
  const eliteHome=evaluateEliteRoute({candidate:h,opponent:a,candidateRank:hp,opponentRank:ap,tableSize:homeTableSize,odd:odds.homeWin,candidateName:homeName});
  if(eliteHome.qualified)candidates.push({side:'Home',team:homeName,odd:r2(odds.homeWin),...eliteHome});
  const eliteAway=evaluateEliteRoute({candidate:a,opponent:h,candidateRank:ap,opponentRank:hp,tableSize:awayTableSize,odd:odds.awayWin,candidateName:awayName});
  if(eliteAway.qualified)candidates.push({side:'Away',team:awayName,odd:r2(odds.awayWin),...eliteAway});

  const fadeHome=evaluateWinlessFadeRoute({weak:h,opponent:a,weakRank:hp,opponentRank:ap,tableSize:homeTableSize,odd:odds.awayWin,weakName:homeName,opponentName:awayName});
  if(fadeHome.qualified)candidates.push({side:'Away',team:awayName,odd:r2(odds.awayWin),weakSide:'Home',...fadeHome});
  const fadeAway=evaluateWinlessFadeRoute({weak:a,opponent:h,weakRank:ap,opponentRank:hp,tableSize:awayTableSize,odd:odds.homeWin,weakName:awayName,opponentName:homeName});
  if(fadeAway.qualified)candidates.push({side:'Home',team:homeName,odd:r2(odds.homeWin),weakSide:'Away',...fadeAway});

  const pick=candidates[0]||null;
  return{
    market:'Straight Win Candidates',
    qualified:Boolean(pick),
    bet:pick?`${pick.team} Win`:'Skip',
    side:pick?.side||null,
    team:pick?.team||null,
    odds:pick?.odd??null,
    route:pick?.route||null,
    score:pick?10:0,
    reasons:pick?.reasons||[],
    limits:LIMITS,
    candidates,
    ranks:{home:validRank(hp,homeTableSize)?hp:null,away:validRank(ap,awayTableSize)?ap:null,homeTableSize:finite(homeTableSize)?homeTableSize:null,awayTableSize:finite(awayTableSize)?awayTableSize:null},
    stats:{home:{wins:Number(h.wins),ppg:finite(h.ppg)?r2(h.ppg):null,avgGF:finite(h.avgGF)?r2(h.avgGF):null,avgGA:finite(h.avgGA)?r2(h.avgGA):null},away:{wins:Number(a.wins),ppg:finite(a.ppg)?r2(a.ppg):null,avgGF:finite(a.avgGF)?r2(a.avgGF):null,avgGA:finite(a.avgGA)?r2(a.avgGA):null}},
  };
}

module.exports={LIMITS,evaluateEliteRoute,evaluateWinlessFadeRoute,evaluateStraightWin};
