import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { ENGINE,VERSION,snapshots,isSrl,publicFixture,supabaseConfigured,persistenceCoreEnabled,loadBoards,upsertPredictionLedger } from './runtimeConfig.mjs';
const require=createRequire(import.meta.url),{analyseMatch,selectTopBankers,CONFIG}=require('./goldenBanker.cjs'),{applyLowWinUnder35ToAnalysis}=require('./goldenUnder35.cjs');

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

export function hasExactEvidence(analysis){
  if(!analysis||analysis.waiting)return true;
  return analysis?.evidence?.homeLast5?.length===5&&analysis?.evidence?.awayLast5?.length===5;
}

export function upgradeAnalysisForCurrentRules(analysis){
  return applyLowWinUnder35ToAnalysis(analysis);
}

export function analyseFixture(f,intel){
  const homeHistory=historyRows(intel,'home'),awayHistory=historyRows(intel,'away');
  const analysis=analyseMatch({
    id:String(f.id),
    league:f?.league?.name||'Unknown League',
    homeTeam:f?.home?.name||'',
    awayTeam:f?.away?.name||'',
    homeLast5:splitRowsFromHistory(homeHistory,'home'),
    awayLast5:splitRowsFromHistory(awayHistory,'away')
  });
  return {
    ...analysis,
    evidence:{
      homeLast5:evidenceRows(homeHistory,'home'),
      awayLast5:evidenceRows(awayHistory,'away')
    }
  };
}

export function waiting(f,msg){return{id:String(f.id),homeTeam:f?.home?.name||'',awayTeam:f?.away?.name||'',league:f?.league?.name||'',split:null,markets:null,evidence:null,finalRecommendation:{primaryBet:'Skip',score:0,confidence:'Low',bankerStatus:'Not Banker',summary:msg},banker:false,waiting:true,warning:msg}}
export function marketCode(a){const b=String(a?.finalRecommendation?.primaryBet||'');if(b==='Under 3.5')return'UNDER_3_5';if(b==='Over 2.5')return'OVER_2_5';if(b==='BTTS Yes')return'BTTS_YES';if(/ DNB$/.test(b))return a?.markets?.winDnb?.favouriteSide==='Home'?'HOME_DNB':'AWAY_DNB';if(/ Win$/.test(b))return a?.markets?.winDnb?.favouriteSide==='Home'?'HOME_WIN':'AWAY_WIN';return'SKIP'}

function normalizeItems(items=[]){
  return items.map(item=>item&&typeof item==='object'?{...item,fixture:publicFixture(item.fixture),analysis:upgradeAnalysisForCurrentRules(item.analysis)}:item).filter(Boolean);
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
  return{engine:'Golden Banker v4.3',engineCode:ENGINE,version:VERSION,date,rules:{sampleSize:5,maxBankers:4,bankerMinScore:7,dnbMinPPG:2,straightWinMinPPG:2.3,opponentPPG:'<1.0',defensiveBleed:'>2.30',lowWinUnder35:'both split win rates <20% AND both split PPG <1.00 => forced Under 3.5'},fixtures:(board?.fixtures||[]).filter(f=>!isSrl(f)).map(publicFixture),all:normalizedItems,topBankers,summary:{fixtures:(board?.fixtures||[]).filter(f=>!isSrl(f)).length,eligible:total,analysed:analyses.filter(a=>!a.waiting).length,waiting:analyses.filter(a=>a.waiting).length,bankersFound:topBankers.length},progress:{processed,total,percent:total?Math.round(processed/total*100):100,restored},complete,warning:warning||board?.warning||null,generatedAt:new Date().toISOString()}}
const fingerprint=(date,f,a)=>createHash('sha256').update([ENGINE,date,f?.id,marketCode(a),a?.finalRecommendation?.primaryBet,a?.finalRecommendation?.score].join('|')).digest('hex');
function pickOdd(f,m){const o=f?.odds||{};if(m==='HOME_WIN')return Number(o.homeWin)||null;if(m==='AWAY_WIN')return Number(o.awayWin)||null;if(m==='OVER_2_5')return Number(o.over25)||null;if(m==='BTTS_YES')return Number(o.bttsYes)||null;return null}
function reasons(a){const m=marketCode(a);if(m==='UNDER_3_5')return a?.markets?.under35?.reasons||[];if(m==='OVER_2_5')return a?.markets?.over25?.reasons||[];if(m==='BTTS_YES')return a?.markets?.btts?.reasons||[];if(/WIN|DNB/.test(m))return a?.markets?.winDnb?.reasons||[];return[]}
export async function persistTop(date,rows){if(!supabaseConfigured()||!rows.length)return;await upsertPredictionLedger(rows.map(({fixture,analysis})=>({fixture_id:String(fixture.id),fixture_date:date,kickoff:fixture.kickoff||null,country:fixture?.league?.country||null,league_name:fixture?.league?.name||null,home_team:fixture?.home?.name||analysis.homeTeam,away_team:fixture?.away?.name||analysis.awayTeam,engine:ENGINE,market:marketCode(analysis),selection_label:analysis.finalRecommendation.primaryBet,odds:pickOdd(fixture,marketCode(analysis)),engine_score:Number(analysis.finalRecommendation.score||0),grade:Number(analysis.finalRecommendation.score||0)>=8.5?'A+':'A',decision:'BANKER',reasons:reasons(analysis),odds_snapshot:fixture.odds||{},payload:{analysis,engineVersion:'4.3.0'},fingerprint:fingerprint(date,fixture,analysis),settlement_status:'PENDING'})))}

function hydrateBoard(payload){
  const all=normalizeItems(Array.isArray(payload?.all)?payload.all:[]);
  const topBankers=topRowsFromItems(all);
  return {
    ...payload,
    fixtures:Array.isArray(payload?.fixtures)?payload.fixtures.map(publicFixture):[],
    all,
    topBankers,
    summary:{...(payload?.summary||{}),analysed:all.filter(x=>x?.analysis&&!x.analysis.waiting).length,waiting:all.filter(x=>x?.analysis?.waiting).length,bankersFound:topBankers.length},
  };
}

export async function hydrate(date){
  if(!supabaseConfigured()||!persistenceCoreEnabled())return null;
  const rows=await loadBoards({date,boardKey:ENGINE,limit:1}).catch(()=>[]),p=rows?.[0]?.payload;
  const evidenceReady=p?.engineCode===ENGINE&&(p?.all||[]).every(x=>hasExactEvidence(x?.analysis));
  if(evidenceReady){const normalized=hydrateBoard(p);snapshots.set(date,normalized);return normalized}
  return null;
}
