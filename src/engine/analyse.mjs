import { selections } from './markets.mjs';
import { profile,modelFor,estimate,failureScenarios,leagueReliability,advancedH2H } from './model.mjs';
import { clamp,round } from '../util.mjs';
export function eligibility(f,policy,leagueCount,now=Date.now()) {
  const reasons=[];const size=f.league.size,h=f.homeStanding,a=f.awayStanding;
  const busy=leagueCount>=policy.busyDayLeagueCount;
  if(!f.kickoff||Date.parse(f.kickoff)<=now) reasons.push('Match has already started');
  if(f.status!==undefined&&f.status!==null&&String(f.status)!=='0') reasons.push('Match is not available pre-match');
  if(/postpon|cancel|abandon|live|finish|ended/i.test(f.matchStatus||'')) reasons.push('Match is not available pre-match');
  if(!f.oddsFetchedAt||now-Date.parse(f.oddsFetchedAt)>policy.maximumOddsAgeMinutes*60000) reasons.push('Sportybet odds are stale');
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
    `Their table positions are ${f.homeStanding.rank} and ${f.awayStanding.rank} out of ${f.league.size}.`];
  if(home.scoringTrend!==null&&away.scoringTrend!==null)reasons.push(`Compared with the previous five venue matches, home scoring changed by ${home.scoringTrend>=0?'+':''}${home.scoringTrend.toFixed(1)} goals per game and away scoring by ${away.scoringTrend>=0?'+':''}${away.scoringTrend.toFixed(1)}.`);
  if(m.h2h.length) {
    const venue=m.h2h.filter(r=>r.venueMatch).length;
    reasons.push(`${m.h2h.length} recent H2Hs were checked, including ${venue} in the same home/away arrangement. Older and reversed-venue games receive less influence.`);
  } else reasons.push('No recent H2H record was available; the risk assessment includes this gap.');
  if(home.xg!==null||away.xg!==null)reasons.push(`Available expected-goals averages: home ${home.xg===null?'unavailable':home.xg.toFixed(2)}, away ${away.xg===null?'unavailable':away.xg.toFixed(2)}. Finishing that differs from xG is partly pulled toward the chance-quality evidence.`);
  else reasons.push('Expected-goals data is unavailable. Advanced assessment uses score transitions and available shots/corners/cards.');
  reasons.push(`${p.selection} in ${p.market} has the highest estimated chance among the eligible category winners at odds from ${(policy.minimumOdds??1.2).toFixed(2)} to ${policy.maximumOdds.toFixed(2)}.`);
  if(p.evidence)for(const [source,e] of Object.entries(p.evidence))if(e.count)reasons.push(`For this particular market, the weighted positive-return rate in ${source} is ${(e.successRate*100).toFixed(0)}% across ${e.count} usable matches. Samples can overlap; they are deduplicated in the final estimate.`);
  if(p.expectedReturn<0)reasons.push('The estimated return at this price is negative despite the high chance of success.');
  if(p.disagreement>0.15)reasons.push('The matchup model and observed market history disagree; the risk rating is increased.');
  return reasons;
}
export function analyse(f,policy,{leagueCount=0,now=Date.now(),reliability}={}) {
  const gate=eligibility(f,policy,leagueCount,now),book=selections(f,policy.maximumOdds,policy.minimumOdds);
  const basic={id:f.id,kickoff:f.kickoff,home:f.home,away:f.away,league:f.league,oddsFetchedAt:f.oddsFetchedAt,gate,coverage:book.counts,
    excludedMarkets:book.excluded,diagnostics:f.diagnostics||[],statsSource:f.statsSource,statsFetchedAt:f.statsFetchedAt,standings:{home:f.homeStanding?.rank,away:f.awayStanding?.rank,size:f.league.size}};
  if(!gate.eligible)return {...basic,status:'skipped',reasons:gate.reasons,categoryTips:[],tip:null};
  const league=reliability||leagueReliability(f.leagueHistory,policy);
  if(!league.reliable)return {...basic,status:'skipped',leagueReliability:league,reasons:[`League reliability: ${league.reason}`],categoryTips:[],tip:null};
  const model=modelFor(f),candidates=[];
  for(const candidate of book.candidates) {
    const estimation=estimate(candidate,model);
    if(estimation.error) {basic.excludedMarkets.push({...candidate,reason:estimation.error});continue;}
    const gaps=(model.h2h.length<3?0.1:0)+(model.home.xg===null&&model.away.xg===null?0.05:0);
    const riskIndex=clamp(estimation.lossProbability*0.55+estimation.disagreement*0.2+(1/Math.sqrt(estimation.sampleCount||1))*0.1+gaps+((1-(league.score||0)/100)*0.1))*100;
    candidates.push({...candidate,...estimation,risk:{score:round(riskIndex,0),label:riskIndex<25?'Lower':riskIndex<45?'Moderate':'Higher',lossProbability:round(estimation.lossProbability),
      factors:[...(estimation.disagreement>0.15?['Model/history disagreement']:[]),...(model.h2h.length<3?['Limited H2H sample']:[]),...(model.home.xg===null&&model.away.xg===null?['No xG coverage']:[]),...(estimation.sampleCount<10?['Small statistical sample']:[])]}});
  }
  // Highest estimated win probability first; value and risk break ties.
  const ranked=candidates.sort((a,b)=>b.probability-a.probability||b.expectedReturn-a.expectedReturn||a.risk.score-b.risk.score);
  const categories=new Map();for(const c of ranked)if(!categories.has(c.category))categories.set(c.category,c);
  const categoryTips=[...categories.values()];let tip=categoryTips[0]||null;
  if(tip)tip={...tip,scenarios:failureScenarios(tip.compiled,model)};
  return {...basic,status:tip?'qualified':'skipped',leagueReliability:league,categoryTips,tip,
    reasons:tip?explain(f,model,tip,policy):[`No supported market at odds ${(policy.minimumOdds??1.2).toFixed(2)}–${policy.maximumOdds.toFixed(2)} has sufficient data`],
    form:{home:model.home,away:model.away},h2h:{...advancedH2H(f),sameVenue:model.h2h.filter(r=>r.venueMatch).length},
    expectedGoals:{home:round(model.lambdaHome),away:round(model.lambdaAway)},
    probabilityNotice:'Model estimates, not calibrated guarantees. The range is a sampling-uncertainty indicator and does not include every source of error.'};
}
