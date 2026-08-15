"use strict";

const LIMITS=Object.freeze({
  seasonBttsBoth:0.68,
  seasonBttsElite:0.80,
  seasonBttsPartner:0.62,
  homeVenueBtts:0.72,
  awayVenueBtts:0.68,
  scoreRate:0.72,
  concedeRate:0.68,
  maxCleanSheetRate:0.28,
  recentBttsEach:4,
  recentBttsElite:5,
  leagueBtts:0.54,
  minSeasonMatches:10,
});

const n=v=>Number(v);
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(n(v));
const r2=v=>finite(v)?Math.round((n(v)+Number.EPSILON)*100)/100:null;
const pct=v=>finite(v)?`${Math.round(n(v)*100)}%`:'—';

function evaluateGG({home,away,league}={}){
  const h=home||{},a=away||{},l=league||{};
  const seasonRoute=(finite(h.bttsRate)&&finite(a.bttsRate))&&(
    (n(h.bttsRate)>=LIMITS.seasonBttsBoth&&n(a.bttsRate)>=LIMITS.seasonBttsBoth)||
    (n(h.bttsRate)>=LIMITS.seasonBttsElite&&n(a.bttsRate)>=LIMITS.seasonBttsPartner)||
    (n(a.bttsRate)>=LIMITS.seasonBttsElite&&n(h.bttsRate)>=LIMITS.seasonBttsPartner)
  );
  const homeScoreRate=finite(h.homeScoreRate)?n(h.homeScoreRate):(finite(h.scoreRate)?n(h.scoreRate):null);
  const awayScoreRate=finite(a.awayScoreRate)?n(a.awayScoreRate):(finite(a.scoreRate)?n(a.scoreRate):null);
  const recentHome=finite(h.last6Btts)?n(h.last6Btts):null;
  const recentAway=finite(a.last6Btts)?n(a.last6Btts):null;
  const recentRoute=finite(recentHome)&&finite(recentAway)&&(
    (recentHome>=LIMITS.recentBttsEach&&recentAway>=LIMITS.recentBttsEach)||
    recentHome>=LIMITS.recentBttsElite||recentAway>=LIMITS.recentBttsElite
  );

  const gates={
    seasonBtts:seasonRoute,
    homeVenueBtts:finite(h.homeBttsRate)&&n(h.homeBttsRate)>=LIMITS.homeVenueBtts,
    awayVenueBtts:finite(a.awayBttsRate)&&n(a.awayBttsRate)>=LIMITS.awayVenueBtts,
    bothScore:finite(homeScoreRate)&&finite(awayScoreRate)&&homeScoreRate>=LIMITS.scoreRate&&awayScoreRate>=LIMITS.scoreRate,
    bothConcede:finite(h.concedeRate)&&finite(a.concedeRate)&&n(h.concedeRate)>=LIMITS.concedeRate&&n(a.concedeRate)>=LIMITS.concedeRate,
    lowCleanSheets:finite(h.cleanSheetRate)&&finite(a.cleanSheetRate)&&n(h.cleanSheetRate)<=LIMITS.maxCleanSheetRate&&n(a.cleanSheetRate)<=LIMITS.maxCleanSheetRate,
    recentBtts:recentRoute,
    leagueBtts:finite(l.bttsRate)&&n(l.bttsRate)>=LIMITS.leagueBtts,
    matureSample:finite(h.matchesPlayed)&&finite(a.matchesPlayed)&&n(h.matchesPlayed)>=LIMITS.minSeasonMatches&&n(a.matchesPlayed)>=LIMITS.minSeasonMatches,
  };

  const qualified=Object.values(gates).every(Boolean);
  const passed=Object.values(gates).filter(Boolean).length;
  const score=qualified?10:Math.round((passed/Object.keys(gates).length)*100)/10;
  const reasons=[];
  const failures=[];

  if(gates.seasonBtts)reasons.push(`Season BTTS rates clear the profile (${pct(h.bttsRate)} / ${pct(a.bttsRate)}).`);else failures.push(`Season BTTS needs both teams at 68%+, or an 80%+ / 62%+ pairing (${pct(h.bttsRate)} / ${pct(a.bttsRate)}).`);
  if(gates.homeVenueBtts)reasons.push(`Home team's home BTTS rate is ${pct(h.homeBttsRate)} (72%+ required).`);else failures.push(`Home team's home BTTS rate must be at least 72% (${pct(h.homeBttsRate)}).`);
  if(gates.awayVenueBtts)reasons.push(`Away team's away BTTS rate is ${pct(a.awayBttsRate)} (68%+ required).`);else failures.push(`Away team's away BTTS rate must be at least 68% (${pct(a.awayBttsRate)}).`);
  if(gates.bothScore)reasons.push(`Both teams score often enough in the preferred venue split (${pct(homeScoreRate)} / ${pct(awayScoreRate)}).`);else failures.push(`Both teams need a 72%+ scoring rate, using venue-specific rates where available (${pct(homeScoreRate)} / ${pct(awayScoreRate)}).`);
  if(gates.bothConcede)reasons.push(`Both teams concede in at least 68% of season matches (${pct(h.concedeRate)} / ${pct(a.concedeRate)}).`);else failures.push(`Both teams need a 68%+ concede rate (${pct(h.concedeRate)} / ${pct(a.concedeRate)}).`);
  if(gates.lowCleanSheets)reasons.push(`Clean-sheet rates stay at or below 28% (${pct(h.cleanSheetRate)} / ${pct(a.cleanSheetRate)}).`);else failures.push(`Both clean-sheet rates must be 28% or lower (${pct(h.cleanSheetRate)} / ${pct(a.cleanSheetRate)}).`);
  if(gates.recentBtts)reasons.push(`Recent six-match BTTS counts clear the profile (${recentHome}/6 / ${recentAway}/6).`);else failures.push(`Last 6 needs 4+ BTTS for both teams, or 5+ for either team (${recentHome??'—'}/6 / ${recentAway??'—'}/6).`);
  if(gates.leagueBtts)reasons.push(`League BTTS rate is ${pct(l.bttsRate)} (54%+ required).`);else failures.push(`League BTTS rate must be at least 54% (${pct(l.bttsRate)}).`);
  if(gates.matureSample)reasons.push(`Both teams have at least 10 completed league matches (${h.matchesPlayed} / ${a.matchesPlayed}).`);else failures.push(`Both teams need at least 10 completed league matches (${finite(h.matchesPlayed)?h.matchesPlayed:'—'} / ${finite(a.matchesPlayed)?a.matchesPlayed:'—'}).`);

  return{
    market:'GG / BTTS Statistical Profile',
    qualified,
    score,
    limits:LIMITS,
    gates,
    stats:{
      home:{matchesPlayed:finite(h.matchesPlayed)?n(h.matchesPlayed):null,bttsRate:r2(h.bttsRate),homeBttsRate:r2(h.homeBttsRate),scoreRate:r2(h.scoreRate),homeScoreRate:r2(h.homeScoreRate),concedeRate:r2(h.concedeRate),cleanSheetRate:r2(h.cleanSheetRate),last6Btts:finite(h.last6Btts)?n(h.last6Btts):null},
      away:{matchesPlayed:finite(a.matchesPlayed)?n(a.matchesPlayed):null,bttsRate:r2(a.bttsRate),awayBttsRate:r2(a.awayBttsRate),scoreRate:r2(a.scoreRate),awayScoreRate:r2(a.awayScoreRate),concedeRate:r2(a.concedeRate),cleanSheetRate:r2(a.cleanSheetRate),last6Btts:finite(a.last6Btts)?n(a.last6Btts):null},
      league:{matchesPlayed:finite(l.matchesPlayed)?n(l.matchesPlayed):null,bttsRate:r2(l.bttsRate)},
    },
    reasons,
    failures,
  };
}

module.exports={LIMITS,evaluateGG};
