import { createRequire } from 'node:module';
import { apiFootballRequest } from './runtimeConfig.mjs';
const require=createRequire(import.meta.url);
const {evaluateGG}=require('./goldenGG.cjs');

const HISTORY_TTL_SECONDS=43200;
const completed=row=>['FT','AET','PEN'].includes(String(row?.fixture?.status?.short||'').toUpperCase());
const ms=row=>{const value=Date.parse(row?.fixture?.date||'');return Number.isFinite(value)?value:0};
const responseArray=body=>Array.isArray(body?.response)?body.response:[];

function completedBefore(rows,beforeMs){
  return (rows||[]).filter(row=>{
    if(!completed(row))return false;
    const date=ms(row),hg=Number(row?.goals?.home),ag=Number(row?.goals?.away);
    return Boolean(date&&date<beforeMs&&Number.isFinite(hg)&&Number.isFinite(ag));
  });
}

const rate=(list,key)=>list.length?list.filter(x=>Boolean(x[key])).length/list.length:null;

function teamBttsProfile(rows,teamId){
  const id=String(teamId),matches=[];
  for(const row of rows){
    const homeId=String(row?.teams?.home?.id??''),awayId=String(row?.teams?.away?.id??'');
    if(homeId!==id&&awayId!==id)continue;
    const isHome=homeId===id,hg=Number(row?.goals?.home),ag=Number(row?.goals?.away);
    const gf=isHome?hg:ag,ga=isHome?ag:hg;
    matches.push({date:ms(row),isHome,btts:gf>0&&ga>0,scored:gf>0,conceded:ga>0,cleanSheet:ga===0});
  }
  matches.sort((a,b)=>a.date-b.date);
  const homeMatches=matches.filter(x=>x.isHome),awayMatches=matches.filter(x=>!x.isHome),last6=matches.slice(-6);
  return{
    matchesPlayed:matches.length,
    bttsRate:rate(matches,'btts'),
    homeBttsRate:rate(homeMatches,'btts'),
    awayBttsRate:rate(awayMatches,'btts'),
    scoreRate:rate(matches,'scored'),
    homeScoreRate:rate(homeMatches,'scored'),
    awayScoreRate:rate(awayMatches,'scored'),
    concedeRate:rate(matches,'conceded'),
    cleanSheetRate:rate(matches,'cleanSheet'),
    last6Btts:last6.filter(x=>x.btts).length,
    last6Matches:last6.length,
  };
}

function leagueBttsProfile(rows){
  const btts=row=>Number(row?.goals?.home)>0&&Number(row?.goals?.away)>0;
  return{matchesPlayed:rows.length,bttsRate:rows.length?rows.filter(btts).length/rows.length:null};
}

export function calculateSeasonBttsProfile(rows,{homeId,awayId,beforeMs}={}){
  const eligible=completedBefore(rows,beforeMs);
  return{
    home:teamBttsProfile(eligible,homeId),
    away:teamBttsProfile(eligible,awayId),
    league:leagueBttsProfile(eligible),
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

export async function scanGG(board){
  const fixtures=Array.isArray(board?.fixtures)?board.fixtures:[];
  const analysisById=new Map((board?.all||[]).map(x=>[String(x?.fixture?.id||x?.analysis?.id||''),x?.analysis]).filter(x=>x[0]));
  const leagueCache=new Map(),output=[];
  for(const fixture of fixtures){
    const homeId=fixture?.home?.id,awayId=fixture?.away?.id,beforeMs=Date.parse(fixture?.kickoff||'');
    if(homeId==null||awayId==null||!Number.isFinite(beforeMs))continue;
    const rows=await leagueRowsForFixture(fixture,leagueCache);
    if(!Array.isArray(rows))continue;
    const profile=calculateSeasonBttsProfile(rows,{homeId,awayId,beforeMs});
    const gg=evaluateGG(profile);
    if(!gg.qualified)continue;
    output.push({fixture,analysis:analysisById.get(String(fixture?.id||''))||null,gg});
  }
  output.sort((a,b)=>Date.parse(a?.fixture?.kickoff||'')-Date.parse(b?.fixture?.kickoff||''));
  return output;
}

export const GG_RULES=Object.freeze({
  profile:'GG / BTTS Statistical Profile',
  season:'Both teams 68%+ season BTTS, or one 80%+ with the other 62%+',
  homeVenue:'Home team home BTTS 72%+',
  awayVenue:'Away team away BTTS 68%+',
  scoring:'Both teams score in 72%+ of matches; venue-specific rates preferred',
  conceding:'Both teams concede in 68%+ of season matches',
  cleanSheets:'Both teams clean-sheet rate 28% or lower',
  recent:'Last 6: both teams 4+ BTTS, or either team 5+',
  league:'League BTTS rate 54%+',
  sample:'Both teams at least 10 completed league matches'
});
