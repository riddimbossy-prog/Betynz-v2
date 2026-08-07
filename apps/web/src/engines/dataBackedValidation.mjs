import { round } from '../lib/utils.mjs';

const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const pct = (part, total) => total > 0 && Number.isFinite(Number(part)) ? round(Number(part) / total * 100, 1) : null;
const avg = (...values) => {
  const good = values.map(num).filter(Number.isFinite);
  return good.length ? round(good.reduce((a,b)=>a+b,0)/good.length, 2) : null;
};

function split(stats, side) {
  return stats?.[`${side}Split`] || stats?.[side] || stats?.venueForm?.[side] || null;
}
function rate(profile, key) {
  const direct = num(profile?.rates?.[key]);
  if (direct !== null) return direct;
  return pct(profile?.[key], num(profile?.played) || 0);
}
function thresholdRate(profile, line, side='over') {
  const block = profile?.goalThresholds?.[String(line)] || profile?.goalThresholds?.[Number(line).toFixed(1)];
  const direct = num(block?.[`${side}Rate`]);
  if (direct !== null) return direct;
  const count = num(block?.[side]);
  return count !== null ? pct(count, num(profile?.played) || 0) : null;
}
function htftRate(profile, code) {
  const played = num(profile?.halfTimeAvailable) || 0;
  const count = num(profile?.htft?.[code]);
  return count !== null && played ? round(count / played * 100, 1) : null;
}
function evidenceProfile(statsEvidence, side) { return statsEvidence?.[side] || null; }
function goalProfile(statsEvidence, side) { return statsEvidence?.[`${side}Goal`] || null; }

function evidence(label, value, { pass, fail, weight = 1, format = null, source = 'MATCH_DATA' } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const state = pass(value) ? 'SUPPORT' : fail(value) ? 'OPPOSE' : 'NEUTRAL';
  const display = format ? format(value) : typeof value === 'number' ? round(value, 2) : String(value);
  return { label, value: display, state, weight, source };
}
function push(list, item) { if (item) list.push(item); }

function marketFamily(market='') {
  const m = String(market).toUpperCase();
  if (m === 'HOME_WIN' || m === 'DOUBLE_CHANCE_1X') return { family:'HOME_RESULT', side:'home' };
  if (m === 'AWAY_WIN' || m === 'DOUBLE_CHANCE_X2') return { family:'AWAY_RESULT', side:'away' };
  if (m === 'DRAW') return { family:'DRAW_RESULT', mode:'DRAW' };
  if (m === 'DOUBLE_CHANCE_12') return { family:'DRAW_RESULT', mode:'NO_DRAW' };
  if (m === 'BTTS_YES') return { family:'BTTS_YES' };
  if (m === 'BTTS_NO') return { family:'BTTS_NO' };
  if (/^OVER_/.test(m)) return { family:'TOTAL_OVER', line:Number(m.match(/(\d)_(\d)/)?.slice(1).join('.') || 0) };
  if (/^UNDER_/.test(m)) return { family:'TOTAL_UNDER', line:Number(m.match(/(\d)_(\d)/)?.slice(1).join('.') || 0) };
  if (/^HOME_OVER_/.test(m)) return { family:'TEAM_OVER', side:'home', line:Number(m.match(/(\d)_(\d)/)?.slice(1).join('.') || 0) };
  if (/^AWAY_OVER_/.test(m)) return { family:'TEAM_OVER', side:'away', line:Number(m.match(/(\d)_(\d)/)?.slice(1).join('.') || 0) };
  if (/^HOME_UNDER_/.test(m)) return { family:'TEAM_UNDER', side:'home', line:Number(m.match(/(\d)_(\d)/)?.slice(1).join('.') || 0) };
  if (/^AWAY_UNDER_/.test(m)) return { family:'TEAM_UNDER', side:'away', line:Number(m.match(/(\d)_(\d)/)?.slice(1).join('.') || 0) };
  if (/^FIRST_HALF_OVER_/.test(m)) return { family:'FIRST_HALF_OVER', line:Number(m.match(/(\d)_(\d)/)?.slice(1).join('.') || 0) };
  if (/^FIRST_HALF_UNDER_/.test(m)) return { family:'FIRST_HALF_UNDER', line:Number(m.match(/(\d)_(\d)/)?.slice(1).join('.') || 0) };
  const ht = {
    HTFT_HOME_HOME:['WW','LL'], HTFT_DRAW_HOME:['DW','DL'], HTFT_AWAY_HOME:['LW','WL'],
    HTFT_HOME_DRAW:['WD','LD'], HTFT_DRAW_DRAW:['DD','DD'], HTFT_AWAY_DRAW:['LD','WD'],
    HTFT_HOME_AWAY:['WL','LW'], HTFT_DRAW_AWAY:['DL','DW'], HTFT_AWAY_AWAY:['LL','WW']
  }[m];
  if (ht) return { family:'HTFT', homeCode:ht[0], awayCode:ht[1] };
  return { family:'UNKNOWN' };
}

function buildEvidence(selection, stats, statsEvidence, fixture = {}) {
  const home = split(stats,'home'), away = split(stats,'away');
  const H = evidenceProfile(statsEvidence,'home'), A = evidenceProfile(statsEvidence,'away');
  const HG = goalProfile(statsEvidence,'home'), AG = goalProfile(statsEvidence,'away');
  const info = marketFamily(selection?.market);
  const rows = [];
  const guards = {};
  const odds = fixture?.odds || {};
  const homePlayed = num(home?.played)||0, awayPlayed=num(away?.played)||0;
  const sample = { home:homePlayed, away:awayPlayed, statsApiHome:num(H?.played)||0, statsApiAway:num(A?.played)||0 };
  const per = v => `${round(v,1)}%`;

  if (info.family === 'TOTAL_OVER' || info.family === 'TOTAL_UNDER') {
    const over = info.family === 'TOTAL_OVER';
    const line = Number.isFinite(info.line) ? info.line : 2.5;
    const venueRate = over
      ? avg(thresholdRate(home,line,'over'), thresholdRate(away,line,'over'))
      : avg(thresholdRate(home,line,'under'), thresholdRate(away,line,'under'));
    const lineKey = line===1.5?'over15':line===2.5?'over25':line===3.5?'under35':null;
    const fallbackRate = lineKey ? avg(rate(home,lineKey),rate(away,lineKey)) : null;
    const chosenRate = venueRate ?? fallbackRate;
    const pace = avg(num(home?.goalsPerMatch), num(away?.goalsPerMatch));
    const xg = avg(num(HG?.xgFor ?? H?.xgFor), num(AG?.xgFor ?? A?.xgFor));
    const xgCombined = [num(HG?.xgFor ?? H?.xgFor),num(AG?.xgFor ?? A?.xgFor)].filter(Number.isFinite).reduce((s,v)=>s+v,0) || null;
    const sotCombined = [num(HG?.sotFor),num(AG?.sotFor)].filter(Number.isFinite).reduce((s,v)=>s+v,0) || null;
    const supportRate = line <= 1.5 ? 65 : line <= 2.5 ? 55 : 45;
    const failRate = line <= 1.5 ? 35 : line <= 2.5 ? 30 : 25;
    push(rows,evidence(`${over?'Over':'Under'} ${line.toFixed(1)} venue frequency`,chosenRate,{pass:v=>over?v>=supportRate:v>=supportRate,fail:v=>over?v<=failRate:v<=failRate,weight:2,format:per,source:'VENUE_HISTORY'}));
    const streakKey = over ? (line<=1.5?'over15':line<=2.5?'over25':'over35') : (line<=1.5?'under15':line<=2.5?'under25':'under35');
    const streakStrength = avg(num(H?.streaks?.[streakKey]), num(A?.streaks?.[streakKey]));
    push(rows,evidence(`${over?'Over':'Under'} streak continuity`,streakStrength,{pass:v=>v>=3.5,fail:v=>v<=1,weight:1.5,source:'STATS_API_STREAKS'}));
    push(rows,evidence('Combined venue goal pace',pace,{pass:v=>over?v>=(line===1.5?2.2:line===2.5?2.7:3.25):v<=(line===1.5?1.8:line===2.5?2.35:3.0),fail:v=>over?v<=(line===1.5?1.55:line===2.5?2.0:2.6):v>=(line===1.5?2.4:line===2.5?3.1:3.7),weight:2,source:'VENUE_HISTORY'}));
    push(rows,evidence('Recent combined xG',xgCombined,{pass:v=>over?v>=(line===1.5?1.9:line===2.5?2.35:3.0):v<=(line===1.5?1.8:line===2.5?2.45:3.1),fail:v=>over?v<=(line===1.5?1.35:line===2.5?1.85:2.3):v>=(line===1.5?2.4:line===2.5?3.1:3.8),weight:2,source:'STATS_API_XG'}));
    push(rows,evidence('Combined shots on target',sotCombined,{pass:v=>over?v>=(line===1.5?5.8:line===2.5?7.0:8.6):v<=(line===1.5?5.5:line===2.5?7.0:8.2),fail:v=>over?v<=(line===1.5?4.0:line===2.5?5.0:6.0):v>=(line===1.5?7.5:line===2.5?9.0:10.5),weight:1.5,source:'STATS_API_SOT'}));

    // For 3+ match-goal routes, one side failing its own O0.5 market changes the
    // question: the remaining side must be capable of supplying all three goals.
    // This prevents a generic Over 2.5 upgrade when the weaker team is priced not to contribute.
    if (over && line >= 2.5) {
      const homeWin=num(odds.homeWin), awayWin=num(odds.awayWin);
      const favourite=homeWin!==null&&awayWin!==null?(homeWin<awayWin?'home':awayWin<homeWin?'away':null):null;
      if (favourite) {
        const weak=favourite==='home'?'away':'home';
        const weak05=num(odds[weak==='home'?'homeOver05':'awayOver05']);
        if (weak05!==null && weak05>1.30) {
          const favSplit=favourite==='home'?home:away;
          const favEvidence=favourite==='home'?H:A;
          const favGoal=favourite==='home'?HG:AG;
          const threeRate=rate(favSplit,'scored3Plus');
          const gf=num(favSplit?.goalsForAvg);
          const fxg=num(favGoal?.xgFor ?? favEvidence?.xgFor);
          const fsot=num(favGoal?.sotFor);
          const checks=[
            threeRate===null?null:threeRate>=40,
            gf===null?null:gf>=2.15,
            fxg===null?null:fxg>=2.15,
            fsot===null?null:fsot>=5.2
          ].filter(v=>v!==null);
          const capability=checks.length?round(checks.filter(Boolean).length/checks.length*100,1):null;
          guards.soloThreeRequired=true;
          guards.soloThreeCapability=capability;
          guards.soloThreeSide=favourite;
          guards.weakGoalPrice=weak05;
          push(rows,evidence('Weaker-team one-goal price',weak05,{pass:v=>v<=1.30,fail:v=>v>=1.55,weight:1.2,source:'MARKET_STRUCTURE'}));
          push(rows,evidence(`${favourite==='home'?'Home':'Away'} 3+ goal frequency`,threeRate,{pass:v=>v>=40,fail:v=>v<=10,weight:2,format:per,source:'VENUE_HISTORY'}));
          push(rows,evidence(`${favourite==='home'?'Home':'Away'} venue scoring average`,gf,{pass:v=>v>=2.15,fail:v=>v<=1.35,weight:1.5,source:'VENUE_HISTORY'}));
          push(rows,evidence(`${favourite==='home'?'Home':'Away'} xG for solo 3-goal route`,fxg,{pass:v=>v>=2.15,fail:v=>v<=1.35,weight:1.5,source:'STATS_API_XG'}));
          push(rows,evidence(`${favourite==='home'?'Home':'Away'} SOT for solo 3-goal route`,fsot,{pass:v=>v>=5.2,fail:v=>v<=3.0,weight:1.2,source:'STATS_API_SOT'}));
        }
      }
    }
  }

  if (info.family === 'TEAM_OVER' || info.family === 'TEAM_UNDER') {
    const over=info.family==='TEAM_OVER', side=info.side, own=side==='home'?home:away, opp=side==='home'?away:home, ownE=side==='home'?H:A, ownG=side==='home'?HG:AG, oppG=side==='home'?AG:HG;
    const line=info.line||0.5;
    const scoreRate = line<=0.5 ? rate(own,'scoredIn') : line<=1.5 ? rate(own,'scored2Plus') : line<=2.5 ? rate(own,'scored3Plus') : null;
    const concedeRate = line<=0.5 ? rate(opp,'concededIn') : line<=1.5 ? rate(opp,'conceded2Plus') : line<=2.5 ? rate(opp,'conceded3Plus') : null;
    const gf=num(own?.goalsForAvg), ga=num(opp?.goalsAgainstAvg);
    const xgBlend=avg(num(ownG?.xgFor ?? ownE?.xgFor),num(oppG?.xgAgainst));
    const sotBlend=avg(num(ownG?.sotFor),num(oppG?.sotAgainst));
    const targetRate=line<=0.5?70:line<=1.5?45:25, badRate=line<=0.5?40:line<=1.5?20:8;
    const teamStreakKey = over ? (line<=0.5?'teamOver05':line<=1.5?'teamOver15':'teamOver25') : (line<=0.5?'teamUnder05':line<=1.5?'teamUnder15':'teamUnder25');
    push(rows,evidence(`${side==='home'?'Home':'Away'} team-goal streak`,num(ownE?.streaks?.[teamStreakKey]),{pass:v=>v>=4,fail:v=>v<=1,weight:1.5,source:'STATS_API_STREAKS'}));
    push(rows,evidence(`${side==='home'?'Home':'Away'} scoring frequency`,scoreRate,{pass:v=>over?v>=targetRate:v<=badRate,fail:v=>over?v<=badRate:v>=targetRate,weight:2,format:per,source:'VENUE_HISTORY'}));
    push(rows,evidence('Opponent conceding frequency',concedeRate,{pass:v=>over?v>=targetRate:v<=badRate,fail:v=>over?v<=badRate:v>=targetRate,weight:2,format:per,source:'VENUE_HISTORY'}));
    const avgSupport=line<=0.5?1.05:line<=1.5?1.45:2.15, avgFail=line<=0.5?0.55:line<=1.5?0.85:1.25;
    const xgSupport=line<=0.5?1.0:line<=1.5?1.5:2.15, xgFail=line<=0.5?0.55:line<=1.5?0.9:1.35;
    const sotSupport=line<=0.5?3.0:line<=1.5?4.1:5.2, sotFail=line<=0.5?1.8:line<=1.5?2.7:3.3;
    push(rows,evidence('Scoring/conceding average fit',avg(gf,ga),{pass:v=>over?v>=avgSupport:v<=avgFail,fail:v=>over?v<=avgFail:v>=avgSupport+0.45,weight:1.5,source:'VENUE_HISTORY'}));
    push(rows,evidence('xG pressure fit',xgBlend,{pass:v=>over?v>=xgSupport:v<=xgFail+0.25,fail:v=>over?v<=xgFail:v>=xgSupport+0.35,weight:2,source:'STATS_API_XG'}));
    push(rows,evidence('SOT pressure fit',sotBlend,{pass:v=>over?v>=sotSupport:v<=sotFail+0.6,fail:v=>over?v<=sotFail:v>=sotSupport+1.1,weight:1.5,source:'STATS_API_SOT'}));
  }

  if (info.family === 'DRAW_RESULT') {
    const homeDraw=rate(home,'draws'), awayDraw=rate(away,'draws');
    const drawRate=avg(homeDraw,awayDraw);
    const homePpg=num(home?.ppg)??num(H?.ppg), awayPpg=num(away?.ppg)??num(A?.ppg);
    const ppgGap=homePpg!==null&&awayPpg!==null?Math.abs(round(homePpg-awayPpg,2)):null;
    if (info.mode === 'NO_DRAW') {
      const noDrawRate=drawRate===null?null:round(100-drawRate,1);
      const noDrawStreak=avg(num(H?.streaks?.noDraws),num(A?.streaks?.noDraws));
      push(rows,evidence('No-draw venue frequency',noDrawRate,{pass:v=>v>=70,fail:v=>v<=45,weight:2,format:per,source:'VENUE_HISTORY'}));
      push(rows,evidence('No-draw streak continuity',noDrawStreak,{pass:v=>v>=3,fail:v=>v<=1,weight:1.2,source:'STATS_API_STREAKS'}));
    } else {
      const drawStreak=avg(num(H?.streaks?.draws),num(A?.streaks?.draws));
      push(rows,evidence('Draw venue frequency',drawRate,{pass:v=>v>=35,fail:v=>v<=12,weight:2,format:per,source:'VENUE_HISTORY'}));
      push(rows,evidence('Team-strength balance',ppgGap,{pass:v=>v<=0.35,fail:v=>v>=1.0,weight:1.5,source:'VENUE_HISTORY'}));
      push(rows,evidence('Draw streak continuity',drawStreak,{pass:v=>v>=2,fail:v=>v===0,weight:1.1,source:'STATS_API_STREAKS'}));
    }
  }

  if (info.family === 'HOME_RESULT' || info.family === 'AWAY_RESULT') {
    const side=info.side, own=side==='home'?home:away, opp=side==='home'?away:home, ownE=side==='home'?H:A, oppE=side==='home'?A:H;
    const ppgGap=(num(own?.ppg)??num(ownE?.ppg)) !== null && (num(opp?.ppg)??num(oppE?.ppg)) !== null ? round((num(own?.ppg)??num(ownE?.ppg))-(num(opp?.ppg)??num(oppE?.ppg)),2) : null;
    const winRate=rate(own,'wins') ?? num(ownE?.winRate), oppLoss=rate(opp,'losses') ?? num(oppE?.lossRate);
    push(rows,evidence('Venue PPG advantage',ppgGap,{pass:v=>v>=0.45,fail:v=>v<=-0.35,weight:2,source:'VENUE_HISTORY'}));
    push(rows,evidence('Selected-side win rate',winRate,{pass:v=>v>=55,fail:v=>v<=20,weight:2,format:per,source:'VENUE_HISTORY'}));
    push(rows,evidence('Opponent loss rate',oppLoss,{pass:v=>v>=40,fail:v=>v<=15,weight:1.5,format:per,source:'VENUE_HISTORY'}));
    const strengthGap=(num(ownE?.strengthScore)!==null&&num(oppE?.strengthScore)!==null)?round(num(ownE.strengthScore)-num(oppE.strengthScore),1):null;
    push(rows,evidence('Stats API strength gap',strengthGap,{pass:v=>v>=18,fail:v=>v<=-12,weight:1.5,source:'STATS_API'}));
    const formEdge = avg(num(ownE?.streaks?.wins), num(ownE?.streaks?.unbeaten));
    const oppWeak = avg(num(oppE?.streaks?.losses), num(oppE?.streaks?.winless));
    push(rows,evidence('Winning/unbeaten streak strength',formEdge,{pass:v=>v>=3,fail:v=>v<=0.5,weight:1.2,source:'STATS_API_STREAKS'}));
    push(rows,evidence('Opponent winless/loss streak',oppWeak,{pass:v=>v>=2.5,fail:v=>v<=0.5,weight:1.2,source:'STATS_API_STREAKS'}));
    push(rows,evidence('Selected-side 2+ goal frequency',rate(own,'scored2Plus'),{pass:v=>v>=45,fail:v=>v<=15,weight:1.0,format:per,source:'VENUE_HISTORY'}));
    push(rows,evidence('Opponent failed-to-score frequency',rate(opp,'failedToScore'),{pass:v=>v>=30,fail:v=>v<=8,weight:1.0,format:per,source:'VENUE_HISTORY'}));
  }

  if (info.family === 'BTTS_YES' || info.family === 'BTTS_NO') {
    const yes=info.family==='BTTS_YES';
    const btts=avg(rate(home,'btts'),rate(away,'btts'));
    const scoring=avg(rate(home,'scoredIn'),rate(away,'scoredIn'));
    const blank=avg(rate(home,'failedToScore'),rate(away,'failedToScore'));
    push(rows,evidence('BTTS venue frequency',btts,{pass:v=>yes?v>=55:v<=40,fail:v=>yes?v<=25:v>=70,weight:2,format:per,source:'VENUE_HISTORY'}));
    push(rows,evidence('Both-team scoring frequency',scoring,{pass:v=>yes?v>=75:v<=60,fail:v=>yes?v<=45:v>=90,weight:1.5,format:per,source:'VENUE_HISTORY'}));
    push(rows,evidence('Failed-to-score frequency',blank,{pass:v=>yes?v<=20:v>=25,fail:v=>yes?v>=45:v<=8,weight:1.5,format:per,source:'VENUE_HISTORY'}));
  }

  if (info.family === 'FIRST_HALF_OVER' || info.family === 'FIRST_HALF_UNDER') {
    const over=info.family==='FIRST_HALF_OVER', line=info.line||0.5;
    const rate05=avg(rate(home,'firstHalfOver05'),rate(away,'firstHalfOver05'));
    const fhPace=avg(num(home?.firstHalfGoalsAvg),num(away?.firstHalfGoalsAvg));
    push(rows,evidence('First-half goal frequency',rate05,{pass:v=>over?v>=60:v<=45,fail:v=>over?v<=25:v>=75,weight:2,format:per,source:'HT_HISTORY'}));
    push(rows,evidence('First-half goal pace',fhPace,{pass:v=>over?v>=(line<=0.5?0.75:1.25):v<=(line<=0.5?0.55:1.0),fail:v=>over?v<=(line<=0.5?0.35:0.75):v>=(line<=0.5?1.1:1.6),weight:2,source:'HT_HISTORY'}));
  }

  if (info.family === 'HTFT') {
    const hr=htftRate(home,info.homeCode), ar=htftRate(away,info.awayCode);
    push(rows,evidence(`Home HT/FT ${info.homeCode}`,hr,{pass:v=>v>=30,fail:v=>v===0,weight:2,format:per,source:'HTFT_HISTORY'}));
    push(rows,evidence(`Away HT/FT ${info.awayCode}`,ar,{pass:v=>v>=30,fail:v=>v===0,weight:2,format:per,source:'HTFT_HISTORY'}));
  }

  return { rows, sample, family:info.family, guards };
}

export function validateSelectionByData(selection, fixture = {}, stats = null, statsEvidence = null) {
  if (!selection?.market) return { status:'NOT_APPLICABLE', backed:false, score:null, market:null, supporting:[], opposing:[], neutral:[], explanation:'No proposed market is available for statistical validation.' };
  const { rows, sample, family, guards } = buildEvidence(selection, stats, statsEvidence, fixture);
  const supporting=rows.filter(x=>x.state==='SUPPORT'), opposing=rows.filter(x=>x.state==='OPPOSE'), neutral=rows.filter(x=>x.state==='NEUTRAL');
  const supportWeight=supporting.reduce((s,x)=>s+x.weight,0), opposeWeight=opposing.reduce((s,x)=>s+x.weight,0);
  const decisive=supportWeight+opposeWeight;
  const score=decisive?round(supportWeight/decisive*100,1):null;
  const hasCoreSample=(sample.home>=3&&sample.away>=3)||(sample.statsApiHome>=5&&sample.statsApiAway>=5);
  const hasEnoughEvidence=rows.length>=2 && supportWeight>=2 && hasCoreSample;
  const hardOpposition=opposeWeight>=2.5 || (opposing.length>=2 && opposeWeight>=2);
  let status='INSUFFICIENT_DATA';
  if (guards?.soloThreeRequired && guards.soloThreeCapability === null) status='INSUFFICIENT_DATA';
  else if (guards?.soloThreeRequired && guards.soloThreeCapability < 50) status='REJECTED_BY_DATA';
  else if (hardOpposition || (score!==null && score<45)) status='REJECTED_BY_DATA';
  else if (hasEnoughEvidence && score!==null && score>=65) status='BACKED_BY_DATA';
  else if (hasEnoughEvidence && opposing.length===0 && supportWeight>=3) status='BACKED_BY_DATA';
  const marketLabel=selection.label||selection.market;
  const explanation = status==='BACKED_BY_DATA'
    ? `${marketLabel} is backed by ${supporting.length} statistical signal${supporting.length===1?'':'s'}${opposing.length?` with ${opposing.length} caution flag${opposing.length===1?'':'s'}`:''}.`
    : status==='REJECTED_BY_DATA'
      ? `${marketLabel} was rejected because the match data materially contradict the proposed direction.`
      : `${marketLabel} is waiting for enough relevant match data to independently confirm the route.`;
  return { status, backed:status==='BACKED_BY_DATA', score, market:selection.market, family, sample, guards, supporting, opposing, neutral, evidenceCount:rows.length, explanation, checkedAt:new Date().toISOString() };
}

export function applyDataBackedValidation(engineResult = {}, fixture = {}, stats = null, statsEvidence = null) {
  if (!engineResult || typeof engineResult !== 'object') return engineResult;
  if (!engineResult.selection) return { ...engineResult, dataValidation: engineResult.dataValidation || null };
  if (engineResult.dataValidation?.status === 'BACKED_BY_DATA' && String(engineResult.dataValidation?.market || '').toUpperCase() === String(engineResult.selection?.market || '').toUpperCase()) return engineResult;
  const proposed={...engineResult.selection};
  const validation=validateSelectionByData(proposed,fixture,stats,statsEvidence);
  if (validation.backed) {
    const selection={...proposed,dataBacked:true,dataValidation:validation,reasons:[...(proposed.reasons||[]),validation.explanation]};
    return {...engineResult,selection,dataValidation:validation,dataBacked:true,explanation:`${engineResult.explanation||''} ${validation.explanation}`.trim()};
  }
  const waiting=validation.status==='INSUFFICIENT_DATA';
  return {...engineResult,selection:null,proposedSelection:proposed,dataValidation:validation,dataBacked:false,decision:waiting?'WAITING_DATA':'DATA_REJECTED',explanation:`${engineResult.explanation||''} ${validation.explanation}`.trim()};
}

export const DATA_BACKED_POLICY = Object.freeze({
  minimumVenueSample:3,
  minimumStatsApiSample:5,
  minimumSupportScore:65,
  statuses:['BACKED_BY_DATA','INSUFFICIENT_DATA','REJECTED_BY_DATA']
});
