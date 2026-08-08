import { dataBackedButton } from './data-backed-ui.js';
import { fetchJson, mergeProgressiveBoard } from './api-client.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const odd=v=>Number(v)>1?Number(v).toFixed(2):'—';
const fmt=v=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';
const today=new Date().toISOString().slice(0,10);
let payload=null,pollTimer=null,requestVersion=0,pollCount=0;

$('#atlasDate').value=today;
$('#atlasRefresh').addEventListener('click',()=>load());
$('#atlasDate').addEventListener('change',()=>load());
$('#atlasDecisionFilter').addEventListener('change',render);
$('#atlasMarketFilter').addEventListener('change',render);

function kickoff(v){const d=new Date(v);return Number.isNaN(d.getTime())?'Kickoff TBA':d.toLocaleString([],{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function schedulePoll(date,version,delay=null){clearTimeout(pollTimer);pollTimer=setTimeout(()=>{if(version===requestVersion&&($('#atlasDate').value||today)===date)load({silent:true})},delay??(payload?.providerQueue?.coolingDown?5000:(pollCount++<20?1500:4000)));}

async function load({silent=false}={}){
  const date=$('#atlasDate').value||today,version=++requestVersion;
  clearTimeout(pollTimer);
  if(!silent)$('#atlasGrid').innerHTML='<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>Starting Atlas analysis…</h3><p>Qualified routes appear as soon as their evidence is complete.</p></div>';
  try{
    const data=await fetchJson(`/api/streak-value-board?date=${encodeURIComponent(date)}`);payload=mergeProgressiveBoard(payload,data);
    if(version!==requestVersion)return;
    $('#atlasFixtures').textContent=payload.summary?.fixtures||0;
    $('#atlasAnalysed').textContent=payload.summary?.analysed||payload.progress?.processed||0;
    $('#atlasFire').textContent=payload.summary?.fire||0;
    $('#atlasSafer').textContent=payload.summary?.safer||0;
    render();
    if(!payload.complete&&!payload.failed)schedulePoll(date,version);
  }catch(e){
    if(version!==requestVersion)return;
    const transient=e.transient||e.name==='AbortError';
    if(transient){if(payload?.qualified?.length){render();schedulePoll(date,version,3000);return}$('#atlasGrid').innerHTML='<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot"></span><h3>Analysis service is recovering…</h3><p>A temporary gateway delay will be retried automatically.</p></div>';schedulePoll(date,version,3000);return}
    payload=null;
    $('#atlasVisibleCount').textContent='0';
    $('#atlasGrid').innerHTML=`<div class="route-empty"><h3>Atlas analysis unavailable</h3><p>${esc(e.message||'Retry shortly.')}</p></div>`;
  }
}

function marketGroup(item={}){
  const label=String(item.engine?.selection?.label||item.engine?.selection?.market||'').toLowerCase();
  if(/team/.test(label))return 'TEAM_GOALS';
  if(/over|under|goal/.test(label))return 'MATCH_GOALS';
  return 'RESULT';
}

function streakItems(p={}){
  const s=p.streaks||{};
  return [
    ['Wins',s.wins],['Unbeaten',s.unbeaten],['Winless',s.winless],['Losses',s.losses],
    ['Scored',s.scoring],['O1.5',s.over15],['U3.5',s.under35]
  ].map(([label,value])=>`<span class="atlas-streak"><small>${esc(label)}</small><b>${Number(value||0)}</b></span>`).join('');
}

function evidence(team={},name='Team'){
  const cls=String(team.classification||'UNRATED').replaceAll('_',' ');
  return `<article class="atlas-team-card">
    <header><div><small>${esc(name)}</small><strong>${esc(cls)}</strong></div><span class="atlas-strength"><small>Strength</small><b>${Number(team.strengthScore||0).toFixed(0)}</b></span></header>
    <div class="atlas-team-metrics">
      <span><small>PPG</small><b>${team.ppg==null?'—':Number(team.ppg).toFixed(2)}</b></span>
      <span><small>Goals for</small><b>${team.goalsForAvg==null?'—':Number(team.goalsForAvg).toFixed(2)}</b></span>
      <span><small>Goals against</small><b>${team.goalsAgainstAvg==null?'—':Number(team.goalsAgainstAvg).toFixed(2)}</b></span>
    </div>
    <div class="atlas-streak-grid">${streakItems(team)}</div>
  </article>`;
}

function signalBox(label,home,away,sub=''){
  return `<span class="atlas-signal"><small>${esc(label)}</small><b>${esc(home)} <i>vs</i> ${esc(away)}</b>${sub?`<em>${esc(sub)}</em>`:''}</span>`;
}

function render(){
  if(!payload)return;
  const decision=$('#atlasDecisionFilter').value,market=$('#atlasMarketFilter').value;
  const rows=(payload.qualified||[])
    .filter(x=>decision==='ALL'||x.engine?.decision===decision)
    .filter(x=>market==='ALL'||marketGroup(x)===market)
    .sort((a,b)=>{
      const ad=a.engine?.decision==='FIRE'?0:1,bd=b.engine?.decision==='FIRE'?0:1;
      if(ad!==bd)return ad-bd;
      return Number(b.engine?.selection?.score||0)-Number(a.engine?.selection?.score||0);
    });
  $('#atlasVisibleCount').textContent=String(rows.length);

  if(!rows.length){
    if(!payload.complete){
      const q=payload.providerQueue||{},p=payload.progress||{};
      const sec=Math.max(1,Math.ceil(Number(q.retryInMs||0)/1000));
      $('#atlasGrid').innerHTML=`<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot"></span><h3>${q.coolingDown?'Stats API cooldown…':'Building streak + xG/SOT evidence…'}</h3><p>${q.coolingDown?`Resuming automatically in about ${sec}s.`:`${Number(p.processed||0)} of ${Number(p.total||0)} candidate fixtures processed.`}</p></div>`;
      return;
    }
    $('#atlasGrid').innerHTML=`<div class="route-empty"><h3>No Atlas value picks</h3><p>${esc(payload.warning||'No qualified selections match the current filters.')}</p></div>`;
    return;
  }

  const progress=!payload.complete?`<div class="route-progress apex-progress-glow atlas-progress">Stats API analysis continues · ${Number(payload.progress?.processed||0)}/${Number(payload.progress?.total||0)} candidates processed</div>`:'';
  $('#atlasGrid').innerHTML=progress+rows.map((item,i)=>{
    const f=item.fixture||{},e=item.engine||{},s=e.selection||{},ev=item.statsEvidence||{},c=(e.candidates||[]).find(x=>x.id===s.routeId)||{};
    const hg=ev.homeGoal||{},ag=ev.awayGoal||{};
    const checks=(c.checks||[]);
    const xgSub=(hg.xgFor==null&&ag.xgFor==null)?'not available':'recent attacking pressure';
    const sotSub=(hg.sotFor==null&&ag.sotFor==null)?'not available':'recent shots on target';
    return `<article class="route-pick-card atlas-pick-card apex-soft-reveal" style="--reveal-index:${i}">
      <div class="route-pick-head atlas-card-head">
        <div><p class="atlas-league">${esc(f.league?.country||'International')} · ${esc(f.league?.name||'League')}</p><h2>${esc(f.home?.name)} <span>vs</span> ${esc(f.away?.name)}</h2><p>${esc(kickoff(f.kickoff))}</p></div>
        <span class="decision-pill ${String(s.decision||'').toLowerCase()}">${esc(s.decision||'FIRE')}</span>
      </div>
      <div class="route-market atlas-market-banner"><div><small>OFFICIAL ATLAS PICK</small><b>${esc(s.label||s.market)}</b></div><strong>${odd(s.odds)}</strong></div>
      ${dataBackedButton(e.dataValidation || s.dataValidation)}
      <div class="atlas-team-grid">${evidence(ev.home,f.home?.name||'Home')}${evidence(ev.away,f.away?.name||'Away')}</div>
      <div class="atlas-signal-row">
        ${signalBox('xG',hg.xgFor??'—',ag.xgFor??'—',xgSub)}
        ${signalBox('SOT',hg.sotFor??'—',ag.sotFor??'—',sotSub)}
        <span class="atlas-signal value"><small>Atlas score</small><b>${Number(s.score||0).toFixed(0)}</b><em>${esc(s.grade||'Qualified')}</em></span>
      </div>
      <p class="atlas-explanation">${esc(e.explanation||'')}</p>
      ${checks.length?`<div class="route-card-checks atlas-checks">${checks.map(x=>`<span class="${x.pass?'pass':'fail'}"><i>${x.pass?'✓':'×'}</i><b>${esc(x.label)}</b><small>${esc(x.actual)}</small></span>`).join('')}</div>`:''}
    </article>`;
  }).join('');
}

load();
