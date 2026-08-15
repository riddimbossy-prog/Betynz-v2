import { createRequire } from 'node:module';
import { apiFootballRequest } from './runtimeConfig.mjs';
const require=createRequire(import.meta.url);
const {evaluateBanger,LIMITS}=require('./goldenBangers.cjs');

const HISTORY_TTL_SECONDS=43200;
const completed=row=>['FT','AET','PEN'].includes(String(row?.fixture?.status?.short||'').toUpperCase());
const ms=row=>{const value=Date.parse(row?.fixture?.date||'');return Number.isFinite(value)?value:0};
const score=(gf,ga)=>gf>ga?3:gf===ga?1:0;
const responseArray=body=>Array.isArray(body?.response)?body.response:[];

function tableEntry(teamId,teamName,matches){
  const five=matches.sort((a,b)=>b.date-a.date).slice(0,5);
  if(five.length!==5)return null;
  const totals=five.reduce((acc,m)=>{acc.points+=m.points;acc.gf+=m.gf;acc.ga+=m.ga;return acc},{points:0,gf:0,ga:0});
  return{teamId:String(teamId),teamName:teamName||'',points:totals.points,ppg:Math.round(totals.points/5*100)/100,gf:totals.gf,ga:totals.ga,gd:totals.gf-totals.ga};
}

function buildSplitTable(rows,side,beforeMs){
  const byTeam=new Map();
  for(const row of rows||[]){
    if(!completed(row))continue;
    const date=ms(row);if(!date||date>=beforeMs)continue;
    const homeId=row?.teams?.home?.id,awayId=row?.teams?.away?.id;
    const hg=Number(row?.goals?.home),ag=Number(row?.goals?.away);
    if(!Number.isFinite(hg)||!Number.isFinite(ag))continue;
    const id=side==='home'?homeId:awayId,name=side==='home'?row?.teams?.home?.name:row?.teams?.away?.name;
    if(id==null)continue;
    const gf=side==='home'?hg:ag,ga=side==='home'?ag:hg,key=String(id);
    if(!byTeam.has(key))byTeam.set(key,{teamId:key,teamName:name||'',matches:[]});
    byTeam.get(key).matches.push({date,gf,ga,points:score(gf,ga)});
  }
  const table=[...byTeam.values()].map(x=>tableEntry(x.teamId,x.teamName,x.matches)).filter(Boolean);
  table.sort((a,b)=>b.points-a.points||b.gd-a.gd||b.gf-a.gf||a.teamName.localeCompare(b.teamName));
  return table.map((row,index)=>({...row,position:index+1,tableSize:table.length}));
}

export function calculateSplitTables(rows,beforeMs){
  return{home:buildSplitTable(rows,'home',beforeMs),away:buildSplitTable(rows,'away',beforeMs)};
}

function findRank(table,teamId){
  const row=(table||[]).find(x=>String(x.teamId)===String(teamId));
  return row?{position:row.position,tableSize:row.tableSize,ppg:row.ppg,gf:row.gf,ga:row.ga,gd:row.gd}:null;
}

async function splitRanksForFixture(fixture){
  const leagueId=Number(fixture?.league?.id),season=Number(fixture?.league?.season),homeId=fixture?.home?.id,awayId=fixture?.away?.id;
  const beforeMs=Date.parse(fixture?.kickoff||'');
  if(!Number.isFinite(leagueId)||!Number.isFinite(season)||homeId==null||awayId==null||!Number.isFinite(beforeMs))return null;
  const body=await apiFootballRequest('/fixtures',{league:leagueId,season,status:'FT',__priority:2},HISTORY_TTL_SECONDS);
  const tables=calculateSplitTables(responseArray(body),beforeMs);
  const home=findRank(tables.home,homeId),away=findRank(tables.away,awayId);
  if(!home||!away)return null;
  return{home:home.position,away:away.position,homeTableSize:home.tableSize,awayTableSize:away.tableSize,homeRow:home,awayRow:away};
}

function passesStatAndOddsGates(home,away,odd){
  const o=Number(odd);
  const oneLeak=Number(home?.avgGA)>=LIMITS.minLeakAvgGA||Number(away?.avgGA)>=LIMITS.minLeakAvgGA;
  const oneAttack=Number(home?.avgGF)>=LIMITS.minAttackAvgGF||Number(away?.avgGF)>=LIMITS.minAttackAvgGF;
  return Number.isFinite(o)&&o>=LIMITS.over25OddMin&&o<=LIMITS.over25OddMax&&
    oneLeak&&
    Number(home?.ppg)>LIMITS.minPPGExclusive&&Number(away?.ppg)>LIMITS.minPPGExclusive&&
    oneAttack;
}

export async function scanBangers(board){
  const items=Array.isArray(board?.all)?board.all:[];
  const fixtures=new Map((board?.fixtures||[]).map(f=>[String(f?.id||''),f]));
  const output=[];
  for(const item of items){
    const analysis=item?.analysis;
    if(!analysis||analysis.waiting)continue;
    const fixture=fixtures.get(String(item?.fixture?.id||analysis?.id||''))||item?.fixture;
    if(!fixture)continue;
    const home=analysis?.split?.home,away=analysis?.split?.away,odd=fixture?.odds?.over25;
    if(!passesStatAndOddsGates(home,away,odd))continue;
    let positions=null;
    try{positions=await splitRanksForFixture(fixture)}catch{}
    const banger=evaluateBanger({home,away,over25Odd:odd,positions:positions||{}});
    if(!banger.qualified)continue;
    output.push({fixture,analysis,banger});
  }
  output.sort((a,b)=>Date.parse(a?.fixture?.kickoff||'')-Date.parse(b?.fixture?.kickoff||''));
  return output;
}

export const BANGER_RULES=Object.freeze({
  market:'Over 2.5',
  odds:'1.20–1.55 inclusive',
  leak:'At least one team ≥1.90 conceded per relevant split match',
  ppg:'Both teams >1.50 PPG in relevant split',
  attack:'At least one team ≥1.90 goals scored per relevant split match',
  rank:'Reject only when both teams are Top 5 in their relevant home/away split tables',
  sample:'Exact last 5 home for home team + exact last 5 away for away team'
});
