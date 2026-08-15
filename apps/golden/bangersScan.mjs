import { createRequire } from 'node:module';
import { apiFootballRequest } from './runtimeConfig.mjs';
const require=createRequire(import.meta.url);
const {evaluateBanger}=require('./goldenBangers.cjs');

const HISTORY_TTL_SECONDS=43200;
const completed=row=>['FT','AET','PEN'].includes(String(row?.fixture?.status?.short||'').toUpperCase());
const ms=row=>{const value=Date.parse(row?.fixture?.date||'');return Number.isFinite(value)?value:0};
const responseArray=body=>Array.isArray(body?.response)?body.response:[];
const over25=(hg,ag)=>Number(hg)+Number(ag)>=3;
const round2=v=>Math.round((Number(v)+Number.EPSILON)*100)/100;

function completedBefore(rows,beforeMs){
  return (rows||[]).filter(row=>{
    if(!completed(row))return false;
    const date=ms(row),hg=Number(row?.goals?.home),ag=Number(row?.goals?.away);
    return Boolean(date&&date<beforeMs&&Number.isFinite(hg)&&Number.isFinite(ag));
  });
}

function teamSeasonProfile(rows,teamId){
  const id=String(teamId);
  const matches=[];
  for(const row of rows){
    const homeId=String(row?.teams?.home?.id??''),awayId=String(row?.teams?.away?.id??'');
    if(homeId!==id&&awayId!==id)continue;
    const isHome=homeId===id,hg=Number(row?.goals?.home),ag=Number(row?.goals?.away);
    const gf=isHome?hg:ag,ga=isHome?ag:hg;
    matches.push({date:ms(row),isHome,gf,ga,over:over25(hg,ag)});
  }
  matches.sort((a,b)=>a.date-b.date);
  const played=matches.length;
  const homeMatches=matches.filter(x=>x.isHome),awayMatches=matches.filter(x=>!x.isHome);
  const last6=matches.slice(-6);
  const sum=(list,key)=>list.reduce((acc,x)=>acc+Number(x[key]||0),0);
  const rate=list=>list.length?list.filter(x=>x.over).length/list.length:null;
  return{
    matchesPlayed:played,
    over25Rate:rate(matches),
    homeOver25Rate:rate(homeMatches),
    awayOver25Rate:rate(awayMatches),
    avgGF:played?round2(sum(matches,'gf')/played):null,
    avgGA:played?round2(sum(matches,'ga')/played):null,
    last6Overs:last6.filter(x=>x.over).length,
    last6Matches:last6.length,
  };
}

function leagueProfile(rows){
  return{
    matchesPlayed:rows.length,
    over25Rate:rows.length?rows.filter(row=>over25(row?.goals?.home,row?.goals?.away)).length/rows.length:null,
  };
}

export function calculateSeasonGoalProfile(rows,{homeId,awayId,beforeMs,xgCombined=null}={}){
  const eligible=completedBefore(rows,beforeMs);
  return{
    home:teamSeasonProfile(eligible,homeId),
    away:teamSeasonProfile(eligible,awayId),
    league:leagueProfile(eligible),
    xgCombined:Number.isFinite(Number(xgCombined))?Number(xgCombined):null,
  };
}

async function leagueRowsForFixture(fixture,cache){
  const leagueId=Number(fixture?.league?.id),season=Number(fixture?.league?.season);
  if(!Number.isFinite(leagueId)||!Number.isFinite(season))return null;
  const key=`${leagueId}:${season}`;
  if(cache.has(key))return cache.get(key);
  const promise=apiFootballRequest('/fixtures',{league:leagueId,season,status:'FT',__priority:2},HISTORY_TTL_SECONDS)
    .then(body=>responseArray(body))
    .catch(()=>null);
  cache.set(key,promise);
  return promise;
}

export async function scanBangers(board){
  const fixtures=Array.isArray(board?.fixtures)?board.fixtures:[];
  const analysisById=new Map((board?.all||[]).map(x=>[String(x?.fixture?.id||x?.analysis?.id||''),x?.analysis]).filter(x=>x[0]));
  const leagueCache=new Map();
  const output=[];
  for(const fixture of fixtures){
    const homeId=fixture?.home?.id,awayId=fixture?.away?.id,beforeMs=Date.parse(fixture?.kickoff||'');
    if(homeId==null||awayId==null||!Number.isFinite(beforeMs))continue;
    const rows=await leagueRowsForFixture(fixture,leagueCache);
    if(!Array.isArray(rows))continue;
    const profile=calculateSeasonGoalProfile(rows,{homeId,awayId,beforeMs});
    const banger=evaluateBanger(profile);
    if(!banger.qualified)continue;
    output.push({fixture,analysis:analysisById.get(String(fixture?.id||''))||null,banger});
  }
  output.sort((a,b)=>Date.parse(a?.fixture?.kickoff||'')-Date.parse(b?.fixture?.kickoff||''));
  return output;
}

export const BANGER_RULES=Object.freeze({
  profile:'High-Scoring Match Profile',
  season:'Both teams 70%+ season high-scoring rate, or one 80%+ with the other 65%+',
  homeVenue:'Home team home high-scoring rate 72%+',
  awayVenue:'Away team away high-scoring rate 68%+',
  goals:'Combined average GF+GA environment 3.40+',
  xg:'Combined xG+xGA 3.10+ when reliable xG data is available',
  recent:'Last 6: both teams 4+ high-scoring matches, or either team 5+',
  league:'League high-scoring rate 56%+',
  sample:'Both teams at least 10 completed league matches'
});
