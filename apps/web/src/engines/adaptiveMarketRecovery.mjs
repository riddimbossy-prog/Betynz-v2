import { round } from '../lib/utils.mjs';
import { validateSelectionByData } from './dataBackedValidation.mjs';
import { isUniversalOddsPublishable } from './universalOddsGate.mjs';

const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const MARKET = Object.freeze({
  HOME_WIN:['homeWin','Home Team to Win'],
  AWAY_WIN:['awayWin','Away Team to Win'],
  DRAW:['draw','Draw'],
  DOUBLE_CHANCE_1X:['doubleChance1X','Home or Draw (1X)'],
  DOUBLE_CHANCE_X2:['doubleChanceX2','Draw or Away (X2)'],
  DOUBLE_CHANCE_12:['doubleChance12','Home or Away (12)'],
  BTTS_YES:['bttsYes','Both Teams to Score — Yes'],
  BTTS_NO:['bttsNo','Both Teams to Score — No'],
  OVER_1_5:['over15','Over 1.5 Goals'],
  OVER_2_5:['over25','Over 2.5 Goals'],
  UNDER_2_5:['under25','Under 2.5 Goals'],
  UNDER_3_5:['under35','Under 3.5 Goals'],
  HOME_OVER_0_5:['homeOver05','Home Team Over 0.5 Goals'],
  HOME_OVER_1_5:['homeOver15','Home Team Over 1.5 Goals'],
  HOME_OVER_2_5:['homeOver25','Home Team Over 2.5 Goals'],
  AWAY_OVER_0_5:['awayOver05','Away Team Over 0.5 Goals'],
  AWAY_OVER_1_5:['awayOver15','Away Team Over 1.5 Goals'],
  AWAY_OVER_2_5:['awayOver25','Away Team Over 2.5 Goals'],
  HOME_UNDER_0_5:['homeUnder05','Home Team Under 0.5 Goals'],
  AWAY_UNDER_0_5:['awayUnder05','Away Team Under 0.5 Goals']
});

function price(odds, market) {
  const spec = MARKET[market];
  return spec ? num(odds?.[spec[0]]) : null;
}
function selectionFor(odds, market) {
  const spec = MARKET[market];
  const oddsValue = price(odds, market);
  if (!spec || !isUniversalOddsPublishable(oddsValue)) return null;
  return { market, label:spec[1], odds:oddsValue };
}
function split(stats, side) {
  return stats?.[`${side}Split`] || stats?.[side] || stats?.venueForm?.[side] || null;
}
function rate(profile, key) {
  const direct=num(profile?.rates?.[key]);
  if (direct !== null) return direct;
  const played=num(profile?.played)||0, count=num(profile?.[key]);
  return played > 0 && count !== null ? round(count/played*100,1) : null;
}
function statsProfile(statsEvidence, side) { return statsEvidence?.[side] || null; }
function ppgFor(stats, statsEvidence, side) {
  return num(split(stats,side)?.ppg) ?? num(statsProfile(statsEvidence,side)?.ppg);
}

function oneXTwo(odds={}) {
  const home=num(odds.homeWin), draw=num(odds.draw), away=num(odds.awayWin);
  if (![home,draw,away].every(v=>v && v>1)) {
    const favouriteSide=home&&away ? (home<away?'home':away<home?'away':null) : null;
    return { available:false, favouriteSide, favouriteOdds:favouriteSide==='home'?home:favouriteSide==='away'?away:null, balance:'UNKNOWN', gap:null, fair:null };
  }
  const raw={home:1/home,draw:1/draw,away:1/away};
  const total=raw.home+raw.draw+raw.away;
  const fair={home:raw.home/total,draw:raw.draw/total,away:raw.away/total};
  const favouriteSide=home<away?'home':away<home?'away':null;
  const fav=favouriteSide?fair[favouriteSide]:null;
  const other=favouriteSide==='home'?fair.away:favouriteSide==='away'?fair.home:null;
  const gap=fav!==null&&other!==null?fav-other:null;
  const unbalanced=favouriteSide && ((favouriteSide==='home'?home:away)<=1.55 || (fav>=.55&&gap>=.12));
  const balanced=Math.abs(fair.home-fair.away)<=.08 && Math.max(fair.home,fair.away)<=.52;
  return {
    available:true,
    favouriteSide,
    favouriteOdds:favouriteSide==='home'?home:favouriteSide==='away'?away:null,
    balance:unbalanced?'UNBALANCED':balanced?'BALANCED':'NEUTRAL',
    gap:gap===null?null:round(gap*100,1),
    fair:{home:round(fair.home*100,1),draw:round(fair.draw*100,1),away:round(fair.away*100,1)}
  };
}

function direction(market='') {
  const m=String(market).toUpperCase();
  if (['HOME_WIN','DOUBLE_CHANCE_1X'].includes(m)) return 'HOME_RESULT';
  if (['AWAY_WIN','DOUBLE_CHANCE_X2'].includes(m)) return 'AWAY_RESULT';
  if (m==='DRAW') return 'DRAW';
  if (m==='BTTS_YES') return 'BTTS_YES';
  if (m==='BTTS_NO') return 'BTTS_NO';
  if (/^OVER_/.test(m)) return 'TOTAL_OVER';
  if (/^UNDER_/.test(m)) return 'TOTAL_UNDER';
  if (/^HOME_OVER_/.test(m)) return 'HOME_GOALS';
  if (/^AWAY_OVER_/.test(m)) return 'AWAY_GOALS';
  if (/^HOME_UNDER_/.test(m)) return 'HOME_GOALS_UNDER';
  if (/^AWAY_UNDER_/.test(m)) return 'AWAY_GOALS_UNDER';
  return m;
}
function opposed(a,b) {
  const x=direction(a), y=direction(b);
  const pairs=new Set(['TOTAL_OVER|TOTAL_UNDER','BTTS_YES|BTTS_NO','HOME_RESULT|AWAY_RESULT']);
  return pairs.has(`${x}|${y}`)||pairs.has(`${y}|${x}`);
}

function contextFor(fixture={}, stats=null, statsEvidence=null) {
  const odds=fixture.odds||{}, shape=oneXTwo(odds), fav=shape.favouriteSide, weak=fav==='home'?'away':fav==='away'?'home':null;
  const favPrefix=fav==='home'?'home':fav==='away'?'away':null;
  const weakPrefix=weak==='home'?'home':weak==='away'?'away':null;
  const fav05=favPrefix?num(odds[`${favPrefix}Over05`]):null;
  const fav15=favPrefix?num(odds[`${favPrefix}Over15`]):null;
  const fav25=favPrefix?num(odds[`${favPrefix}Over25`]):null;
  const weak05=weakPrefix?num(odds[`${weakPrefix}Over05`]):null;
  const home05=num(odds.homeOver05), away05=num(odds.awayOver05);
  const favPpg=fav?ppgFor(stats,statsEvidence,fav):null, weakPpg=weak?ppgFor(stats,statsEvidence,weak):null;
  const ppgGap=favPpg!==null&&weakPpg!==null?round(favPpg-weakPpg,2):null;
  const weakSplit=weak?split(stats,weak):null, favSplit=fav?split(stats,fav):null;
  const weakFts=weakSplit?rate(weakSplit,'failedToScore'):null;
  const favTwoPlus=favSplit?rate(favSplit,'scored2Plus'):null;
  const favThreePlus=favSplit?rate(favSplit,'scored3Plus'):null;
  const neutral=shape.balance==='NEUTRAL'||shape.balance==='BALANCED';
  const bothOneGoalClear=home05!==null&&away05!==null&&home05<=1.35&&away05<=1.35;
  const weakGoalFails=weak05!==null&&weak05>1.30;
  const weakGoalStronglyFails=weak05!==null&&weak05>=1.55;
  const favTwoGoalClears=fav15!==null&&fav15<=1.55;
  return {odds,shape,fav,weak,fav05,fav15,fav25,weak05,home05,away05,favPpg,weakPpg,ppgGap,weakFts,favTwoPlus,favThreePlus,neutral,bothOneGoalClear,weakGoalFails,weakGoalStronglyFails,favTwoGoalClears};
}

function logicFor(market, ctx, originalMarket) {
  const reasons=[];
  let boost=0, allowed=false;
  const originalDir=direction(originalMarket);
  const favWin=ctx.fav==='home'?'HOME_WIN':ctx.fav==='away'?'AWAY_WIN':null;
  const favOver15=ctx.fav==='home'?'HOME_OVER_1_5':ctx.fav==='away'?'AWAY_OVER_1_5':null;
  const favOver25=ctx.fav==='home'?'HOME_OVER_2_5':ctx.fav==='away'?'AWAY_OVER_2_5':null;

  if (market===favWin) {
    if (ctx.weakGoalFails && ctx.favTwoGoalClears && (ctx.favPpg===null || ctx.favPpg>=1.5) && (ctx.ppgGap===null || ctx.ppgGap>=0.35)) {
      allowed=true;boost+=18;
      reasons.push('The weaker side fails its one-goal market while the favourite clears the two-goal threshold.');
      if(ctx.favPpg!==null) reasons.push(`Favourite venue PPG is ${ctx.favPpg.toFixed(2)}.`);
    } else if (['HOME_RESULT','AWAY_RESULT'].includes(originalDir) && direction(market)===originalDir) { allowed=true;boost+=8;reasons.push('The recovered result keeps the original result direction.'); }
  }

  if (market===favOver15) {
    if (ctx.favTwoGoalClears) {allowed=true;boost+=12;reasons.push('The favourite independently clears its two-goal market threshold.');}
  }
  if (market===favOver25) {
    if (ctx.weakGoalFails && ctx.favTwoGoalClears) {
      allowed=true;boost+=17;reasons.push('The weaker side is unlikely to contribute, so the engine tests whether the favourite can supply all three goals itself.');
      if(ctx.favThreePlus!==null) reasons.push(`Favourite 3+ goal venue frequency is ${ctx.favThreePlus.toFixed(1)}%.`);
    }
  }

  if (market==='BTTS_NO' && ctx.weakGoalFails) {
    allowed=true;boost+=ctx.weakGoalStronglyFails?15:(ctx.neutral?6:10);
    reasons.push('One side does not clear its one-goal market, so a one-sided scoring picture is plausible.');
  }

  if (market==='UNDER_3_5' || market==='UNDER_2_5') {
    if (ctx.neutral || ctx.weakGoalFails) {
      allowed=true;boost+=ctx.neutral?16:6;
      reasons.push(ctx.neutral?'Neutral 1X2 pricing makes a compressed/stalemate game worth testing.':'A weak one-team scoring route reduces the number of realistic goal contributors.');
    }
  }

  if (market==='BTTS_YES') {
    if (ctx.neutral && ctx.bothOneGoalClear) {
      allowed=true;boost+=16;
      reasons.push('Neutral 1X2 pricing plus short one-goal prices for both teams makes a GG route plausible.');
    } else if (originalDir==='BTTS_YES') {allowed=true;boost+=7;reasons.push('The recovered market preserves the original both-teams-scoring direction.');}
  }

  if (market==='DRAW') {
    if (ctx.neutral) {allowed=true;boost+=14;reasons.push('The 1X2 market is neutral/balanced, so a stalemate is explicitly tested.');}
  }

  if (market==='OVER_1_5' || market==='OVER_2_5') {
    if (ctx.bothOneGoalClear) {allowed=true;boost+=10;reasons.push('Both teams clear their one-goal market, so a shared-goals route remains plausible.');}
    if (originalDir==='TOTAL_OVER') {allowed=true;boost+=5;reasons.push('The recovered market remains inside the original high-goal direction.');}
  }

  if (market==='DOUBLE_CHANCE_1X' || market==='DOUBLE_CHANCE_X2') {
    const side=market==='DOUBLE_CHANCE_1X'?'home':'away';
    if (ctx.fav===side && ['HOME_RESULT','AWAY_RESULT'].includes(originalDir)) {allowed=true;boost+=6;reasons.push('The safer result market keeps the favourite/result direction when straight-win evidence is not complete.');}
  }

  if (!allowed && direction(market)===originalDir) {allowed=true;boost+=4;reasons.push('The candidate preserves the original football direction but is re-tested on its own statistics.');}
  return {allowed,boost,reasons};
}

function candidateMarkets(ctx, originalMarket) {
  const list=[];
  const add=m=>{if(m && MARKET[m] && !list.includes(m)) list.push(m);};
  add(String(originalMarket||'').toUpperCase());
  if(ctx.fav){
    add(ctx.fav==='home'?'HOME_WIN':'AWAY_WIN');
    add(ctx.fav==='home'?'DOUBLE_CHANCE_1X':'DOUBLE_CHANCE_X2');
    add(ctx.fav==='home'?'HOME_OVER_1_5':'AWAY_OVER_1_5');
    add(ctx.fav==='home'?'HOME_OVER_2_5':'AWAY_OVER_2_5');
  }
  if(ctx.weakGoalFails){ add('BTTS_NO');add('UNDER_3_5');add('UNDER_2_5'); }
  if(ctx.neutral){ add('DRAW');add('UNDER_2_5');add('UNDER_3_5');add('BTTS_YES');add('BTTS_NO'); }
  if(ctx.bothOneGoalClear){ add('BTTS_YES');add('OVER_1_5');add('OVER_2_5'); }
  // Broad final scan: candidates still need an explicit logic reason and exact data validation.
  for(const m of ['OVER_1_5','OVER_2_5','UNDER_2_5','UNDER_3_5','BTTS_YES','BTTS_NO']) add(m);
  return list;
}

function enrichValidation(validation, logic, original, chosen, ctx) {
  const logicRows=logic.reasons.map(reason=>({label:'Adaptive match reasoning',value:reason,state:'SUPPORT',weight:0.5,source:'ADAPTIVE_REASONING'}));
  return {
    ...validation,
    supporting:[...(validation.supporting||[]),...logicRows],
    evidenceCount:Number(validation.evidenceCount||0)+logicRows.length,
    adaptiveRecovery:true,
    originalMarket:original?.market||null,
    recoveredMarket:chosen.market,
    marketContext:{balance:ctx.shape.balance,favouriteSide:ctx.fav,weakGoalFails:ctx.weakGoalFails,favTwoGoalClears:ctx.favTwoGoalClears,ppgGap:ctx.ppgGap},
    explanation:`${chosen.label} is backed by the match data after Betynz re-opened the fixture and tested what remained statistically possible when the original route failed.`
  };
}

export function recoverSelectionByMatchReasoning(engineResult={}, rawEngine={}, fixture={}, stats=null, statsEvidence=null) {
  if (engineResult?.selection && engineResult?.dataValidation?.status==='BACKED_BY_DATA') return engineResult;
  const original=engineResult?.proposedSelection || engineResult?.selection || rawEngine?.selection || null;
  if (!original?.market) return engineResult;
  const ctx=contextFor(fixture,stats,statsEvidence), odds=fixture?.odds||{};
  const pool=candidateMarkets(ctx, original.market);
  // Searching many possible replacements creates a multiple-comparisons risk.
  // Penalize broad searches and preserve an audit row for every candidate tested.
  const searchPenalty=round(Math.min(8, Math.max(0,pool.length-1)*0.6),1);
  const candidates=[], evaluatedCandidates=[];
  for(const market of pool) {
    if (market===String(engineResult?.proposedSelection?.market||'').toUpperCase() && engineResult?.dataValidation?.status==='REJECTED_BY_DATA') {
      evaluatedCandidates.push({market,status:'SKIPPED_ORIGINAL_REJECTED'}); continue;
    }
    const selection=selectionFor(odds,market);
    if(!selection) { evaluatedCandidates.push({market,status:'NO_PUBLISHABLE_PRICE',odds:price(odds,market)}); continue; }
    const logic=logicFor(market,ctx,original.market);
    if(!logic.allowed) { evaluatedCandidates.push({market,status:'LOGIC_NOT_RELEVANT',odds:selection.odds}); continue; }
    const validation=validateSelectionByData(selection,fixture,stats,statsEvidence);
    if(validation.status!=='BACKED_BY_DATA') {
      evaluatedCandidates.push({market,status:validation.status,odds:selection.odds,validationScore:validation.score||0,reason:validation.explanation||null}); continue;
    }
    const originalAffinity=direction(market)===direction(original.market)?6:0;
    const score=round((Number(validation.score)||65)+logic.boost+originalAffinity-searchPenalty,1);
    evaluatedCandidates.push({market,status:'BACKED_BY_DATA',odds:selection.odds,validationScore:validation.score||0,recoveryScore:score,searchPenalty});
    candidates.push({market,selection,validation,logic,score});
  }
  candidates.sort((a,b)=>b.score-a.score || Number(a.selection.odds)-Number(b.selection.odds));
  const best=candidates[0]||null, second=candidates[1]||null;
  if(!best) {
    return {
      ...engineResult,
      adaptiveRecovery:{attempted:true,recovered:false,originalMarket:original.market,marketContext:ctx.shape.balance,candidatesChecked:pool.length,searchPenalty,evaluatedCandidates:evaluatedCandidates.slice(0,20),reason:'No alternative market inside 1.20–2.00 was both logically relevant and independently backed by the match data.'},
      explanation:`${engineResult.explanation||''} Betynz re-opened this fixture after the failed route, but no alternative market was strong enough to publish.`.trim()
    };
  }
  if(second && opposed(best.market,second.market) && Math.abs(best.score-second.score)<5) {
    return {
      ...engineResult,
      adaptiveRecovery:{attempted:true,recovered:false,conflict:true,originalMarket:original.market,searchPenalty,evaluatedCandidates:evaluatedCandidates.slice(0,20),reason:`Competing data-backed alternatives (${best.selection.label} and ${second.selection.label}) were too close.`},
      decision:'WAITING_DATA',selection:null,
      explanation:`${engineResult.explanation||''} Match-specific recovery found competing statistical directions, so Betynz withheld the tip rather than forcing a fallback.`.trim()
    };
  }
  const validation=enrichValidation(best.validation,best.logic,original,best.selection,ctx);
  const recoveredSelection={
    ...best.selection,
    decision:'SAFER',
    adaptiveRecovered:true,
    recoveredFrom:original.market,
    dataBacked:true,
    dataValidation:validation,
    reasons:[...(original.reasons||[]),...best.logic.reasons,validation.explanation]
  };
  return {
    ...engineResult,
    decision:'SAFER',
    selection:recoveredSelection,
    proposedSelection:original,
    dataValidation:validation,
    dataBacked:true,
    adaptiveRecovery:{attempted:true,recovered:true,originalMarket:original.market,selectedMarket:best.market,score:best.score,searchPenalty,evaluatedCandidates:evaluatedCandidates.slice(0,20),reasoning:best.logic.reasons,candidates:candidates.slice(0,5).map(x=>({market:x.market,label:x.selection.label,odds:x.selection.odds,validationScore:x.validation.score,recoveryScore:x.score}))},
    explanation:`${rawEngine?.engine||engineResult?.engine||'Engine'} originally pointed to ${original.label||original.market}, but that route did not survive the final checks. Betynz re-analysed this match on its own evidence and selected ${best.selection.label} at ${best.selection.odds.toFixed(2)} because ${best.logic.reasons.join(' ')} ${validation.explanation}`.trim()
  };
}

export const ADAPTIVE_RECOVERY_POLICY=Object.freeze({
  weakGoalClearMax:1.30,
  weakGoalStrongFailMin:1.55,
  favouriteTwoGoalGateMax:1.55,
  decentPpgMin:1.50,
  conflictMargin:5,
  multipleComparisonPenaltyPerCandidate:0.6,
  maximumSearchPenalty:8,
  rule:'No fixed fallback ladder: each alternative must be market-available, inside 1.20–2.00, logically relevant to this match, and independently BACKED_BY_DATA.'
});
