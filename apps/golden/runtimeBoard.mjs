import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { ENGINE,VERSION,snapshots,isSrl,publicFixture,supabaseConfigured,persistenceCoreEnabled,loadBoards,upsertPredictionLedger } from './runtimeConfig.mjs';
import { applyTrustLayer } from './trustLayer.mjs';
const require=createRequire(import.meta.url),{analyseMatch,selectTopBankers,CONFIG}=require('./goldenBanker.cjs'),{applyLowWinUnder35ToAnalysis}=require('./goldenUnder35.cjs');
const RULES_REVISION='golden-top2-win-v3';

function historyRows(intel,side){
  const rows=Array.isArray(intel?.[side]?.history)?intel[side].history:[];
  if(rows.length!==5)throw Object.assign(new Error(`Golden Banker requires exactly 5 ${side} split matches. Received ${rows.length}.`),{code:'SPLIT_SAMPLE_INCOMPLETE'});
  return rows;
}

function splitRowsFromHistory(rows,side){
  return rows.map(r=>{
    const s=r?.full_time_score||{};
    return side==='home'?{gf:Number(s.home),ga:Number(s.away)}:{gf:Number(s.away),ga:Number(s.home)};
  });
}

function evidenceRows(rows,side){
  return rows.map(r=>{
    const s=r?.full_time_score||{};
    const homeGoals=Number(s.home),awayGoals=Number(s.away);
    const gf=side==='home'?homeGoals:awayGoals,ga=side==='home'?awayGoals:homeGoals;
    return {
      id:r?.id||null,
      date:r?.date||null,
      homeTeam:r?.home_team?.name||'',
      awayTeam:r?.away_team?.name||'',
      homeGoals:Number.isFinite(homeGoals)?homeGoals:null,
      awayGoals:Number.isFinite(awayGoals)?awayGoals:null,
      gf:Number.isFinite(gf)?gf:null,
      ga:Number.isFinite(ga)?ga:null,
      result:Number.isFinite(gf)&&Number.isFinite(ga)?(gf>ga?'W':gf===ga?'D':'L'):null
    };
  });
}

function splitRowsFromEvidence(rows){
  return (rows||[]).map(r=>({gf:Number(r?.gf),ga:Number(r?.ga)}));
}

function top5Flags(intel={}){
  const standingsGroups=Array.isArray(intel?.standings?.standings)?intel.standings.standings:[];
  const standingsRows=standingsGroups.flatMap(group=>Array.isArray(group)?group:[]);
  const homeId=Number(intel?.home?.id),awayId=Number(intel?.away?.id);
  const findRank=id=>{
    const row=standingsRows.find(x=>Number(x?.team?.id)===Number(id));
    const rank=Number(row?.rank);
    return Number.isFinite(rank)?rank:null;
  };
  const tableHome=findRank(homeId),tableAway=findRank(awayId);
  const positions=intel?.formPositions||{};
  const formHome=Number(positions.home),formAway=Number(positions.away);
  const safeFormHome=Number.isFinite(formHome)?formHome:null,safeFormAway=Number.isFinite(formAway)?formAway:null;
  const tableMatchup=tableHome!==null&&tableAway!==null&&tableHome<=5&&tableAway<=5;
  const formMatchup=safeFormHome!==null&&safeFormAway!==null&&safeFormHome<=5&&safeFormAway<=5;
  return {
    tableTop5Matchup:tableMatchup,
    formTop5Matchup:formMatchup,
    labels:[...(tableMatchup?['TOP 5 TABLE MATCHUP']:[]),...(formMatchup?['TOP 5 FORM MATCHUP']:[])],
    positions:{table:{home:tableHome,away:tableAway},form:{home:safeFormHome,away:safeFormAway}}
  };
}

export function hasExactEvidence(analysis){
  if(!analysis)return false;
  if(analysis.waiting)return true;
  return analysis?.rulesRevision===RULES_REVISION&&analysis?.evidence?.homeLast5?.length===5&&analysis?.evidence?.awayLast5?.length===5;
}

function recomputeFromEvidence(analysis,fixture=null){
  if(!analysis||analysis.waiting)return analysis;
  const homeEvidence=analysis?.evidence?.homeLast5||[],awayEvidence=analysis?.evidence?.awayLast5||[];
  if(homeEvidence.length!==5||awayEvidence.length!==5)return applyLowWinUnder35ToAnalysis(analysis);
  const rebuilt=analyseMatch({
    id:analysis.id??fixture?.id,
    league:analysis.league??fixture?.league?.name??'Unknown League',
    homeTeam:analysis.homeTeam??fixture?.home?.name??'',
    awayTeam:analysis.awayTeam??fixture?.away?.name??'',
    homeLast5:splitRowsFromEvidence(homeEvidence),
    awayLast5:splitRowsFromEvidence(awayEvidence),
    homeFormPosition:analysis?.split?.positions?.home,
    awayFormPosition:analysis?.split?.positions?.away,
    formTableSize:analysis?.split?.positions?.tableSize,
    homeFormTableSize:analysis?.split?.positions?.homeTableSize,
    awayFormTableSize:analysis?.split?.positions?.awayTableSize,
  });
  return {...analysis,...rebuilt,evidence:analysis.evidence,recalculatedAt:new Date().toISOString(),rulesRevision:RULES_REVISION};
}

export function upgradeAnalysisForCurrentRules(analysis,fixture=null){
  const upgraded=recomputeFromEvidence(analysis,fixture);
  return fixture?applyTrustLayer(fixture,upgraded):upgraded;
}

export function analyseFixture(f,intel){
  const homeHistory=historyRows(intel,'home'),awayHistory=historyRows(intel,'away'),positions=intel?.formPositions||{};
  const analysis=analyseMatch({
    id:String(f.id),
    league:f?.league?.name||'Unknown League',
    homeTeam:f?.home?.name||'',
    awayTeam:f?.away?.name||'',
    homeLast5:splitRowsFromHistory(homeHistory,'home'),
    awayLast5:splitRowsFromHistory(awayHistory,'away'),
    homeFormPosition:positions.home,
    awayFormPosition:positions.away,
    formTableSize:positions.tableSize,
    homeFormTableSize:positions.homeTableSize,
    awayFormTableSize:positions.awayTableSize,
  });
  const withEvidence={
    ...analysis,
    matchupFlags:top5Flags(intel),
    evidence:{
      homeLast5:evidenceRows(homeHistory,'home'),
      awayLast5:evidenceRows(awayHistory,'away')
    },
    rulesRevision:RULES_REVISION
  };
  return applyTrustLayer(publicFixture(f),withEvidence);
}

export function waiting(f,msg){return{id:String(f.id),homeTeam:f?.home?.name||'',awayTeam:f?.away?.name||'',league:f?.league?.name||'',split:null,markets:null,evidence:null,matchupFlags:{tableTop5Matchup:false,formTop5Matchup:false,labels:[],positions:{table:{home:null,away:null},form:{home:null,away:null}}},finalRecommendation:{primaryBet:'Skip',score:0,confidence:'Low',bankerStatus:'Not Banker',summary:msg},banker:false,waiting:true,warning:msg,trust:{level:'blocked',score:0,label:'DATA INCOMPLETE',warnings:[msg],blocked:true,zeusDecision:'SKIP'},zeus:{decision:'SKIP',reasons:[msg]}}}
export function marketCode(a){const b=String(a?.finalRecommendation?.primaryBet||'');if(b==='Under 3.5')return'UNDER_3_5';if(b==='Over 2.5')return'OVER_2_5';if(b==='BTTS Yes')return'BTTS_YES';if(/ DNB$/.test(b))return a?.markets?.winDnb?.favouriteSide==='Home'?'HOME_DNB':'AWAY_DNB';if(/ Win$/.test(b))return a?.markets?.winDnb?.favouriteSide==='Home'?'HOME_WIN':'AWAY_WIN';return'SKIP'}

function normalizeItems(items=[]){
  return items.map(item=>{
    if(!item||typeof item!=='object')return null;
    const fixture=publicFixture(item.fixture);
    return {...item,fixture,analysis:upgradeAnalysisForCurrentRules(item.analysis,fixture)};
  }).filter(Boolean);
}

function topRowsFromItems(items){
  const analyses=items.map(x=>x?.analysis).filter(Boolean);
  const top=selectTopBankers(analyses,CONFIG.maxBankers);
  const byId=new Map(items.map(x=>[String(x?.fixture?.id||''),x]));
  return top.map(a=>{const x=byId.get(String(a.id||''));return x?{fixture:x.fixture,analysis:a}:null}).filter(Boolean);
}

export function makeBoard(date,board,items,{complete=false,processed=0,total=items.length,warning=null,restored=0}={}){
  const normalizedItems=normalizeItems(items);
  const analyses=normalizedItems.map(x=>x.analysis).filter(Boolean);
  const topBankers=topRowsFromItems(normalizedItems);
  const blocked=analyses.filter(a=>a?.trust?.blocked).length;
  const top5TableMatchups=analyses.filter(a=>a?.matchupFlags?.tableTop5Matchup).length;
  const top5FormMatchups=analyses.filter(a=>a?.matchupFlags?.formTop5Matchup).length;
  return{engine:'Golden Banker v4.3',engineCode:ENGINE,version:VERSION,date,rules:{sampleSize:5,maxBankers:4,bankerMinScore:7,dnbMinPPG:2,straightWinMinPPG:2.3,straightWinRank:'verified split-form Top 2 only; otherwise DNB',opponentPPG:'<1.0',defensiveBleed:'>2.30',under35:'low-win + low-PPG is only an entry gate; both O2.5 rates must be <=40% and both goal environments <=3.00',btts:'both exact split BTTS rates >=80%, both score rates >=80%, both concede rates >=80%',over25:'both exact split O2.5 rates >=60%',top5Flags:'flag any fixture where both teams are Top 5 in the league table and/or both are Top 5 in the split-form table',zeusSupervisor:'reject conflicted, bottom-three favourite, or unsafe banker routes before publication'},fixtures:(board?.fixtures||[]).filter(f=>!isSrl(f)).map(publicFixture),all:normalizedItems,topBankers,summary:{fixtures:(board?.fixtures||[]).filter(f=>!isSrl(f)).length,eligible:total,analysed:analyses.filter(a=>!a.waiting).length,waiting:analyses.filter(a=>a.waiting).length,bankersFound:topBankers.length,top5TableMatchups,top5FormMatchups,zeusBlocked:blocked},progress:{processed,total,percent:total?Math.round(processed/total*100):100,restored},complete,warning:warning||board?.warning||null,generatedAt:new Date().toISOString()}}
const fingerprint=(date,f,a)=>createHash('sha256').update([ENGINE,RULES_REVISION,date,f?.id,marketCode(a),a?.finalRecommendation?.primaryBet,a?.finalRecommendation?.score].join('|')).digest('hex');
function pickOdd(f,m){const o=f?.odds||{};if(m==='HOME_WIN')return Number(o.homeWin)||null;if(m==='AWAY_WIN')return Number(o.awayWin)||null;if(m==='OVER_2_5')return Number(o.over25)||null;if(m==='BTTS_YES')return Number(o.bttsYes)||null;return null}
function reasons(a){const m=marketCode(a);const base=m==='UNDER_3_5'?a?.markets?.under35?.reasons||[]:m==='OVER_2_5'?a?.markets?.over25?.reasons||[]:m==='BTTS_YES'?a?.markets?.btts?.reasons||[]:/WIN|DNB/.test(m)?a?.markets?.winDnb?.reasons||[]:[];return [...base,...(a?.trust?.warnings||[])].slice(0,8)}
export async function persistTop(date,rows){if(!supabaseConfigured()||!rows.length)return;await upsertPredictionLedger(rows.map(({fixture,analysis})=>({fixture_id:String(fixture.id),fixture_date:date,kickoff:fixture.kickoff||null,country:fixture?.league?.country||null,league_name:fixture?.league?.name||null,home_team:fixture?.home?.name||analysis.homeTeam,away_team:fixture?.away?.name||analysis.awayTeam,engine:ENGINE,market:marketCode(analysis),selection_label:analysis.finalRecommendation.primaryBet,odds:pickOdd(fixture,marketCode(analysis)),engine_score:Number(analysis.finalRecommendation.score||0),grade:Number(analysis.finalRecommendation.score||0)>=8.5?'A+':'A',decision:'BANKER',reasons:reasons(analysis),odds_snapshot:fixture.odds||{},payload:{analysis,engineVersion:'4.3.2',rulesRevision:RULES_REVISION,trust:analysis.trust,zeus:analysis.zeus,lockedAt:new Date().toISOString()},fingerprint:fingerprint(date,fixture,analysis),settlement_status:'PENDING'})))}

function hydrateBoard(payload){
  const all=normalizeItems(Array.isArray(payload?.all)?payload.all:[]);
  const topBankers=topRowsFromItems(all);
  return {
    ...payload,
    version:VERSION,
    rulesRevision:RULES_REVISION,
    fixtures:Array.isArray(payload?.fixtures)?payload.fixtures.map(publicFixture):[],
    all,
    topBankers,
    summary:{...(payload?.summary||{}),analysed:all.filter(x=>x?.analysis&&!x.analysis.waiting).length,waiting:all.filter(x=>x?.analysis?.waiting).length,bankersFound:topBankers.length,top5TableMatchups:all.filter(x=>x?.analysis?.matchupFlags?.tableTop5Matchup).length,top5FormMatchups:all.filter(x=>x?.analysis?.matchupFlags?.formTop5Matchup).length,zeusBlocked:all.filter(x=>x?.analysis?.trust?.blocked).length},
  };
}

export async function hydrate(date){
  if(!supabaseConfigured()||!persistenceCoreEnabled())return null;
  const rows=await loadBoards({date,boardKey:ENGINE,limit:1}).catch(()=>[]),p=rows?.[0]?.payload;
  const evidenceReady=p?.engineCode===ENGINE&&(p?.all||[]).every(x=>hasExactEvidence(x?.analysis));
  if(evidenceReady){const normalized=hydrateBoard(p);snapshots.set(date,normalized);return normalized}
  return null;
}
