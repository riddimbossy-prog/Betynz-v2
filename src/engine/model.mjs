import { clamp, mean, round } from '../util.mjs';
import { evaluate } from './markets.mjs';
export function profile(rows,side) {
  const recent=rows.slice(0,5),older=rows.slice(5,10),other=side==='home'?'away':'home';
  const avg=(list,k)=>mean(list.map(r=>r[k]));
  const points=list=>mean(list.map(r=>r[side]>r[other]?3:r[side]===r[other]?1:0));
  const advanced=key=>mean(recent.map(r=>r.stats?.[r[`${side}Id`]]?.[key]).filter(x=>x!=null));
  return {games:recent.length,gf:avg(recent,side),ga:avg(recent,other),ppg:points(recent),previousPpg:points(older),previousGf:avg(older,side),
    xg:advanced('xg'),shots:advanced('shots'),shotsOnTarget:advanced('shotsOnTarget'),
    cleanSheets:recent.filter(r=>r[other]===0).length,failedToScore:recent.filter(r=>r[side]===0).length,
    form:recent.map(r=>r[side]>r[other]?'W':r[side]===r[other]?'D':'L'),
    scoringTrend:older.length?round(avg(recent,side)-avg(older,side)):null};
}
function poisson(lambda,max=9) { const p=[Math.exp(-lambda)]; for(let k=1;k<=max;k++)p[k]=p[k-1]*lambda/k; return p; }
export function scoreGrid(homeLambda,awayLambda,homeHalf=0.45,awayHalf=0.45) {
  const hp=poisson(homeLambda*homeHalf,7),ap=poisson(awayLambda*awayHalf,7);
  const hs=poisson(homeLambda*(1-homeHalf),7),as=poisson(awayLambda*(1-awayHalf),7);
  const rows=[];let mass=0;
  for(let h1=0;h1<hp.length;h1++)for(let a1=0;a1<ap.length;a1++)for(let h2=0;h2<hs.length;h2++)for(let a2=0;a2<as.length;a2++) {
    const weight=hp[h1]*ap[a1]*hs[h2]*as[a2]; if(weight<1e-10)continue;
    rows.push({home:h1+h2,away:a1+a2,htHome:h1,htAway:a1,weight});mass+=weight;
  }
  for(const r of rows)r.weight/=mass;
  return rows;
}
function weightedScoring(rows,side,table) {
  const other=side==='home'?'away':'home'; let weight=0,gf=0,ga=0;
  rows.slice(0,10).forEach((r,i)=>{
    const opponent=table.find(t=>String(t.team.id)===r[`${other}Id`]);
    const ppg=opponent?.all?.played?opponent.points/opponent.all.played:1.4;
    // Small opponent-strength adjustment. Historical results remain the main signal.
    const adjustment=clamp(1+(ppg-1.4)*0.12,0.85,1.15),w=Math.exp(-i/5);
    gf+=r[side]*adjustment*w;ga+=r[other]/adjustment*w;weight+=w;
  });
  return {gf:gf/weight,ga:ga/weight};
}
export function orient(r,homeId) {
  const swap=r.homeId!==homeId;
  return {home:swap?r.away:r.home,away:swap?r.home:r.away,htHome:swap?r.htAway:r.htHome,htAway:swap?r.htHome:r.htAway,
    stats:{home:r.stats?.[swap?r.awayId:r.homeId],away:r.stats?.[swap?r.homeId:r.awayId]}};
}
export function advancedH2H(f) {
  const rows=f.h2h.map(r=>orient(r,f.home.apiId)),paths={};let leads=0,held=0,reversals=0,transitions=0;
  const htRows=rows.filter(r=>r.htHome!==null&&r.htAway!==null);
  for(const r of htRows) {
    const ht=r.htHome>r.htAway?'H':r.htHome<r.htAway?'A':'D',ft=r.home>r.away?'H':r.home<r.away?'A':'D';
    paths[`${ht}/${ft}`]=(paths[`${ht}/${ft}`]||0)+1;
    if(ht!=='D'){leads++;if(ht===ft)held++;}
    if(ht!==ft)transitions++;
    if((ht==='H'&&ft==='A')||(ht==='A'&&ft==='H'))reversals++;
  }
  const statMean=(side,key)=>mean(rows.map(r=>r.stats?.[side]?.[key]).filter(v=>v!=null));
  return {games:rows.length,halfTimeGames:htRows.length,htftCounts:paths,bttsRate:rows.length?rows.filter(r=>r.home>0&&r.away>0).length/rows.length:null,
    over25Rate:rows.length?rows.filter(r=>r.home+r.away>2.5).length/rows.length:null,leadHoldRate:leads?held/leads:null,reversals,transitions,
    homeXg:statMean('home','xg'),awayXg:statMean('away','xg'),homeShots:statMean('home','shots'),awayShots:statMean('away','shots')};
}
export function modelFor(f) {
  const home=profile(f.homeHistory,'home'),away=profile(f.awayHistory,'away');
  const h=weightedScoring(f.homeHistory,'home',f.table),a=weightedScoring(f.awayHistory,'away',f.table);
  const leagueHome=mean(f.leagueHistory.map(r=>r.home))||1.45,leagueAway=mean(f.leagueHistory.map(r=>r.away))||1.15;
  const attackH=home.xg==null?h.gf:h.gf*0.7+home.xg*0.3;
  const attackA=away.xg==null?a.gf:a.gf*0.7+away.xg*0.3;
  let lh=(attackH*0.55+a.ga*0.45)*0.85+leagueHome*0.15;
  let la=(attackA*0.55+h.ga*0.45)*0.85+leagueAway*0.15;
  const h2h=f.h2h.map(r=>({...orient(r,f.home.apiId),venueMatch:r.homeId===f.home.apiId,date:r.date}));
  const h2hWeight=Math.min(0.15,h2h.length*0.025);
  if(h2h.length) { lh=lh*(1-h2hWeight)+mean(h2h.map(r=>r.home))*h2hWeight; la=la*(1-h2hWeight)+mean(h2h.map(r=>r.away))*h2hWeight; }
  const halfShare=(rows,side)=>{const valid=rows.filter(r=>r[side]>0&&r[side==='home'?'htHome':'htAway']!=null);const ratio=mean(valid.map(r=>r[side==='home'?'htHome':'htAway']/r[side]));return ratio===null?0.45:clamp(0.45*0.5+ratio*0.5,0.3,0.6);};
  lh=clamp(lh,0.2,4.5);la=clamp(la,0.2,4.5);
  return {home,away,h2h,lambdaHome:lh,lambdaAway:la,grid:scoreGrid(lh,la,halfShare(f.homeHistory,'home'),halfShare(f.awayHistory,'away')),
    samples:[...f.homeHistory.slice(0,5).map(r=>({...orient(r,r.homeId),weight:1,source:'home form',id:r.id})),...f.awayHistory.slice(0,5).map(r=>({...orient(r,r.homeId),weight:1,source:'away form',id:r.id})),...f.h2h.map(r=>({...orient(r,f.home.apiId),weight:(r.homeId===f.home.apiId?0.6:0.3)*Math.exp(-(Date.parse(f.kickoff)-Date.parse(r.date))/(730*86400000)),source:'h2h',id:r.id}))]};
}
function distribution(rows,selection) {
  const d={win:0,push:0,loss:0,halfWin:0,halfLoss:0,weight:0,count:0};
  for(const row of rows) {
    const v=evaluate(selection,row); if(v==null)continue;
    const weight=row.weight??1;d.weight+=weight;d.count++;
    d[v===1?'win':v===0?'push':v===-1?'loss':v===0.5?'halfWin':'halfLoss']+=weight;
  }
  if(d.weight)for(const k of ['win','push','loss','halfWin','halfLoss'])d[k]/=d.weight;
  return d;
}
export function estimate(candidate,model) {
  const selection=candidate.compiled;
  // Deduplicate a match appearing in both split form and H2H; overlapping evidence is not independent.
  const distinct=[...new Map(model.samples.map(r=>[r.id,r])).values()];
  const empirical=distribution(distinct,selection);
  const goal=selection.stat==='goals';
  if(!goal && empirical.count<8) return {error:`Only ${empirical.count} relevant ${selection.stat} records; at least 8 required`};
  if((selection.period!=='ft'||/half|htft/.test(selection.kind))&&empirical.count<5) return {error:'Insufficient half-time score history'};
  const predicted=goal?distribution(model.grid,selection):null;
  if(goal && !predicted.weight) return {error:'Unsupported settlement boundary'};
  const priorWeight=goal?12:4;
  const prior=goal?predicted:{win:1/candidate.odds,push:0,loss:1-1/candidate.odds,halfWin:0,halfLoss:0};
  const d={};for(const k of ['win','push','loss','halfWin','halfLoss']) d[k]=(prior[k]*priorWeight+empirical[k]*empirical.weight)/(priorWeight+empirical.weight);
  const p=d.win+d.halfWin,lose=d.loss+d.halfLoss;
  const n=Math.max(1,empirical.weight),z=1.645,den=1+z*z/n,center=(p+z*z/(2*n))/den;
  const margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
  const ev=(d.win+d.halfWin*0.5)*(candidate.odds-1)-(d.loss+d.halfLoss*0.5);
  const disagreement=goal&&empirical.count?Math.abs(predicted.win+predicted.halfWin-(empirical.win+empirical.halfWin)):0.15;
  const evidence=Object.fromEntries(['home form','away form','h2h'].map(source=>{
    const d=distribution(model.samples.filter(r=>r.source===source),selection);return [source,{count:d.count,successRate:d.count?d.win+d.halfWin:null}];
  }));
  return {...d,probability:p,lossProbability:lose,expectedReturn:ev,breakEvenProbability:1/candidate.odds,
    probabilityRange:[clamp(center-margin),clamp(center+margin)],sampleCount:empirical.count,effectiveSampleSize:round(empirical.weight),
    disagreement,evidence,empiricalProbability:empirical.win+empirical.halfWin,modelProbability:predicted?predicted.win+predicted.halfWin:null,
    method:goal?'Split-form goal model + recency-weighted H2H':'Historical event statistics, shrunk toward offered-odds prior'};
}
export function failureScenarios(selection,model) {
  if(selection.stat!=='goals') return [];
  const favorite=model.lambdaHome>=model.lambdaAway?'home':'away',other=favorite==='home'?'away':'home';
  const cases=[['Stronger team fails to score',r=>r[favorite]===0],['Stronger team loses',r=>r[favorite]<r[other]],['Match finishes with 0 or 1 goal',r=>r.home+r.away<=1]];
  return cases.map(([label,test])=>{const rows=model.grid.filter(test);const d=distribution(rows,selection);return {label,scenarioProbability:round(rows.reduce((s,r)=>s+r.weight,0)),survivalProbability:round(d.win+d.halfWin+d.push)};});
}
export function leagueReliability(history,policy) {
  if(history.length<policy.minimumLeagueGames) return {reliable:false,reason:'Insufficient league history',sampleSize:history.length};
  if(new Set(history.flatMap(r=>[r.homeId,r.awayId])).size<(policy.minimumLeagueTeams||8)) return {reliable:false,reason:'Insufficient league-wide team coverage',sampleSize:history.length};
  const previous=new Map();const briers=[];let opportunities=0,upsets=0;
  for(const r of [...history].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))) {
    const hk=`h:${r.homeId}`,ak=`a:${r.awayId}`,h=previous.get(hk)||[],a=previous.get(ak)||[];
    if(h.length>=4&&a.length>=4) {
      const hp=profile(h,'home'),ap=profile(a,'away');
      const gap=hp.ppg-ap.ppg;
      if(Math.abs(gap)>=0.65) {opportunities++;if(gap>0?r.home<r.away:r.away<r.home)upsets++;}
      const ph=poisson(clamp((hp.gf+ap.ga)/2,0.2,4.5),12),pa=poisson(clamp((ap.gf+hp.ga)/2,0.2,4.5),12);const p=[0,0,0];
      for(let i=0;i<ph.length;i++)for(let j=0;j<pa.length;j++)p[i>j?0:i===j?1:2]+=ph[i]*pa[j];
      const actual=r.home>r.away?0:r.home===r.away?1:2;briers.push(p.reduce((s,v,i)=>s+(v-(i===actual?1:0))**2,0));
    }
    previous.set(hk,[r,...h].slice(0,10));previous.set(ak,[r,...a].slice(0,10));
  }
  const brier=mean(briers),upsetRate=opportunities?upsets/opportunities:null;
  const enough=briers.length>=24&&opportunities>=10;
  const reliable=enough&&brier<=policy.maximumLeagueBrier&&upsetRate<=policy.maximumLeagueUpsetRate;
  return {reliable,reason:!enough?'Insufficient historical forecast checks':reliable?'Historical stability checks passed':'High upset rate or unstable result patterns',sampleSize:history.length,forecastChecks:briers.length,upsetOpportunities:opportunities,upsetRate:round(upsetRate),brier:round(brier),score:round(clamp(1-((brier||1)/2+(upsetRate||0)/2))*100,0)};
}
