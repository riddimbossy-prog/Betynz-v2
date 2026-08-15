import {seasonPhase,earlySeasonFlag,seasonChip} from './season-phase.js';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c]));
const state={date:new Date().toISOString().slice(0,10),board:null,timer:null,league:'ALL',season:'ALL'};
const off=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const time=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'TBA':d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})};
const pct=v=>Number.isFinite(Number(v))?`${Math.round(Number(v)*100)}%`:'—';
const api=async url=>{const r=await fetch(url,{cache:'no-store'}),b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b?.message||b?.error||`HTTP ${r.status}`);return b};

function crest(team){const name=esc(team?.name||'Team'),logo=esc(team?.logo||'');return logo?`<img src="${logo}" alt="${name}" loading="lazy" onerror="this.style.visibility='hidden'">`:`<span>${esc((team?.name||'?').slice(0,1))}</span>`}
function flag(league){const src=esc(league?.flag||'');return src?`<img src="${src}" alt="" loading="lazy">`:''}
function metric(label,value){return `<span><small>${esc(label)}</small><b>${esc(value)}</b></span>`}

function days(){
  const root=$('#ggDays');root.innerHTML='';
  for(let i=0;i<7;i++){
    const date=off(i),d=new Date(`${date}T00:00:00Z`),b=document.createElement('button');
    b.type='button';b.dataset.date=date;b.className=date===state.date?'on':'';
    b.innerHTML=`<span>${i===0?'Today · ':''}${d.toLocaleDateString(undefined,{weekday:'short',timeZone:'UTC'})}</span><b>${d.toLocaleDateString(undefined,{day:'numeric',month:'short',timeZone:'UTC'})}</b>`;
    b.onclick=()=>load(date);root.appendChild(b);
  }
}

function updateLeague(){
  const rows=state.board?.ggProfiles||[],el=$('#ggLeague'),current=state.league;
  const leagues=[...new Set(rows.map(x=>x?.fixture?.league?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  el.innerHTML='<option value="ALL">All leagues</option>'+leagues.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  state.league=leagues.includes(current)?current:'ALL';el.value=state.league;
}

function card(row){
  const f=row?.fixture||{},g=row?.gg||{},s=g.stats||{},h=s.home||{},a=s.away||{},l=s.league||{},analysis=row?.analysis||{},earlyFlag=earlySeasonFlag(f,analysis);
  const why=(g.reasons||[]).slice(0,9);
  return `<article class="banger-card">
    <div class="banger-meta">${flag(f.league)}<b>${esc(f?.league?.name||'League')}</b><span>${esc(f?.league?.country||'')}</span><time>${esc(time(f.kickoff))}</time></div>
    ${seasonChip(f,analysis)}
    <div class="banger-teams">
      <div class="banger-team">${crest(f.home)}<strong class="banger-team-name">${esc(f?.home?.name||'Home')}${earlyFlag}</strong></div>
      <span class="banger-vs">VS</span>
      <div class="banger-team">${crest(f.away)}<strong class="banger-team-name">${esc(f?.away?.name||'Away')}${earlyFlag}</strong></div>
    </div>
    <div class="banger-pick"><div><small>STATISTICAL PROFILE</small><strong>GG / BTTS</strong></div><div class="banger-odd">${Number.isFinite(Number(g.score))?Number(g.score).toFixed(1):'—'}/10</div></div>
    <div class="banger-stats">
      <div class="banger-side"><strong>${esc(f?.home?.name||'Home')} · season/home</strong><div class="banger-metrics">${metric('MATCHES',h.matchesPlayed??'—')}${metric('SEASON BTTS',pct(h.bttsRate))}${metric('HOME BTTS',pct(h.homeBttsRate))}${metric('HOME SCORES',pct(h.homeScoreRate))}${metric('CONCEDES',pct(h.concedeRate))}${metric('CLEAN SHEETS',pct(h.cleanSheetRate))}${metric('LAST 6',`${h.last6Btts??'—'}/6`)}</div></div>
      <div class="banger-side"><strong>${esc(f?.away?.name||'Away')} · season/away</strong><div class="banger-metrics">${metric('MATCHES',a.matchesPlayed??'—')}${metric('SEASON BTTS',pct(a.bttsRate))}${metric('AWAY BTTS',pct(a.awayBttsRate))}${metric('AWAY SCORES',pct(a.awayScoreRate))}${metric('CONCEDES',pct(a.concedeRate))}${metric('CLEAN SHEETS',pct(a.cleanSheetRate))}${metric('LAST 6',`${a.last6Btts??'—'}/6`)}</div></div>
    </div>
    <div class="banger-metrics banger-profile-summary">${metric('LEAGUE BTTS',pct(l.bttsRate))}</div>
    ${why.length?`<ul class="banger-why">${why.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
  </article>`;
}

function render(){
  const b=state.board||{},all=Array.isArray(b.ggProfiles)?b.ggProfiles:[];
  const rows=all.filter(x=>{
    const f=x?.fixture||{},a=x?.analysis||{};
    if(state.league!=='ALL'&&f?.league?.name!==state.league)return false;
    if(state.season!=='ALL'&&seasonPhase(f,a).key!==state.season)return false;
    return true;
  });
  $('#ggCount').textContent=String(rows.length);
  const d=new Date(`${state.date}T00:00:00Z`);$('#ggTitle').textContent=`${d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short',timeZone:'UTC'})} GG Profiles`;
  if(!b.ggReady){
    $('#ggState').innerHTML=`<span class="banger-wait">${esc(b.ggWarning||'The GG profile is still checking season history.')}</span>`;
    $('#ggList').innerHTML='<div class="banger-empty">Scanning season, venue, scoring, conceding, clean-sheet, recent-form and league BTTS signals…</div>';
    return;
  }
  const phaseLabel=state.season==='EARLY'?' · Early Season':state.season==='SOLID'?' · Solid Season':'';
  $('#ggState').textContent=`Scan complete · ${rows.length} visible profile${rows.length===1?'':'s'}${phaseLabel}.`;
  $('#ggList').innerHTML=rows.length?rows.map(card).join(''):'<div class="banger-empty">No match cleared every GG / BTTS statistical profile gate for this date.</div>';
}

async function load(date=state.date){
  clearTimeout(state.timer);state.date=date;days();
  $('#ggState').textContent='Loading GG profiles…';
  try{
    state.board=await api(`/api/golden-banker?date=${encodeURIComponent(date)}`);
    updateLeague();render();
    if(!state.board?.ggReady)state.timer=setTimeout(()=>load(date),15000);
  }catch(error){
    $('#ggState').textContent=`Could not load GG profiles: ${error.message}`;
    $('#ggList').innerHTML='<div class="banger-empty">The GG profile feed is temporarily unavailable.</div>';
    state.timer=setTimeout(()=>load(date),20000);
  }
}

$('#ggLeague').addEventListener('change',e=>{state.league=e.target.value;render()});
$('#ggSeason').addEventListener('change',e=>{state.season=e.target.value;render()});
$('#ggRefresh').addEventListener('click',()=>load(state.date));
days();load();
