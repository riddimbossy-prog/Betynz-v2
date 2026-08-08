import { round } from '../lib/utils.mjs';

const n = value => Number.isFinite(Number(value)) ? Number(value) : null;
const inBand = value => n(value) !== null && n(value) >= 1.20 && n(value) <= 2.00;
const offered = value => n(value) !== null && n(value) > 1;
const fmt = value => offered(value) ? n(value).toFixed(2) : '—';

function candidate({ id, name, direction, target, safer = null, checks = [], blockers = [], goalEvidence = false }) {
  const passed = checks.filter(x=>x.pass);
  const families = new Set(passed.map(x=>x.family).filter(Boolean));
  const activeBlockers = blockers.filter(Boolean);
  const coreScore = checks.length ? passed.reduce((sum,x)=>sum+(x.weight||1),0) / Math.max(1,checks.reduce((sum,x)=>sum+(x.weight||1),0)) * 100 : 0;
  const xg = checks.filter(x=>x.family==='XG' && x.available);
  const sot = checks.filter(x=>x.family==='SOT' && x.available);
  const confirmationBonus = (xg.some(x=>x.pass)?4:0) + (sot.some(x=>x.pass)?4:0);
  const contradictionPenalty = (xg.some(x=>!x.pass)?8:0) + (sot.some(x=>!x.pass)?8:0);
  const score = round(Math.max(0,Math.min(100,coreScore+confirmationBonus-contradictionPenalty)),1);
  let selection = null;
  const exactBand = inBand(target?.odds);
  const saferBand = inBand(safer?.odds);
  const goalSupportRequired = goalEvidence && xg.length > 0 && xg.every(x=>!x.pass);
  if (!activeBlockers.length && !goalSupportRequired && families.size >= 3 && score >= 82 && exactBand) {
    selection = { ...target, decision:'FIRE' };
  } else if (!activeBlockers.length && !goalSupportRequired && families.size >= 3 && score >= 72 && saferBand) {
    selection = { ...safer, decision:'SAFER', downgradedFrom:target?.market || null };
  }
  const reasons = [
    ...passed.slice(0,6).map(x=>`${x.label}: ${x.actual}.`),
    ...checks.filter(x=>!x.pass && x.available!==false).slice(0,3).map(x=>`${x.label} missed: ${x.actual}; need ${x.rule}.`),
    ...activeBlockers.map(x=>`Blocked: ${x}`)
  ];
  if (selection) Object.assign(selection,{routeId:id,routeName:name,score,grade:score>=92?'A+':score>=86?'A':selection.decision==='FIRE'?'B+':'SAFER',reasons,evidenceFamilies:[...families]});
  return { id,name,direction,target,safer,checks,blockers:activeBlockers,score,selection,reasons,evidenceFamilies:[...families] };
}

function c(label, pass, actual, rule, family, weight=1, available=true){return{label,pass:Boolean(pass),actual,rule,family,weight,available};}
function st(profile,key){return Number(profile?.streaks?.[key]||0);}
function choose(candidates){
  const qualified=candidates.filter(x=>x.selection);
  const conflictPairs=[['HOME_RESULT','AWAY_RESULT'],['GOALS_OVER','GOALS_UNDER'],['HOME_GOALS','HOME_GOALS_UNDER'],['AWAY_GOALS','AWAY_GOALS_UNDER']];
  for(const [a,b] of conflictPairs){const A=qualified.filter(x=>x.direction===a).sort((x,y)=>y.score-x.score)[0],B=qualified.filter(x=>x.direction===b).sort((x,y)=>y.score-x.score)[0];if(A&&B&&Math.abs(A.score-B.score)<=8)return{conflict:true,reason:`${A.name} and ${B.name} have near-equal opposite streak evidence.`};}
  return { conflict:false,best:qualified.sort((a,b)=>b.score-a.score||Number(a.selection?.odds||99)-Number(b.selection?.odds||99))[0]||null };
}

function goalChecks(home,away,homeGoal,awayGoal,type){
  const combinedXg = n(homeGoal?.xgFor) !== null && n(awayGoal?.xgFor) !== null ? n(homeGoal.xgFor)+n(awayGoal.xgFor) : null;
  const combinedSot = n(homeGoal?.sotFor) !== null && n(awayGoal?.sotFor) !== null ? n(homeGoal.sotFor)+n(awayGoal.sotFor) : null;
  if(type==='OVER') return [
    c('Combined recent xG', combinedXg===null?true:combinedXg>=2.35, combinedXg===null?'not available':combinedXg.toFixed(2),'≥ 2.35','XG',1,combinedXg!==null),
    c('Combined shots on target', combinedSot===null?true:combinedSot>=7.0, combinedSot===null?'not available':combinedSot.toFixed(2),'≥ 7.0','SOT',1,combinedSot!==null)
  ];
  if(type==='UNDER') return [
    c('Combined recent xG', combinedXg===null?true:combinedXg<=2.55, combinedXg===null?'not available':combinedXg.toFixed(2),'≤ 2.55','XG',1,combinedXg!==null),
    c('Combined shots on target', combinedSot===null?true:combinedSot<=7.5, combinedSot===null?'not available':combinedSot.toFixed(2),'≤ 7.5','SOT',1,combinedSot!==null)
  ];
  return [];
}

function teamGoalChecks(side, ownGoal, oppGoal, type){
  const xgFor=n(ownGoal?.xgFor), xgAgainst=n(oppGoal?.xgAgainst), sot=n(ownGoal?.sotFor), sotAg=n(oppGoal?.sotAgainst);
  const xgBlend=xgFor!==null&&xgAgainst!==null?(xgFor+xgAgainst)/2:xgFor??xgAgainst;
  const sotBlend=sot!==null&&sotAg!==null?(sot+sotAg)/2:sot??sotAg;
  if(type==='OVER05') return [c(`${side} xG pressure`,xgBlend===null?true:xgBlend>=1.05,xgBlend===null?'not available':xgBlend.toFixed(2),'≥ 1.05','XG',1,xgBlend!==null),c(`${side} SOT pressure`,sotBlend===null?true:sotBlend>=3.2,sotBlend===null?'not available':sotBlend.toFixed(2),'≥ 3.2','SOT',1,sotBlend!==null)];
  if(type==='OVER15') return [c(`${side} xG pressure`,xgBlend===null?true:xgBlend>=1.55,xgBlend===null?'not available':xgBlend.toFixed(2),'≥ 1.55','XG',1,xgBlend!==null),c(`${side} SOT pressure`,sotBlend===null?true:sotBlend>=4.2,sotBlend===null?'not available':sotBlend.toFixed(2),'≥ 4.2','SOT',1,sotBlend!==null)];
  return [c(`${side} xG restriction`,xgBlend===null?true:xgBlend<=1.35,xgBlend===null?'not available':xgBlend.toFixed(2),'≤ 1.35','XG',1,xgBlend!==null),c(`${side} SOT restriction`,sotBlend===null?true:sotBlend<=4.0,sotBlend===null?'not available':sotBlend.toFixed(2),'≤ 4.0','SOT',1,sotBlend!==null)];
}

export function analyzeStreakValue(fixture={}, evidence=null){
  const odds=fixture.odds||{}; const home=evidence?.home, away=evidence?.away; const homeGoal=evidence?.homeGoal,awayGoal=evidence?.awayGoal;
  const base={engine:'STREAK_VALUE',provider:'STATS_API',decision:'NO_SIGNAL',selection:null,candidates:[],evidence,explanation:'No Stats API streak-value route qualified inside the 1.20–2.00 price band.'};
  if(!home||!away||home.played<5||away.played<5)return{...base,decision:'WAITING',explanation:`Stats API needs at least five recent completed matches per team. Home ${home?.played||0}; away ${away?.played||0}.`};
  const C=[];
  C.push(candidate({id:'SV_HOME_POWER',name:'Best vs worst — home result',direction:'HOME_RESULT',target:{market:'HOME_WIN',label:'Home Team to Win',odds:n(odds.homeWin)},safer:{market:'DOUBLE_CHANCE_1X',label:'Home or Draw (1X)',odds:n(odds.doubleChance1X)},checks:[
    c('Home best/strong profile',['BEST_FORM','STRONG'].includes(home.classification),`${home.classification} · ${home.strengthScore}`,'strong or best','QUALITY',2),
    c('Away weak/worst profile',['WEAK','WORST_FORM'].includes(away.classification),`${away.classification} · ${away.strengthScore}`,'weak or worst','OPPOSITION',2),
    c('Home winning/unbeaten streak',st(home,'wins')>=2||st(home,'unbeaten')>=5,`${st(home,'wins')} wins · ${st(home,'unbeaten')} unbeaten`,'2 wins or 5 unbeaten','STREAK',2),
    c('Away winless/losing streak',st(away,'winless')>=4||st(away,'losses')>=2,`${st(away,'winless')} winless · ${st(away,'losses')} losses`,'4 winless or 2 losses','OPPOSITION_STREAK',2),
    c('Result price band',inBand(odds.homeWin)||inBand(odds.doubleChance1X),`${fmt(odds.homeWin)} / ${fmt(odds.doubleChance1X)}`,'1.20–2.00','MARKET',2)
  ],blockers:[away.classification==='BEST_FORM'?'Away side is also in best-form class.':null]}));
  C.push(candidate({id:'SV_AWAY_POWER',name:'Best vs worst — away result',direction:'AWAY_RESULT',target:{market:'AWAY_WIN',label:'Away Team to Win',odds:n(odds.awayWin)},safer:{market:'DOUBLE_CHANCE_X2',label:'Draw or Away (X2)',odds:n(odds.doubleChanceX2)},checks:[
    c('Away best/strong profile',['BEST_FORM','STRONG'].includes(away.classification),`${away.classification} · ${away.strengthScore}`,'strong or best','QUALITY',2),
    c('Home weak/worst profile',['WEAK','WORST_FORM'].includes(home.classification),`${home.classification} · ${home.strengthScore}`,'weak or worst','OPPOSITION',2),
    c('Away winning/unbeaten streak',st(away,'wins')>=2||st(away,'unbeaten')>=5,`${st(away,'wins')} wins · ${st(away,'unbeaten')} unbeaten`,'2 wins or 5 unbeaten','STREAK',2),
    c('Home winless/losing streak',st(home,'winless')>=4||st(home,'losses')>=2,`${st(home,'winless')} winless · ${st(home,'losses')} losses`,'4 winless or 2 losses','OPPOSITION_STREAK',2),
    c('Result price band',inBand(odds.awayWin)||inBand(odds.doubleChanceX2),`${fmt(odds.awayWin)} / ${fmt(odds.doubleChanceX2)}`,'1.20–2.00','MARKET',2)
  ],blockers:[home.classification==='BEST_FORM'?'Home side is also in best-form class.':null]}));

  C.push(candidate({id:'SV_TOTAL_OVER',name:'Total-goals streak + xG/SOT',direction:'GOALS_OVER',goalEvidence:true,target:{market:'OVER_2_5',label:'Over 2.5 Goals',odds:n(odds.over25)},safer:{market:'OVER_1_5',label:'Over 1.5 Goals',odds:n(odds.over15)},checks:[
    c('Home over streak',st(home,'over15')>=4||st(home,'over25')>=3,`${st(home,'over15')} O1.5 · ${st(home,'over25')} O2.5`,'4 O1.5 or 3 O2.5','HOME_STREAK',2),
    c('Away over streak',st(away,'over15')>=4||st(away,'over25')>=3,`${st(away,'over15')} O1.5 · ${st(away,'over25')} O2.5`,'4 O1.5 or 3 O2.5','AWAY_STREAK',2),
    c('Scoring continuity',st(home,'scoring')>=4&&st(away,'scoring')>=4,`${st(home,'scoring')} / ${st(away,'scoring')}`,'both ≥ 4','SCORING',2),
    c('Goal price band',inBand(odds.over25)||inBand(odds.over15),`${fmt(odds.over25)} / ${fmt(odds.over15)}`,'1.20–2.00','MARKET',2),
    ...goalChecks(home,away,homeGoal,awayGoal,'OVER')
  ],blockers:[st(home,'under25')>=4&&st(away,'under25')>=4?'Both teams carry strong Under 2.5 streaks.':null]}));

  C.push(candidate({id:'SV_TOTAL_UNDER',name:'Low-total streak + xG/SOT',direction:'GOALS_UNDER',goalEvidence:true,target:{market:'UNDER_2_5',label:'Under 2.5 Goals',odds:n(odds.under25)},safer:{market:'UNDER_3_5',label:'Under 3.5 Goals',odds:n(odds.under35)},checks:[
    c('Home under streak',st(home,'under35')>=5||st(home,'under25')>=3,`${st(home,'under35')} U3.5 · ${st(home,'under25')} U2.5`,'5 U3.5 or 3 U2.5','HOME_STREAK',2),
    c('Away under streak',st(away,'under35')>=5||st(away,'under25')>=3,`${st(away,'under35')} U3.5 · ${st(away,'under25')} U2.5`,'5 U3.5 or 3 U2.5','AWAY_STREAK',2),
    c('Restricted scoring',st(home,'failedToScore')>=2||st(away,'failedToScore')>=2||((home.goalsForAvg||9)+(away.goalsForAvg||9)<=2.2),`${st(home,'failedToScore')} / ${st(away,'failedToScore')} blanks`,'blank streak or low averages','SCORING',2),
    c('Goal price band',inBand(odds.under25)||inBand(odds.under35),`${fmt(odds.under25)} / ${fmt(odds.under35)}`,'1.20–2.00','MARKET',2),
    ...goalChecks(home,away,homeGoal,awayGoal,'UNDER')
  ],blockers:[st(home,'over25')>=4&&st(away,'over25')>=4?'Both teams carry strong Over 2.5 streaks.':null]}));

  for(const [side,own,opp,ownGoal,oppGoal,over05,over15,under15] of [
    ['Home',home,away,homeGoal,awayGoal,odds.homeOver05,odds.homeOver15,odds.homeUnder15],
    ['Away',away,home,awayGoal,homeGoal,odds.awayOver05,odds.awayOver15,odds.awayUnder15]
  ]){
    const prefix=side.toUpperCase();
    C.push(candidate({id:`SV_${prefix}_TEAM_OVER`,name:`${side} team-goal streak + xG/SOT`,direction:`${prefix}_GOALS`,goalEvidence:true,target:{market:`${prefix}_OVER_1_5`,label:`${side} Team Over 1.5 Goals`,odds:n(over15)},safer:{market:`${prefix}_OVER_0_5`,label:`${side} Team Over 0.5 Goals`,odds:n(over05)},checks:[
      c(`${side} scoring streak`,st(own,'teamOver05')>=5,`${st(own,'teamOver05')} matches`,'≥ 5','TEAM_STREAK',2),
      c(`${side} 2+ goal streak`,st(own,'teamOver15')>=2||own.goalsForAvg>=1.6,`${st(own,'teamOver15')} straight · avg ${own.goalsForAvg}`,'2 straight or avg ≥ 1.60','TEAM_GOALS',2),
      c('Opponent conceding streak',st(opp,'conceding')>=4||opp.goalsAgainstAvg>=1.4,`${st(opp,'conceding')} straight · avg ${opp.goalsAgainstAvg}`,'4 straight or avg ≥ 1.40','OPPOSITION',2),
      c('Team-goal price band',inBand(over15)||inBand(over05),`${fmt(over15)} / ${fmt(over05)}`,'1.20–2.00','MARKET',2),
      ...teamGoalChecks(side,ownGoal,oppGoal,n(over15)&&inBand(over15)?'OVER15':'OVER05')
    ],blockers:[st(opp,'cleanSheets')>=3?'Opponent has three or more consecutive clean sheets.':null]}));
    C.push(candidate({id:`SV_${prefix}_TEAM_UNDER`,name:`${side} team-goal under streak + xG/SOT`,direction:`${prefix}_GOALS_UNDER`,goalEvidence:true,target:{market:`${prefix}_UNDER_1_5`,label:`${side} Team Under 1.5 Goals`,odds:n(under15)},checks:[
      c(`${side} low-scoring streak`,st(own,'teamUnder15')>=4,`${st(own,'teamUnder15')} matches`,'≥ 4','TEAM_STREAK',2),
      c(`${side} blank pressure`,st(own,'failedToScore')>=2||own.goalsForAvg<=1.05,`${st(own,'failedToScore')} blanks · avg ${own.goalsForAvg}`,'2 blanks or avg ≤ 1.05','TEAM_GOALS',2),
      c('Opponent defensive streak',st(opp,'cleanSheets')>=2||opp.goalsAgainstAvg<=1.0,`${st(opp,'cleanSheets')} clean sheets · avg ${opp.goalsAgainstAvg}`,'2 clean sheets or avg ≤ 1.00','OPPOSITION',2),
      c('Team-under price band',inBand(under15),fmt(under15),'1.20–2.00','MARKET',2),
      ...teamGoalChecks(side,ownGoal,oppGoal,'UNDER15')
    ]}));
  }

  const selected=choose(C);
  if(selected.conflict)return{...base,candidates:C,decision:'CONFLICT',explanation:selected.reason};
  const best=selected.best;
  if(!best)return{...base,candidates:C};
  return{...base,candidates:C,decision:best.selection.decision,selection:best.selection,explanation:`${best.name}. Stats API streaks open the route; the exact 1.20–2.00 market band qualifies it, with xG/SOT used as goal-market confirmation when available.`};
}

export function streakValueSummary(rows=[]){return{fixtures:rows.length,fire:rows.filter(x=>x.engine?.decision==='FIRE').length,safer:rows.filter(x=>x.engine?.decision==='SAFER').length,conflict:rows.filter(x=>x.engine?.decision==='CONFLICT').length,waiting:rows.filter(x=>x.engine?.decision==='WAITING').length};}
