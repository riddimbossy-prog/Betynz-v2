import { selections } from './markets.mjs';
import { profile,modelFor,estimate,failureScenarios,leagueReliability,advancedH2H } from './model.mjs';
import { clamp,round } from '../util.mjs';
function sureBand(policy) {
  const min=policy.minimumSurety??0.9, max=policy.maximumSurety??1;
  return {min,max,label:`${Math.round(min*100)}–${Math.round(max*100)}`};
}
function isSure(probability,policy) {
  const {min,max}=sureBand(policy);
  return Number.isFinite(probability)&&probability>=min&&probability<=max;
}
export function isSimulated(league) {
  return /simulated reality|\bSRL\b/i.test(`${league?.country || ''} ${league?.name || ''}`);
}
export function eligibility(f,policy,leagueCount,now=Date.now()) {
  const reasons=[];const size=f.league.size,h=f.homeStanding,a=f.awayStanding;
  const busy=leagueCount>=policy.busyDayLeagueCount;
  if(isSimulated(f.league)) reasons.push('Simulated match');
  if(!f.kickoff||Date.parse(f.kickoff)<=now) reasons.push('Match has already started');
  if(f.status!==undefined&&f.status!==null&&String(f.status)!=='0') reasons.push('Match is not available pre-match');
  if(/postpon|cancel|abandon|live|finish|ended/i.test(f.matchStatus||'')) reasons.push('Match is not available pre-match');
  if(!f.oddsFetchedAt||now-Date.parse(f.oddsFetchedAt)>policy.maximumOddsAgeMinutes*60000) reasons.push('Sportybet odds are stale');
  if(policy.publishAllMatches) return {eligible:!reasons.length,busy:false,mismatch:false,reasons};
  if(policy.blockedLeagueIds.includes(String(f.league.apiId||f.league.id)))reasons.push('League is excluded');
  if(policy.blockedLeaguePatterns.some(p=>new RegExp(p,'i').test(`${f.league.name} ${f.league.country||''}`)))reasons.push('Excluded competition type');
  if(!h||!a||!size) return {eligible:false,busy,mismatch:false,reasons:[...reasons,'League standings unavailable']};
  const topH=h.rank<=policy.topTeamCount,topA=a.rank<=policy.topTeamCount;
  const bottomH=h.rank>size-policy.bottomTeamCount,bottomA=a.rank>size-policy.bottomTeamCount;
  if(!(topH||topA||bottomH||bottomA))reasons.push('Neither team is top four or bottom three');
  if(h.rank<=policy.avoidBothTop&&a.rank<=policy.avoidBothTop)reasons.push('Top-five versus top-five matchup');
  if(bottomH&&bottomA)reasons.push('Bottom-three versus bottom-three matchup');
  if(Math.min(h.all?.played||0,a.all?.played||0)<policy.minimumStandingGames)reasons.push('Standings too early in the season');
  const hp=profile(f.homeHistory||[],'home'),ap=profile(f.awayHistory||[],'away');
  if(Math.min(hp.games,ap.games)<policy.minimumSplitGames)reasons.push('Insufficient home/away form');
  const gap=hp.ppg-ap.ppg,rankGap=a.rank-h.rank;
  const mismatch=hp.ppg!==null&&ap.ppg!==null&&Math.abs(rankGap)>=Math.max(3,Math.ceil(size*0.3))&&Math.abs(gap)>=policy.minimumMismatchPpgGap&&Math.sign(gap)===Math.sign(rankGap);
  if(busy&&!mismatch)reasons.push('Busy-day filter: no clear table and split-form mismatch');
  return {eligible:!reasons.length,busy,mismatch,reasons};
}
function explain(f,m,p,policy) {
  const home=m.home,away=m.away;
  const reasons=[`${f.home.name} earns ${home.ppg.toFixed(2)} points per home game across its last ${home.games}; ${f.away.name} earns ${away.ppg.toFixed(2)} away.`,
    `The home side scores ${home.gf.toFixed(1)} and concedes ${home.ga.toFixed(1)} at home; the away side scores ${away.gf.toFixed(1)} and concedes ${away.ga.toFixed(1)} away.`,
    f.homeStanding&&f.awayStanding?`Their table positions are ${f.homeStanding.rank} and ${f.awayStanding.rank} out of ${f.league.size}.`:'League standings are unavailable; they did not prevent this pick.'];
  if(home.scoringTrend!==null&&away.scoringTrend!==null)reasons.push(`Compared with the previous five venue matches, home scoring changed by ${home.scoringTrend>=0?'+':''}${home.scoringTrend.toFixed(1)} goals per game and away scoring by ${away.scoringTrend>=0?'+':''}${away.scoringTrend.toFixed(1)}.`);
  if(m.h2h.length) {
    const venue=m.h2h.filter(r=>r.venueMatch).length;
    reasons.push(`${m.h2h.length} recent H2Hs were checked, including ${venue} in the same home/away arrangement. Older and reversed-venue games receive less influence.`);
  } else reasons.push('No recent H2H record was available; the risk assessment includes this gap.');
  if(home.xg!==null||away.xg!==null)reasons.push(`Available expected-goals averages: home ${home.xg===null?'unavailable':home.xg.toFixed(2)}, away ${away.xg===null?'unavailable':away.xg.toFixed(2)}. Finishing that differs from xG is partly pulled toward the chance-quality evidence.`);
  else reasons.push('Expected-goals data is unavailable. Advanced assessment uses score transitions and available shots/corners/cards.');
  const {label}=sureBand(policy);
  reasons.push(`${p.selection} in ${p.market} is the highest surity among markets backed from ${label}, at Sportybet odds ${Number(p.odds).toFixed(2)}.`);
  if(p.evidence)for(const [source,e] of Object.entries(p.evidence))if(e.count)reasons.push(`For this particular market, the weighted positive-return rate in ${source} is ${(e.successRate*100).toFixed(0)}% across ${e.count} usable matches. Samples can overlap; they are deduplicated in the final estimate.`);
  if(p.expectedReturn<0)reasons.push('The estimated return at this price is negative despite the high chance of success.');
  if(p.disagreement>0.15)reasons.push('The matchup model and observed market history disagree; the risk rating is increased.');
  return reasons;
}
export function analyse(f,policy,{leagueCount=0,now=Date.now(),reliability}={}) {
  f={table:[],homeHistory:[],awayHistory:[],h2h:[],leagueHistory:[],...f};
  const gate=eligibility(f,policy,leagueCount,now),book=selections(f,policy.minimumOdds??1.2);
  const basic={id:f.id,kickoff:f.kickoff,home:f.home,away:f.away,league:f.league,oddsFetchedAt:f.oddsFetchedAt,gate,coverage:book.counts,
    excludedMarkets:book.excluded,diagnostics:f.diagnostics||[],statsSource:f.statsSource,statsFetchedAt:f.statsFetchedAt,standings:{home:f.homeStanding?.rank,away:f.awayStanding?.rank,size:f.league.size}};
  if(!gate.eligible)return {...basic,status:'skipped',reasons:gate.reasons,categoryTips:[],tip:null};
  const league=reliability||leagueReliability(f.leagueHistory,policy);
  if(!league.reliable&&!policy.publishAllMatches)return {...basic,status:'skipped',leagueReliability:league,reasons:[`League reliability: ${league.reason}`],categoryTips:[],tip:null};
  if(policy.publishAllMatches&&(!f.homeHistory.length||!f.awayHistory.length))return oddsOnly(f,policy,basic,book,league);
  const model=modelFor(f),candidates=[];
  for(const candidate of book.candidates) {
    const estimation=estimate(candidate,model,{minimumSamples:policy.publishAllMatches?1:undefined});
    if(estimation.error) {basic.excludedMarkets.push({...candidate,reason:estimation.error});continue;}
    const gaps=(model.h2h.length<3?0.1:0)+(model.home.xg===null&&model.away.xg===null?0.05:0);
    const riskIndex=clamp(estimation.lossProbability*0.55+estimation.disagreement*0.2+(1/Math.sqrt(estimation.sampleCount||1))*0.1+gaps+((1-(league.score||0)/100)*0.1))*100;
    candidates.push({...candidate,...estimation,risk:{score:round(riskIndex,0),label:riskIndex<25?'Lower':riskIndex<45?'Moderate':'Higher',lossProbability:round(estimation.lossProbability),
      factors:[...(!league.reliable?['Unproven or unstable league']:[]),...(estimation.disagreement>0.15?['Model/history disagreement']:[]),...(model.h2h.length<3?['Limited H2H sample']:[]),...(model.home.xg===null&&model.away.xg===null?['No xG coverage']:[]),...(estimation.sampleCount<10?['Small statistical sample']:[])]}});
  }
  // Highest estimated win probability first; value and risk break ties.
  const ranked=candidates.filter(c=>isSure(c.probability,policy)).sort((a,b)=>b.probability-a.probability||b.expectedReturn-a.expectedReturn||a.risk.score-b.risk.score);
  const categories=new Map();for(const c of ranked)if(!categories.has(c.category))categories.set(c.category,c);
  const categoryTips=[...categories.values()];let tip=categoryTips[0]||null;
  if(!tip&&policy.publishAllMatches)return oddsOnly(f,policy,basic,book,league);
  if(tip)tip={...tip,scenarios:failureScenarios(tip.compiled,model)};
  return {...basic,status:tip?'qualified':'skipped',leagueReliability:league,categoryTips,tip,
    reasons:tip?explain(f,model,tip,policy):[`No supported market at odds of at least ${(policy.minimumOdds??1.2).toFixed(2)} is backed at ${sureBand(policy).label} surity`],
    form:{home:model.home,away:model.away},h2h:{...advancedH2H(f),sameVenue:model.h2h.filter(r=>r.venueMatch).length},
    expectedGoals:{home:round(model.lambdaHome),away:round(model.lambdaAway)},
    probabilityNotice:'Model estimates, not calibrated guarantees. The range is a sampling-uncertainty indicator and does not include every source of error.'};
}
function oddsOnly(f,policy,basic,book,league) {
  const ranked=book.candidates.map(c=>({...c,probability:1/c.odds,lossProbability:null,push:null,expectedReturn:null,
    probabilityRange:[null,null],sampleCount:0,method:'Sportybet implied odds; no statistical probability available',
    probabilityBasis:'odds',scenarios:[],risk:{score:null,label:'Unrated',factors:['Historical evidence unavailable']}})).filter(c=>isSure(c.probability,policy)).sort((a,b)=>b.probability-a.probability);
  const categories=new Map();for(const c of ranked)if(!categories.has(c.category))categories.set(c.category,c);
  const categoryTips=[...categories.values()],tip=categoryTips[0]||null;
  const {label}=sureBand(policy);
  return {...basic,status:tip?'qualified':'skipped',leagueReliability:league,categoryTips,tip,
    reasons:tip?[`${tip.selection} in ${tip.market} is a sure market at Sportybet odds ${Number(tip.odds).toFixed(2)}. Implied surity is ${Math.round(tip.probability*100)}%, inside ${label}.`,
      'Published from Sportybet odds because usable home/away history is missing. The displayed percentage is 1 divided by the odds, includes bookmaker margin and is not a statistical forecast.',...(f.diagnostics||[])]:[`No supported market at odds of at least ${(policy.minimumOdds??1.2).toFixed(2)} is backed at ${label} surity`,...(f.diagnostics||[])],
    probabilityNotice:'Odds-based selection; statistical probability, return and risk score are unavailable.'};
}
