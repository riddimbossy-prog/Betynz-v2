import {seasonPhase,earlySeasonFlag,seasonChip} from './season-phase.js';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c]));
const state={date:new Date().toISOString().slice(0,10),board:null,timer:null,league:'ALL',season:'ALL'};
const off=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const time=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'TBA':d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
const num=v=>Number.isFinite(Number(v))?Number(v).toFixed(2):'—';
const pct=v=>Number.isFinite(Number(v))?`${Math.round(Number(v)*100)}%`:'—';
const api=async url=>{const r=await fetch(url,{cache:'no-store'}),b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.message||b?.error||`HTTP ${r.status}`);return b};

function crest(team){const name=esc(team?.name||'Team'),logo=esc(team?.logo||'');return logo?`<img src="${logo}" alt="${name}" loading="lazy" onerror="this.style.visibility='hidden'">`:`<span>${esc((team?.name||'?').slice(0,1))}</span>`}
function flag(league){const src=esc(league?.flag||'');return src?`<img src="${src}" alt="" loading="lazy">`:''}

function days(){
  const root=$('#bangerDays');root.innerHTML='';
  for(let i=0;i<7;i++){
    const date=off(i),d=new Date(`${date}T00:00:00Z`),b=document.createElement('button');
    b.type='button';b.dataset.date=date;b.className=date===state.date?'on':'';
    b.innerHTML=`<span>${i===0?'Today · ':''}${d.toLocaleDateString(undefined,{weekday:'short',timeZone:'UTC'})}</span><b>${d.toLocaleDateString(undefined,{day:'numeric',month:'short',timeZone:'UTC'})}</b>`;
    b.onclick=()=>load(date);root.appendChild(b);
  }
}

function updateLeague(){
  const rows=state.board?.bangers||[],el=$('#bangerLeague'),current=state.league;
  const leagues=[...new Set(rows.map(x=>x?.fixture?.league?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  el.innerHTML='<option value="ALL">All leagues</option>'+leagues.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  state.league=leagues.includes(current)?current:'ALL';el.value=state.league;
}

function metric(label,value){return `<span><small>${esc(label)}</small><b>${esc(value)}</b></span>`}

function card(row){
  const f=row?.fixture||{},b=row?.banger||{},s=b.stats||{},h=s.home||{},a=s.away||{},l=s.league||{},analysis=row?.analysis||{},earlyFlag=earlySeasonFlag(f,analysis);
  const why=(b.reasons||[]).slice(0,8);
  return `<article class="banger-card">
    <div class="banger-meta">${flag(f.league)}<b>${esc(f?.league?.name||'League')}</b><span>${esc(f?.league?.country||'')}</span><time>${esc(time(f.kickoff))}</time></div>
    ${seasonChip(f,analysis)}
    <div class="banger-teams">
      <div class="banger-team">${crest(f.home)}<strong class="banger-team-name">${esc(f?.home?.name||'Home')}${earlyFlag}</strong></div>
      <span class="banger-vs">VS</span>
      <div class="banger-team">${crest(f.away)}<strong class="banger-team-name">${esc(f?.away?.name||'Away')}${earlyFlag}</strong></div>
    </div>
    <div class="banger-pick"><div><small>STATISTICAL PROFILE</small><strong>High-Scoring Match</strong></div><div class="banger-odd">${num(b.score)}/10</div></div>
    <div class="banger-stats">
      <div class="banger-side"><strong>${esc(f?.home?.name||'Home')} · season</strong><div class="banger-metrics">${metric('MATCHES',h.matchesPlayed??'—')}${metric('SEASON RATE',pct(h.over25Rate))}${metric('HOME RATE',pct(h.homeOver25Rate))}${metric('AVG GF',num(h.avgGF))}${metric('AVG GA',num(h.avgGA))}${metric('LAST 6',`${h.last6Overs??'—'}/6`)}</div></div>
      <div class="banger-side"><strong>${esc(f?.away?.name||'Away')} · season</strong><div class="banger-metrics">${metric('MATCHES',a.matchesPlayed??'—')}${metric('SEASON RATE',pct(a.over25Rate))}${metric('AWAY RATE',pct(a.awayOver25Rate))}${metric('AVG GF',num(a.avgGF))}${metric('AVG GA',num(a.avgGA))}${metric('LAST 6',`${a.last6Overs??'—'}/6`)}</div></div>
    </div>
    <div class="banger-metrics banger-profile-summary">${metric('COMBINED GOALS',num(s.combinedAverageGoals))}${metric('LEAGUE RATE',pct(l.over25Rate))}${metric('xG + xGA',b?.xg?.available?num(b.xg.combined):'N/A')}</div>
    ${why.length?`<ul class="banger-why">${why.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  </article>`;
}

function render(){
  const b=state.board||{},all=Array.isArray(b.bangers)?b.bangers:[];
  const rows=all.filter(x=>{
    const f=x?.fixture||{},a=x?.analysis||{};
    if(state.league!=='ALL'&&f?.league?.name!==state.league)return false;
    if(state.season!=='ALL'&&seasonPhase(f,a).key!==state.season)return false;
    return true;
  });
  $('#bangerCount').textContent=String(rows.length);
  const d=new Date(`${state.date}T00:00:00Z`);$('#bangerTitle').textContent=`${d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'})} Bangers`;
  if(!b.bangersReady){
    $('#bangerState').innerHTML=`<span class="banger-wait">${esc(b.bangersWarning||'The high-scoring profile is still checking season history.')}</span>`;
    $('#bangerList').innerHTML='<div class="banger-empty">Scanning season, venue, recent-form and league goal signals…</div>';
    return;
  }
  const phaseLabel=state.season==='EARLY'?' · Early Season':state.season==='SOLID'?' · Solid Season':'';
  $('#bangerState').textContent=`Scan complete · ${rows.length} visible match${rows.length===1?'':'es'}${phaseLabel}.`;
  $('#bangerList').innerHTML=rows.length?rows.map(card).join(''):'<div class="banger-empty">No match cleared every statistical profile gate for this date.</div>';
}

async function load(date=state.date){
  clearTimeout(state.timer);state.date=date;days();
  $('#bangerState').textContent='Loading Bangers…';
  try{
    state.board=await api(`/api/golden-banker?date=${encodeURIComponent(date)}`);
    updateLeague();render();
    if(!state.board?.bangersReady)state.timer=setTimeout(()=>load(date),15000);
  }catch(error){
    $('#bangerState').textContent=`Could not load Bangers: ${error.message}`;
    $('#bangerList').innerHTML='<div class="banger-empty">The Bangers feed is temporarily unavailable.</div>';
    state.timer=setTimeout(()=>load(date),20000);
  }
}

$('#bangerLeague').addEventListener('change',e=>{state.league=e.target.value;render()});
$('#bangerSeason').addEventListener('change',e=>{state.season=e.target.value;render()});
$('#bangerRefresh').addEventListener('click',()=>load(state.date));
days();load();