"use strict";

const LIMITS=Object.freeze({
  seasonOverBoth:0.70,
  seasonOverElite:0.80,
  seasonOverPartner:0.65,
  homeVenueOver:0.72,
  awayVenueOver:0.68,
  combinedAverageGoals:3.40,
  combinedXgEnvironment:3.10,
  recentOversEach:4,
  recentOversElite:5,
  leagueOver25:0.56,
  minSeasonMatches:10,
});

const n=v=>Number(v);
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(n(v));
const r2=v=>finite(v)?Math.round((n(v)+Number.EPSILON)*100)/100:null;
const pct=v=>finite(v)?`${Math.round(n(v)*100)}%`:'—';

function evaluateBanger({home,away,league,xgCombined=null}={}){
  const h=home||{},a=away||{},l=league||{};
  const seasonRoute=(finite(h.over25Rate)&&finite(a.over25Rate))&&(
    (n(h.over25Rate)>=LIMITS.seasonOverBoth&&n(a.over25Rate)>=LIMITS.seasonOverBoth)||
    (n(h.over25Rate)>=LIMITS.seasonOverElite&&n(a.over25Rate)>=LIMITS.seasonOverPartner)||
    (n(a.over25Rate)>=LIMITS.seasonOverElite&&n(h.over25Rate)>=LIMITS.seasonOverPartner)
  );
  const combinedAverageGoals=[h.avgGF,h.avgGA,a.avgGF,a.avgGA].every(finite)
    ?(n(h.avgGF)+n(h.avgGA)+n(a.avgGF)+n(a.avgGA))/2
    :null;
  const xgAvailable=finite(xgCombined);
  const recentHome=finite(h.last6Overs)?n(h.last6Overs):null;
  const recentAway=finite(a.last6Overs)?n(a.last6Overs):null;
  const recentRoute=finite(recentHome)&&finite(recentAway)&&(
    (recentHome>=LIMITS.recentOversEach&&recentAway>=LIMITS.recentOversEach)||
    recentHome>=LIMITS.recentOversElite||recentAway>=LIMITS.recentOversElite
  );

  const gates={
    seasonOver:seasonRoute,
    homeVenueOver:finite(h.homeOver25Rate)&&n(h.homeOver25Rate)>=LIMITS.homeVenueOver,
    awayVenueOver:finite(a.awayOver25Rate)&&n(a.awayOver25Rate)>=LIMITS.awayVenueOver,
    combinedAverageGoals:finite(combinedAverageGoals)&&combinedAverageGoals>=LIMITS.combinedAverageGoals,
    xgEnvironment:xgAvailable?n(xgCombined)>=LIMITS.combinedXgEnvironment:true,
    recentOvers:recentRoute,
    leagueOver:finite(l.over25Rate)&&n(l.over25Rate)>=LIMITS.leagueOver25,
    matureSample:finite(h.matchesPlayed)&&finite(a.matchesPlayed)&&n(h.matchesPlayed)>=LIMITS.minSeasonMatches&&n(a.matchesPlayed)>=LIMITS.minSeasonMatches,
  };

  const qualified=Object.values(gates).every(Boolean);
  const scoredGateNames=Object.keys(gates).filter(k=>k!=='xgEnvironment'||xgAvailable);
  const passed=scoredGateNames.filter(k=>gates[k]).length;
  const score=qualified?10:Math.round((passed/scoredGateNames.length)*100)/10;
  const reasons=[];
  const failures=[];

  if(gates.seasonOver)reasons.push(`Season high-scoring rates clear the profile (${pct(h.over25Rate)} / ${pct(a.over25Rate)}).`);else failures.push(`Season high-scoring rates need both teams at 70%+, or an 80%+ / 65%+ pairing (${pct(h.over25Rate)} / ${pct(a.over25Rate)}).`);
  if(gates.homeVenueOver)reasons.push(`Home venue high-scoring rate is ${pct(h.homeOver25Rate)} (72%+ required).`);else failures.push(`Home venue high-scoring rate must be at least 72% (${pct(h.homeOver25Rate)}).`);
  if(gates.awayVenueOver)reasons.push(`Away venue high-scoring rate is ${pct(a.awayOver25Rate)} (68%+ required).`);else failures.push(`Away venue high-scoring rate must be at least 68% (${pct(a.awayOver25Rate)}).`);
  if(gates.combinedAverageGoals)reasons.push(`Combined average goal environment is ${r2(combinedAverageGoals)} (3.40+ required).`);else failures.push(`Combined average goal environment must be at least 3.40 (${finite(combinedAverageGoals)?r2(combinedAverageGoals):'—'}).`);
  if(!xgAvailable)reasons.push('xG/xGA gate is not applied because reliable xG data is unavailable.');
  else if(gates.xgEnvironment)reasons.push(`Combined xG/xGA environment is ${r2(xgCombined)} (3.10+ required).`);
  else failures.push(`Combined xG/xGA environment must be at least 3.10 when available (${r2(xgCombined)}).`);
  if(gates.recentOvers)reasons.push(`Recent six-game high-scoring counts clear the profile (${recentHome}/6 / ${recentAway}/6).`);else failures.push(`Recent six-game profile needs 4+ for both teams, or 5+ for either team (${recentHome??'—'}/6 / ${recentAway??'—'}/6).`);
  if(gates.leagueOver)reasons.push(`League high-scoring rate is ${pct(l.over25Rate)} (56%+ required).`);else failures.push(`League high-scoring rate must be at least 56% (${pct(l.over25Rate)}).`);
  if(gates.matureSample)reasons.push(`Both teams have at least 10 completed league matches (${h.matchesPlayed} / ${a.matchesPlayed}).`);else failures.push(`Both teams need at least 10 completed league matches (${finite(h.matchesPlayed)?h.matchesPlayed:'—'} / ${finite(a.matchesPlayed)?a.matchesPlayed:'—'}).`);

  return{
    market:'High-Scoring Match Profile',
    qualified,
    score,
    limits:LIMITS,
    gates,
    xg:{available:xgAvailable,combined:xgAvailable?r2(xgCombined):null},
    stats:{
      home:{matchesPlayed:finite(h.matchesPlayed)?n(h.matchesPlayed):null,over25Rate:finite(h.over25Rate)?n(h.over25Rate):null,homeOver25Rate:finite(h.homeOver25Rate)?n(h.homeOver25Rate):null,avgGF:r2(h.avgGF),avgGA:r2(h.avgGA),last6Overs:finite(h.last6Overs)?n(h.last6Overs):null},
      away:{matchesPlayed:finite(a.matchesPlayed)?n(a.matchesPlayed):null,over25Rate:finite(a.over25Rate)?n(a.over25Rate):null,awayOver25Rate:finite(a.awayOver25Rate)?n(a.awayOver25Rate):null,avgGF:r2(a.avgGF),avgGA:r2(a.avgGA),last6Overs:finite(a.last6Overs)?n(a.last6Overs):null},
      league:{matchesPlayed:finite(l.matchesPlayed)?n(l.matchesPlayed):null,over25Rate:finite(l.over25Rate)?n(l.over25Rate):null},
      combinedAverageGoals:r2(combinedAverageGoals),
    },
    reasons,
    failures,
  };
}

module.exports={LIMITS,evaluateBanger};
