"use strict";

const LIMITS=Object.freeze({
  over25OddMin:1.20,
  over25OddMax:1.55,
  minLeakAvgGA:1.90,
  minPPGExclusive:1.50,
  minAttackAvgGF:1.88,
  topBand:3,
  topFive:5,
  bottomBand:2,
});

const n=v=>Number(v);
const finite=v=>Number.isFinite(n(v));
const r2=v=>Math.round((n(v)+Number.EPSILON)*100)/100;

function validRank(position,size){
  return finite(position)&&finite(size)&&n(position)>=1&&n(size)>=1&&n(position)<=n(size);
}

function splitBand(position,size){
  if(!validRank(position,size))return'Unknown';
  const p=n(position),s=n(size);
  if(p<=LIMITS.topBand)return'Top 3';
  if(p>=Math.max(1,s-LIMITS.bottomBand+1))return'Bottom 2';
  if(p<=LIMITS.topFive)return'Top 5';
  return'Middle';
}

function evaluateBanger({home,away,over25Odd,positions={}}={}){
  const h=home||{},a=away||{},odd=n(over25Odd);
  const hp=n(positions.home),ap=n(positions.away);
  const hs=n(positions.homeTableSize??positions.tableSize),as=n(positions.awayTableSize??positions.tableSize);
  const ranksAvailable=validRank(hp,hs)&&validRank(ap,as);
  const homeBand=splitBand(hp,hs),awayBand=splitBand(ap,as);
  const bothTopFive=ranksAvailable&&hp<=LIMITS.topFive&&ap<=LIMITS.topFive;
  const extremeRank=ranksAvailable&&(homeBand==='Top 3'||homeBand==='Bottom 2'||awayBand==='Top 3'||awayBand==='Bottom 2');

  const gates={
    odds:finite(odd)&&odd>=LIMITS.over25OddMin&&odd<=LIMITS.over25OddMax,
    homeLeak:finite(h.avgGA)&&n(h.avgGA)>=LIMITS.minLeakAvgGA,
    awayLeak:finite(a.avgGA)&&n(a.avgGA)>=LIMITS.minLeakAvgGA,
    homePPG:finite(h.ppg)&&n(h.ppg)>LIMITS.minPPGExclusive,
    awayPPG:finite(a.ppg)&&n(a.ppg)>LIMITS.minPPGExclusive,
    homeAttack:finite(h.avgGF)&&n(h.avgGF)>=LIMITS.minAttackAvgGF,
    awayAttack:finite(a.avgGF)&&n(a.avgGF)>=LIMITS.minAttackAvgGF,
    splitRanks:ranksAvailable,
    notBothTopFive:ranksAvailable&&!bothTopFive,
    extremeRank:ranksAvailable&&extremeRank,
  };

  const qualified=Object.values(gates).every(Boolean);
  const passed=Object.values(gates).filter(Boolean).length;
  const score=qualified?10:Math.round((passed/Object.keys(gates).length)*100)/10;
  const reasons=[];
  const failures=[];

  if(gates.odds)reasons.push(`Over 2.5 odds ${odd.toFixed(2)} sit inside the 1.20–1.55 Banger window.`);else failures.push(`Over 2.5 odds must be 1.20–1.55; received ${finite(odd)?odd.toFixed(2):'unavailable'}.`);
  if(gates.homeLeak&&gates.awayLeak)reasons.push(`Both split defences leak at least 1.90 goals per match (${r2(h.avgGA)} home / ${r2(a.avgGA)} away).`);else failures.push(`Both teams must concede at least 1.90 in the relevant split (${finite(h.avgGA)?r2(h.avgGA):'—'} / ${finite(a.avgGA)?r2(a.avgGA):'—'}).`);
  if(gates.homePPG&&gates.awayPPG)reasons.push(`Both teams are above 1.50 split PPG (${r2(h.ppg)} / ${r2(a.ppg)}).`);else failures.push(`Each team must be above 1.50 split PPG (${finite(h.ppg)?r2(h.ppg):'—'} / ${finite(a.ppg)?r2(a.ppg):'—'}).`);
  if(gates.homeAttack&&gates.awayAttack)reasons.push(`Both attacks average at least 1.88 goals in their relevant split (${r2(h.avgGF)} / ${r2(a.avgGF)}).`);else failures.push(`Each attack must average at least 1.88 split goals (${finite(h.avgGF)?r2(h.avgGF):'—'} / ${finite(a.avgGF)?r2(a.avgGF):'—'}).`);
  if(!ranksAvailable)failures.push('Relevant home/away split-table ranks are unavailable, so the Banger cannot fire.');
  else{
    reasons.push(`Split ranks: home ${hp}/${hs} (${homeBand}), away ${ap}/${as} (${awayBand}).`);
    if(bothTopFive)failures.push('Both teams are Top 5 in their relevant split tables, so the match is rejected as a top-vs-top trap.');
    else reasons.push('The two teams are not both Top 5, avoiding the top-vs-top trap.');
    if(extremeRank)reasons.push('At least one side is Top 3 or Bottom 2 in its relevant split table.');
    else failures.push('At least one team must be Top 3 or Bottom 2 in its relevant split table.');
  }

  return{
    market:'Bangers · Over 2.5',
    bet:'Over 2.5',
    qualified,
    score,
    odds:finite(odd)?r2(odd):null,
    limits:LIMITS,
    gates,
    ranks:{home:validRank(hp,hs)?hp:null,away:validRank(ap,as)?ap:null,homeTableSize:finite(hs)?hs:null,awayTableSize:finite(as)?as:null,homeBand,awayBand,bothTopFive,extremeRank},
    stats:{home:{ppg:finite(h.ppg)?r2(h.ppg):null,avgGF:finite(h.avgGF)?r2(h.avgGF):null,avgGA:finite(h.avgGA)?r2(h.avgGA):null},away:{ppg:finite(a.ppg)?r2(a.ppg):null,avgGF:finite(a.avgGF)?r2(a.avgGF):null,avgGA:finite(a.avgGA)?r2(a.avgGA):null}},
    reasons,
    failures,
  };
}

module.exports={LIMITS,evaluateBanger,splitBand};
