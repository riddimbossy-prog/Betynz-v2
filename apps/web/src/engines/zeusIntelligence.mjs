import { round } from '../lib/utils.mjs';

const n = value => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const offered = value => n(value) !== null && n(value) > 1;
const formArray = value => (Array.isArray(value) ? value : String(value || '').toUpperCase().match(/[WDL]/g) || [])
  .map(value => String(value).toUpperCase()).filter(value => ['W','D','L'].includes(value)).slice(0, 10);
const points = rows => rows.reduce((sum, value) => sum + (value === 'W' ? 3 : value === 'D' ? 1 : 0), 0);
const streak = (rows, predicate) => { let count = 0; for (const row of rows || []) { if (!predicate(row)) break; count += 1; } return count; };

const DIR = Object.freeze({
  HOME: 'HOME_RESULT', AWAY: 'AWAY_RESULT', OVER: 'GOALS_OVER', UNDER: 'GOALS_UNDER',
  HOME_GOALS: 'HOME_GOALS', AWAY_GOALS: 'AWAY_GOALS', BTTS_YES: 'BTTS_YES', BTTS_NO: 'BTTS_NO'
});

function marketDirection(market) {
  const code = String(market || '').toUpperCase();
  if (['HOME_WIN','DOUBLE_CHANCE_1X','HTFT_HOME_HOME','HTFT_DRAW_HOME','HTFT_AWAY_HOME'].includes(code)) return DIR.HOME;
  if (['AWAY_WIN','DOUBLE_CHANCE_X2','HTFT_HOME_AWAY','HTFT_DRAW_AWAY','HTFT_AWAY_AWAY'].includes(code)) return DIR.AWAY;
  if (['OVER_0_5','OVER_1_5','OVER_2_5','OVER_3_5','FIRST_HALF_OVER_0_5'].includes(code)) return DIR.OVER;
  if (['UNDER_0_5','UNDER_1_5','UNDER_2_5','UNDER_3_5'].includes(code)) return DIR.UNDER;
  if (['HOME_OVER_0_5','HOME_OVER_1_5','HOME_OVER_2_5'].includes(code)) return DIR.HOME_GOALS;
  if (['AWAY_OVER_0_5','AWAY_OVER_1_5','AWAY_OVER_2_5'].includes(code)) return DIR.AWAY_GOALS;
  if (code === 'BTTS_YES') return DIR.BTTS_YES;
  if (code === 'BTTS_NO') return DIR.BTTS_NO;
  return `EXACT:${code}`;
}

export function isOppositeDirection(left, right) {
  const a = String(left || ''), b = String(right || '');
  const pairs = [
    [DIR.HOME, DIR.AWAY], [DIR.OVER, DIR.UNDER], [DIR.BTTS_YES, DIR.BTTS_NO]
  ];
  return pairs.some(([x,y]) => (a === x && b === y) || (a === y && b === x));
}

function normalizeVenue(split) {
  if (!split || typeof split !== 'object') return null;
  const form = formArray(split.form);
  const played = Math.max(0, Number(split.played || form.length || 0));
  const wins = Number(split.wins ?? form.filter(x => x === 'W').length) || 0;
  const draws = Number(split.draws ?? form.filter(x => x === 'D').length) || 0;
  const losses = Number(split.losses ?? form.filter(x => x === 'L').length) || 0;
  const ppg = n(split.ppg) ?? (played ? round((wins * 3 + draws) / played, 2) : null);
  return {
    played, form, wins, draws, losses, ppg,
    goalsForAvg: n(split.goalsForAvg) ?? 0,
    goalsAgainstAvg: n(split.goalsAgainstAvg) ?? 0,
    scoredIn: Number(split.scoredIn || 0), concededIn: Number(split.concededIn || 0),
    cleanSheets: Number(split.cleanSheets || 0), failedToScore: Number(split.failedToScore || 0),
    over15: Number(split.over15 || 0), over25: Number(split.over25 || 0), under35: Number(split.under35 || 0),
    btts: Number(split.btts || 0), halfTimeAvailable: Number(split.halfTimeAvailable || 0),
    htft: { WW:0,DW:0,LW:0,WD:0,DD:0,LD:0,WL:0,DL:0,LL:0,...(split.htft || {}) },
    recent3: form.slice(0,3),
    goalThresholds: split.goalThresholds || {}
  };
}

function normalizeStatsProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    played: Number(profile.played || 0), form: formArray(profile.form), wins: Number(profile.wins || 0), draws: Number(profile.draws || 0), losses: Number(profile.losses || 0),
    ppg: n(profile.ppg), goalsForAvg: n(profile.goalsForAvg), goalsAgainstAvg: n(profile.goalsAgainstAvg),
    winRate: n(profile.winRate), lossRate: n(profile.lossRate), xgFor: n(profile.xgFor), xgAgainst: n(profile.xgAgainst),
    xgSamples: Number(profile.xgSamples || 0), strengthScore: n(profile.strengthScore), classification: profile.classification || null,
    streaks: profile.streaks || {}
  };
}

function normalizeGoalProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  return {
    xgFor: n(profile.xgFor), xgAgainst: n(profile.xgAgainst), xgSamples: Number(profile.xgSamples || 0),
    sotFor: n(profile.sotFor), sotAgainst: n(profile.sotAgainst), sotSamples: Number(profile.sotSamples || 0)
  };
}

function engineSignals(engineResults = []) {
  const rows = engineResults.map(item => {
    const result = item?.result || item?.engine || item;
    const selection = result?.selection || null;
    return {
      code: item?.code || result?.engine || 'ENGINE', decision: result?.decision || null,
      direction: selection ? marketDirection(selection.market) : null,
      score: Number(selection?.score || result?.score || 0), market: selection?.market || null
    };
  }).filter(row => row.direction && ['FIRE','SAFER'].includes(String(row.decision || '').toUpperCase()));
  const counts = {};
  for (const row of rows) counts[row.direction] = (counts[row.direction] || 0) + 1;
  return { rows, counts };
}

function evidence(label, family, score, detail, available = true) {
  return { label, family, score: clamp(score), detail, available: Boolean(available) };
}

function contradiction(level, label, detail) { return { level, label, detail }; }

function weightedScore(items, weights) {
  let weight = 0, score = 0;
  for (const item of items) {
    if (!item?.available) continue;
    const w = Number(weights[item.family] || 0);
    if (!w) continue;
    weight += w; score += item.score * w;
  }
  return weight ? score / weight : 0;
}

const W = Object.freeze({ MATCHUP:18, ATTACK_DEFENCE:16, VENUE:14, XG:12, MOMENTUM:10, SOT:8, STRENGTH:8, STREAK:6, HTFT:5, ENGINES:3 });

function dataQuality({ home, away, statsHome, statsAway, goalHome, goalAway, odds = {} }) {
  let q = 0;
  if (home?.played >= 5 && away?.played >= 5) q += 25;
  else if (home?.played >= 3 && away?.played >= 3) q += 14;
  if ((statsHome?.played || 0) >= 8 && (statsAway?.played || 0) >= 8) q += 20;
  else if ((statsHome?.played || 0) >= 5 && (statsAway?.played || 0) >= 5) q += 12;
  const xgSamples = Math.min(Number(goalHome?.xgSamples || statsHome?.xgSamples || 0), Number(goalAway?.xgSamples || statsAway?.xgSamples || 0));
  if (xgSamples >= 4) q += 15; else if (xgSamples >= 2) q += 8;
  const sotSamples = Math.min(Number(goalHome?.sotSamples || 0), Number(goalAway?.sotSamples || 0));
  if (sotSamples >= 3) q += 10;
  if ((home?.halfTimeAvailable || 0) >= 3 && (away?.halfTimeAvailable || 0) >= 3) q += 10;
  if (home?.form?.length >= 5 && away?.form?.length >= 5) q += 10;
  if (Object.values(odds).filter(offered).length >= 5) q += 10;
  return Math.round(clamp(q));
}

function resultCandidate(side, ctx) {
  const isHome = side === 'home';
  const mine = isHome ? ctx.home : ctx.away, opp = isHome ? ctx.away : ctx.home;
  const mineStats = isHome ? ctx.statsHome : ctx.statsAway, oppStats = isHome ? ctx.statsAway : ctx.statsHome;
  const mineGoal = isHome ? ctx.goalHome : ctx.goalAway, oppGoal = isHome ? ctx.goalAway : ctx.goalHome;
  const direction = isHome ? DIR.HOME : DIR.AWAY;
  const ppgGap = (mine?.ppg ?? 0) - (opp?.ppg ?? 0);
  const statsGap = (mineStats?.strengthScore ?? 50) - (oppStats?.strengthScore ?? 50);
  const recentGap = points(mine?.recent3 || []) - points(opp?.recent3 || []);
  const attackEdge = (mine?.goalsForAvg ?? 0) + (opp?.goalsAgainstAvg ?? 0) - (opp?.goalsForAvg ?? 0) - (mine?.goalsAgainstAvg ?? 0);
  const xgFor = mineGoal?.xgFor ?? mineStats?.xgFor, xgAg = mineGoal?.xgAgainst ?? mineStats?.xgAgainst;
  const oppXgFor = oppGoal?.xgFor ?? oppStats?.xgFor, oppXgAg = oppGoal?.xgAgainst ?? oppStats?.xgAgainst;
  const xgEdge = xgFor !== null && oppXgFor !== null ? (xgFor + (oppXgAg ?? 0) - oppXgFor - (xgAg ?? 0)) : null;
  const sotEdge = mineGoal?.sotFor !== null && mineGoal?.sotFor !== undefined && oppGoal?.sotFor !== null && oppGoal?.sotFor !== undefined
    ? (mineGoal.sotFor + (oppGoal.sotAgainst ?? 0) - oppGoal.sotFor - (mineGoal.sotAgainst ?? 0)) : null;
  const myStreak = mineStats?.streaks || {}, oppStreak = oppStats?.streaks || {};
  const htSupport = (mine?.htft?.WW || 0) + (mine?.htft?.DW || 0) + (opp?.htft?.LL || 0) + (opp?.htft?.DL || 0);
  const engineSupport = Number(ctx.signals.counts[direction] || 0);
  const items = [
    evidence('Venue strength', 'VENUE', 50 + ppgGap * 28, `${mine?.ppg?.toFixed?.(2) ?? '—'} vs ${opp?.ppg?.toFixed?.(2) ?? '—'} venue PPG`, mine?.ppg !== null && opp?.ppg !== null),
    evidence('Opponent-adjusted strength proxy', 'STRENGTH', 50 + statsGap * 0.8, `${mineStats?.strengthScore ?? '—'} vs ${oppStats?.strengthScore ?? '—'} Stats strength`, Boolean(mineStats && oppStats)),
    evidence('Attack versus defence fit', 'ATTACK_DEFENCE', 50 + attackEdge * 22, `${Number(mine?.goalsForAvg || 0).toFixed(2)} GF vs ${Number(opp?.goalsAgainstAvg || 0).toFixed(2)} opponent GA`, Boolean(mine && opp)),
    evidence('Matchup compatibility', 'MATCHUP', 50 + ppgGap * 14 + attackEdge * 15 + ((oppStats?.lossRate ?? 0) - (mineStats?.lossRate ?? 0)) * 0.25, `PPG gap ${ppgGap.toFixed(2)} · attack edge ${attackEdge.toFixed(2)}`, Boolean(mine && opp)),
    evidence('Recent acceleration', 'MOMENTUM', 50 + recentGap * 7, `${points(mine?.recent3 || [])} vs ${points(opp?.recent3 || [])} points in recent 3`, Boolean(mine?.recent3?.length && opp?.recent3?.length)),
    evidence('Ordered streak support', 'STREAK', 45 + Math.min(8, Number(myStreak.unbeaten || 0)) * 6 + Math.min(8, Number(oppStreak.winless || 0)) * 4 - Math.min(8, Number(oppStreak.unbeaten || 0)) * 3, `${myStreak.unbeaten || 0} unbeaten vs ${oppStreak.winless || 0} opponent winless`, Boolean(mineStats && oppStats)),
    evidence('xG direction', 'XG', xgEdge === null ? 0 : 50 + xgEdge * 18, xgEdge === null ? 'xG sample unavailable' : `xG edge ${xgEdge.toFixed(2)}`, xgEdge !== null),
    evidence('Shots-on-target direction', 'SOT', sotEdge === null ? 0 : 50 + sotEdge * 8, sotEdge === null ? 'SOT sample unavailable' : `SOT edge ${sotEdge.toFixed(2)}`, sotEdge !== null),
    evidence('HT/FT transition fit', 'HTFT', 35 + htSupport * 9, `${htSupport} supportive lead/finish transitions`, (mine?.halfTimeAvailable || 0) >= 3 && (opp?.halfTimeAvailable || 0) >= 3),
    evidence('Independent-engine corroboration', 'ENGINES', 35 + engineSupport * 9, `${engineSupport}/7 underlying engines support the same direction`, true)
  ];
  const contradictions = [];
  if ((opp?.ppg ?? 0) >= 2.0 && (oppStats?.streaks?.unbeaten || 0) >= 4) contradictions.push(contradiction('HARD','Opposition elite resistance',`Opponent has ${opp.ppg.toFixed(2)} venue PPG and ${oppStats.streaks.unbeaten} unbeaten.`));
  if (xgEdge !== null && xgEdge <= -0.55) contradictions.push(contradiction('HARD','xG points the other way',`xG edge is ${xgEdge.toFixed(2)} against the route.`));
  else if (xgEdge !== null && xgEdge < -0.2) contradictions.push(contradiction('MEDIUM','xG weakens the route',`xG edge is ${xgEdge.toFixed(2)}.`));
  if (recentGap <= -4) contradictions.push(contradiction('MEDIUM','Recent form reversal',`Recent-three points trail by ${Math.abs(recentGap)}.`));
  const opposite = isHome ? DIR.AWAY : DIR.HOME;
  if (Number(ctx.signals.counts[opposite] || 0) >= 3) contradictions.push(contradiction('HARD','Engine opposition',`${ctx.signals.counts[opposite]} underlying engines support the opposite result direction.`));
  const target = isHome ? { market:'HOME_WIN', label:'Home Team to Win', odds:n(ctx.odds.homeWin) } : { market:'AWAY_WIN', label:'Away Team to Win', odds:n(ctx.odds.awayWin) };
  const safer = isHome ? { market:'DOUBLE_CHANCE_1X', label:'Home or Draw (1X)', odds:n(ctx.odds.doubleChance1X) } : { market:'DOUBLE_CHANCE_X2', label:'Draw or Away (X2)', odds:n(ctx.odds.doubleChanceX2) };
  return makeCandidate(isHome ? 'ZEUS_HOME_CONTROL':'ZEUS_AWAY_CONTROL', isHome ? 'Home statistical control':'Away statistical control', direction, items, contradictions, target, safer, ctx.dataQuality);
}

function goalsCandidate(over, ctx) {
  const home = ctx.home, away = ctx.away, hs = ctx.statsHome, as = ctx.statsAway, hg = ctx.goalHome, ag = ctx.goalAway;
  const direction = over ? DIR.OVER : DIR.UNDER;
  const combinedGoals = (home?.goalsForAvg || 0) + (home?.goalsAgainstAvg || 0) + (away?.goalsForAvg || 0) + (away?.goalsAgainstAvg || 0);
  const meanTotal = combinedGoals / 2;
  const overFrequency = (home?.over25 || 0) + (away?.over25 || 0);
  const under35Frequency = (home?.under35 || 0) + (away?.under35 || 0);
  const xgTotal = [hg?.xgFor ?? hs?.xgFor, hg?.xgAgainst ?? hs?.xgAgainst, ag?.xgFor ?? as?.xgFor, ag?.xgAgainst ?? as?.xgAgainst].filter(Number.isFinite);
  const xgMean = xgTotal.length >= 2 ? xgTotal.reduce((a,b)=>a+b,0) / 2 : null;
  const sotTotal = [hg?.sotFor, ag?.sotFor].filter(Number.isFinite);
  const sotMean = sotTotal.length === 2 ? sotTotal[0] + sotTotal[1] : null;
  const streakSupport = over
    ? Math.min(8, Number(hs?.streaks?.over15 || 0)) + Math.min(8, Number(as?.streaks?.over15 || 0))
    : Math.min(8, Number(hs?.streaks?.under35 || 0)) + Math.min(8, Number(as?.streaks?.under35 || 0));
  const engineSupport = Number(ctx.signals.counts[direction] || 0);
  const items = [
    evidence('Venue total-goal profile','VENUE', over ? 30 + meanTotal * 20 : 100 - meanTotal * 22, `${meanTotal.toFixed(2)} combined-goal profile`, Boolean(home && away)),
    evidence('Attack/defence goal fit','ATTACK_DEFENCE', over ? 35 + ((home?.scoredIn || 0)+(away?.scoredIn || 0))*6 : 85 - ((home?.scoredIn || 0)+(away?.scoredIn || 0))*4, `${(home?.scoredIn || 0)+(away?.scoredIn || 0)}/10 sides scored across venue samples`, Boolean(home && away)),
    evidence('Matchup totals compatibility','MATCHUP', over ? 35 + overFrequency * 7 : 25 + under35Frequency * 7, over ? `${overFrequency}/10 O2.5` : `${under35Frequency}/10 U3.5`, Boolean(home && away)),
    evidence('Recent totals momentum','MOMENTUM', over ? 40 + ((home?.over25 || 0)+(away?.over25 || 0))*6 : 35 + ((home?.under35 || 0)+(away?.under35 || 0))*6, 'Recent venue totals profile', Boolean(home && away)),
    evidence('Ordered goal streaks','STREAK', 35 + streakSupport * 4, `${streakSupport} combined streak strength`, Boolean(hs && as)),
    evidence('xG total','XG', xgMean === null ? 0 : over ? 30 + xgMean*24 : 105 - xgMean*25, xgMean === null ? 'xG sample unavailable' : `combined xG proxy ${xgMean.toFixed(2)}`, xgMean !== null),
    evidence('Shots-on-target total','SOT', sotMean === null ? 0 : over ? 25 + sotMean*7 : 100 - sotMean*7, sotMean === null ? 'SOT sample unavailable' : `${sotMean.toFixed(2)} combined SOT`, sotMean !== null),
    evidence('HT/FT event rate','HTFT', over ? 35 + ((home?.htft?.WW||0)+(home?.htft?.LL||0)+(away?.htft?.WW||0)+(away?.htft?.LL||0))*7 : 70 - ((home?.htft?.WW||0)+(home?.htft?.LL||0)+(away?.htft?.WW||0)+(away?.htft?.LL||0))*4, 'Half-time/full-time transition activity', (home?.halfTimeAvailable||0)>=3&&(away?.halfTimeAvailable||0)>=3),
    evidence('Independent-engine corroboration','ENGINES',35+engineSupport*9,`${engineSupport}/7 underlying engines support the same direction`,true),
    evidence('Overall statistical strength','STRENGTH',50 + ((hs?.strengthScore ?? 50)+(as?.strengthScore ?? 50)-100)*0.1,'Team-strength context',Boolean(hs&&as))
  ];
  const contradictions = [];
  if (over && xgMean !== null && xgMean < 1.85) contradictions.push(contradiction('HARD','Low xG environment',`Combined xG proxy is only ${xgMean.toFixed(2)}.`));
  if (!over && xgMean !== null && xgMean > 3.15) contradictions.push(contradiction('HARD','High xG environment',`Combined xG proxy is ${xgMean.toFixed(2)}.`));
  if (over && under35Frequency >= 9) contradictions.push(contradiction('MEDIUM','Strong under ceiling',`${under35Frequency}/10 venue games stayed under 3.5.`));
  if (!over && overFrequency >= 8) contradictions.push(contradiction('MEDIUM','Strong over profile',`${overFrequency}/10 venue games went over 2.5.`));
  const opposite = over ? DIR.UNDER : DIR.OVER;
  if (Number(ctx.signals.counts[opposite] || 0) >= 3) contradictions.push(contradiction('HARD','Engine opposition',`${ctx.signals.counts[opposite]} underlying engines support the opposite goals direction.`));
  const target = over ? {market:'OVER_2_5',label:'Over 2.5 Goals',odds:n(ctx.odds.over25)} : {market:'UNDER_2_5',label:'Under 2.5 Goals',odds:n(ctx.odds.under25)};
  const safer = over ? {market:'OVER_1_5',label:'Over 1.5 Goals',odds:n(ctx.odds.over15)} : {market:'UNDER_3_5',label:'Under 3.5 Goals',odds:n(ctx.odds.under35)};
  return makeCandidate(over?'ZEUS_GOAL_EXPANSION':'ZEUS_GOAL_CONTROL',over?'High-event goal environment':'Controlled goal environment',direction,items,contradictions,target,safer,ctx.dataQuality);
}

function teamGoalsCandidate(side, ctx) {
  const isHome = side === 'home', mine = isHome ? ctx.home : ctx.away, opp = isHome ? ctx.away : ctx.home;
  const ms = isHome ? ctx.statsHome : ctx.statsAway, os = isHome ? ctx.statsAway : ctx.statsHome;
  const mg = isHome ? ctx.goalHome : ctx.goalAway, og = isHome ? ctx.goalAway : ctx.goalHome;
  const direction = isHome ? DIR.HOME_GOALS : DIR.AWAY_GOALS;
  const xg = mg?.xgFor ?? ms?.xgFor, oppXga = og?.xgAgainst ?? os?.xgAgainst;
  const sot = mg?.sotFor;
  const scoring = Number(ms?.streaks?.scoring || 0), oppConceding = Number(os?.streaks?.conceding || 0);
  const engineSupport = Number(ctx.signals.counts[direction] || 0);
  const items = [
    evidence('Scoring production','ATTACK_DEFENCE',30+(mine?.goalsForAvg||0)*28,`${Number(mine?.goalsForAvg||0).toFixed(2)} goals for`,Boolean(mine)),
    evidence('Opponent concession','MATCHUP',30+(opp?.goalsAgainstAvg||0)*28,`${Number(opp?.goalsAgainstAvg||0).toFixed(2)} opponent goals against`,Boolean(opp)),
    evidence('Venue strength','VENUE',30+(mine?.ppg||0)*22,`${mine?.ppg?.toFixed?.(2)||'—'} PPG`,Boolean(mine)),
    evidence('Scoring streak','STREAK',35+Math.min(8,scoring)*6+Math.min(8,oppConceding)*3,`${scoring} scoring · opponent ${oppConceding} conceding`,Boolean(ms&&os)),
    evidence('xG support','XG',xg===null||xg===undefined?0:30+xg*28+(oppXga||0)*10,xg==null?'xG unavailable':`${xg.toFixed(2)} attacking xG`,xg!==null&&xg!==undefined),
    evidence('SOT support','SOT',sot===null||sot===undefined?0:25+sot*10,sot==null?'SOT unavailable':`${sot.toFixed(2)} SOT`,sot!==null&&sot!==undefined),
    evidence('Recent momentum','MOMENTUM',35+points(mine?.recent3||[])*6,`${points(mine?.recent3||[])} recent-three points`,Boolean(mine?.recent3?.length)),
    evidence('Overall strength','STRENGTH',ms?.strengthScore??50,`${ms?.strengthScore??'—'} strength`,Boolean(ms)),
    evidence('HT/FT scoring control','HTFT',35+((mine?.htft?.WW||0)+(mine?.htft?.DW||0))*9,'Lead/late-win transition support',(mine?.halfTimeAvailable||0)>=3),
    evidence('Independent-engine corroboration','ENGINES',35+engineSupport*9,`${engineSupport}/7 underlying engines support team goals`,true)
  ];
  const contradictions=[];
  if ((mine?.failedToScore||0)>=3) contradictions.push(contradiction('HARD','Frequent blanks',`${mine.failedToScore}/5 venue matches without scoring.`));
  if ((opp?.cleanSheets||0)>=3) contradictions.push(contradiction('MEDIUM','Opponent clean-sheet strength',`${opp.cleanSheets}/5 clean sheets.`));
  if (xg!==null&&xg!==undefined&&xg<0.85) contradictions.push(contradiction('HARD','Weak xG attack',`Attacking xG is only ${xg.toFixed(2)}.`));
  const target = isHome ? {market:'HOME_OVER_1_5',label:'Home Team Over 1.5 Goals',odds:n(ctx.odds.homeOver15)} : {market:'AWAY_OVER_1_5',label:'Away Team Over 1.5 Goals',odds:n(ctx.odds.awayOver15)};
  const safer = isHome ? {market:'HOME_OVER_0_5',label:'Home Team Over 0.5 Goals',odds:n(ctx.odds.homeOver05)} : {market:'AWAY_OVER_0_5',label:'Away Team Over 0.5 Goals',odds:n(ctx.odds.awayOver05)};
  return makeCandidate(isHome?'ZEUS_HOME_GOALS':'ZEUS_AWAY_GOALS',isHome?'Home scoring superiority':'Away scoring superiority',direction,items,contradictions,target,safer,ctx.dataQuality);
}

function makeCandidate(id, name, direction, items, contradictions, target, safer, quality) {
  const available = items.filter(item => item.available);
  const raw = weightedScore(available, W);
  const hard = contradictions.filter(x=>x.level==='HARD').length;
  const medium = contradictions.filter(x=>x.level==='MEDIUM').length;
  const soft = contradictions.filter(x=>x.level==='SOFT').length;
  const score = Math.round(clamp(raw - hard*28 - medium*10 - soft*4));
  const supportingFamilies = new Set(available.filter(item=>item.score>=62).map(item=>item.family));
  const confidence = Math.round(clamp(score * 0.82 + quality * 0.18));
  let selection = null;
  const veto = hard > 0 || medium >= 2;
  if (!veto && quality >= 55 && supportingFamilies.size >= 4 && confidence >= 84 && offered(target?.odds)) {
    selection = { ...target, decision:'FIRE' };
  } else if (!veto && quality >= 55 && supportingFamilies.size >= 4 && confidence >= 78 && offered(safer?.odds)) {
    selection = { ...safer, decision:'SAFER', downgradedFrom: target?.market || null };
  }
  if (selection) Object.assign(selection, {
    routeId:id, routeName:name, score:confidence, grade:confidence>=94?'ZEUS PRIME':confidence>=90?'ELITE':confidence>=84?'STRONG':'QUALIFIED',
    evidenceFamilies:supportingFamilies.size,
    reasons: available.filter(x=>x.score>=62).sort((a,b)=>b.score-a.score).slice(0,6).map(x=>`${x.label}: ${x.detail}.`),
    warnings: contradictions.map(x=>`${x.level}: ${x.label} — ${x.detail}`)
  });
  return { id,name,direction,score,confidence,dataQuality:quality,evidence:items,contradictions,target,safer,selection,veto,supportingFamilies:[...supportingFamilies] };
}

function chooseBest(candidates) {
  const ranked = [...candidates].sort((a,b)=>b.confidence-a.confidence||b.dataQuality-a.dataQuality);
  const best = ranked[0] || null;
  if (!best) return { best:null, conflict:false };
  const runner = ranked[1] || null;
  if (runner && isOppositeDirection(best.direction, runner.direction) && Math.abs(best.confidence-runner.confidence) <= 7) {
    return { best:null, conflict:true, reason:`${best.name} and ${runner.name} are too close and point in opposite directions.` };
  }
  return { best, conflict:false };
}

export function analyzeZeusIntelligence({ fixture = {}, stats = null, statsEvidence = null, engineResults = [] } = {}) {
  const home = normalizeVenue(stats?.homeSplit || stats?.home || fixture?.stats?.homeSplit);
  const away = normalizeVenue(stats?.awaySplit || stats?.away || fixture?.stats?.awaySplit);
  const statsHome = normalizeStatsProfile(statsEvidence?.home);
  const statsAway = normalizeStatsProfile(statsEvidence?.away);
  const goalHome = normalizeGoalProfile(statsEvidence?.homeGoal);
  const goalAway = normalizeGoalProfile(statsEvidence?.awayGoal);
  const odds = fixture.odds || {};
  const signals = engineSignals(engineResults);
  const quality = dataQuality({ home, away, statsHome, statsAway, goalHome, goalAway, odds });
  const base = {
    engine:'ZEUS_SUPERVISOR', decision:'NO_CLEAR_EDGE', selection:null, dataQuality:quality, confidence:0,
    dominantDirection:null, candidates:[], contradictions:[], evidenceFamilies:[],
    supervisor:{ verdict:'HOLD', reason:'No clear statistical edge.' },
    explanation:'Zeus found no sufficiently complete, contradiction-free statistical edge.'
  };
  if (!home || !away || home.played < 3 || away.played < 3) {
    return { ...base, decision:'WAITING', supervisor:{ verdict:'WAIT', reason:'Venue statistics are still incomplete.' }, explanation:`Zeus requires meaningful venue samples. Home ${home?.played||0}; away ${away?.played||0}.` };
  }
  const ctx = { fixture, home, away, statsHome, statsAway, goalHome, goalAway, odds, signals, dataQuality:quality };
  const candidates = [resultCandidate('home',ctx),resultCandidate('away',ctx),goalsCandidate(true,ctx),goalsCandidate(false,ctx),teamGoalsCandidate('home',ctx),teamGoalsCandidate('away',ctx)];
  const chosen = chooseBest(candidates);
  if (chosen.conflict) return { ...base, candidates, decision:'STAT_CONFLICT', supervisor:{verdict:'VETO',reason:chosen.reason}, explanation:chosen.reason };
  const best = chosen.best;
  if (!best) return { ...base, candidates };
  const hard = best.contradictions.filter(x=>x.level==='HARD');
  const medium = best.contradictions.filter(x=>x.level==='MEDIUM');
  if (hard.length || medium.length >= 2) {
    return { ...base, candidates, confidence:best.confidence, dominantDirection:best.direction, contradictions:best.contradictions, evidenceFamilies:best.supportingFamilies,
      decision:'VETO', supervisor:{verdict:'VETO',reason:hard[0]?.detail||'Multiple medium contradictions block the route.'},
      explanation:`Zeus vetoed ${best.name} after contradiction testing.` };
  }
  if (quality < 55) {
    return { ...base, candidates, confidence:best.confidence, dominantDirection:best.direction, contradictions:best.contradictions, evidenceFamilies:best.supportingFamilies,
      decision:'WAITING', supervisor:{verdict:'WAIT',reason:`Data quality ${quality}/100 is below the minimum.`}, explanation:`Zeus detected ${best.name}, but data quality is only ${quality}/100.` };
  }
  if (!best.selection) {
    return { ...base, candidates, confidence:best.confidence, dominantDirection:best.direction, contradictions:best.contradictions, evidenceFamilies:best.supportingFamilies,
      supervisor:{verdict:'HOLD',reason:`Best route confidence is ${best.confidence}/100 without a publishable selection.`}, explanation:`${best.name} is the strongest direction, but it did not reach Zeus publication requirements.` };
  }
  return {
    ...base, candidates, decision:best.selection.decision, selection:best.selection, confidence:best.confidence, dataQuality:quality,
    dominantDirection:best.direction, contradictions:best.contradictions, evidenceFamilies:best.supportingFamilies,
    supervisor:{verdict:'APPROVE',reason:`${best.name} passed data-quality and contradiction gates.`},
    explanation:`${best.name}. Zeus combines venue strength, matchup fit, attack/defence, momentum, streaks, xG, SOT, HT/FT transitions and independent-engine corroboration, then applies a separate contradiction veto.`
  };
}

export function applyZeusSupervisor(consensus = {}, zeus = null) {
  const base = { ...consensus, zeus: zeus ? { decision:zeus.decision, confidence:zeus.confidence, dataQuality:zeus.dataQuality, dominantDirection:zeus.dominantDirection, verdict:zeus.supervisor?.verdict || 'HOLD', reason:zeus.supervisor?.reason || null, selection:zeus.selection || null } : null };
  if (!consensus?.final || !consensus?.agreementDirection || !zeus) return base;
  if ((zeus.dataQuality || 0) < 55 || zeus.decision === 'WAITING') return { ...base, zeusVerdict:'INSUFFICIENT_DATA' };
  const zeusDirection = zeus.dominantDirection || (zeus.selection ? marketDirection(zeus.selection.market) : null);
  if (zeus.supervisor?.verdict === 'VETO' || (zeusDirection && isOppositeDirection(zeusDirection, consensus.agreementDirection) && (zeus.confidence || 0) >= 84)) {
    return {
      ...base, classification:'ZEUS_HOLD', final:null, zeusVerdict:'VETO', status:'PROVISIONAL',
      reasons:[...(consensus.reasons || []),`Zeus hold: ${zeus.supervisor?.reason || 'The statistical supervisor found a strong contradiction.'}`]
    };
  }
  if (zeusDirection === consensus.agreementDirection && zeus.supervisor?.verdict === 'APPROVE') {
    return {
      ...base, zeusVerdict:'APPROVED', reasons:[...(consensus.reasons || []),`Zeus approved the shared direction at ${Math.round(zeus.confidence || 0)}/100 confidence with ${Math.round(zeus.dataQuality || 0)}/100 data quality.`]
    };
  }
  if (zeus.supervisor?.verdict === 'HOLD' && (zeus.confidence || 0) >= 84) {
    return { ...base, classification:'ZEUS_HOLD', final:null, zeusVerdict:'HOLD', reasons:[...(consensus.reasons || []),`Zeus did not find a clear enough statistical edge to authorize publication.`] };
  }
  return { ...base, zeusVerdict:'NEUTRAL' };
}

export function zeusSummary(rows = []) {
  return {
    fixtures: rows.length,
    approved: rows.filter(x=>['FIRE','SAFER'].includes(x?.engine?.decision)).length,
    fire: rows.filter(x=>x?.engine?.decision==='FIRE').length,
    safer: rows.filter(x=>x?.engine?.decision==='SAFER').length,
    veto: rows.filter(x=>['VETO','STAT_CONFLICT'].includes(x?.engine?.decision)).length,
    waiting: rows.filter(x=>x?.engine?.decision==='WAITING').length,
    noEdge: rows.filter(x=>x?.engine?.decision==='NO_CLEAR_EDGE').length
  };
}

export function zeusDirectionForMarket(market) { return marketDirection(market); }
