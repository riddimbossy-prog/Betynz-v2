const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
const today=()=>new Date().toISOString().slice(0,10);
const qDate=new URLSearchParams(location.search).get('date');
let date=validDate(qDate)?qDate:today(),board=null,timer=null;

const time=v=>{const d=new Date(v);return isNaN(d)?'TBA':d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});};
const score=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)}/10`:'—';
const pct=v=>Number.isFinite(Number(v))?`${Math.round(Number(v)*100)}%`:'—';
const kickMs=f=>{const n=new Date(f?.kickoff).getTime();return Number.isFinite(n)?n:Number.MAX_SAFE_INTEGER;};

function crest(team){
  const name=esc(team?.name||'Team'),logo=esc(team?.logo||''),fallback=esc((team?.name||'?').trim().slice(0,1).toUpperCase());
  return `<span class="rated-crest">${logo?`<img src="${logo}" alt="${name}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`:''}<b ${logo?'hidden':''}>${fallback}</b></span>`;
}

function marketType(a){
  const bet=String(a?.finalRecommendation?.primaryBet||'');
  if(bet==='Over 2.5')return'OVER25';
  if(bet==='BTTS Yes')return'BTTS';
  if(/DNB| Win$/.test(bet))return'WIN_DNB';
  return'NONE';
}

function orderedQualified(){
  if(!board)return[];
  const all=(board.all||[]).filter(x=>x?.fixture&&x?.analysis?.banker);
  const byId=new Map(all.map(x=>[String(x.fixture.id),x]));
  const top=[];
  for(const x of board.topBankers||[]){const id=String(x?.fixture?.id||x?.analysis?.id||'');const row=byId.get(id);if(row){top.push(row);byId.delete(id);}}
  const extras=[...byId.values()].sort((a,b)=>Number(b.analysis?.finalRecommendation?.score||0)-Number(a.analysis?.finalRecommendation?.score||0)||kickMs(a.fixture)-kickMs(b.fixture));
  return[...top,...extras];
}

function metric(label,value){return `<span>${esc(label)}<b>${esc(value)}</b></span>`;}

function card(x,i,topIds){
  const f=x.fixture||{},a=x.analysis||{},r=a.finalRecommendation||{},h=a?.split?.home||{},w=a?.split?.away||{};
  const isTop=topIds.has(String(f.id));
  return `<article class="rated-card ${isTop?'top-four':''}">
    <span class="rated-badge">${isTop?'TOP 4 BANKER':'HIGHLY RATED'}</span>
    <div class="rated-rank">#${i+1}</div>
    <div class="rated-meta"><span>${esc(f?.league?.country||'')}</span><b>${esc(f?.league?.name||a.league||'League')}</b><em>${esc(time(f.kickoff))}</em></div>
    <div class="rated-teams">
      <div class="rated-team">${crest(f.home)}<strong>${esc(a.homeTeam||f?.home?.name||'Home')}</strong></div>
      <span class="rated-vs">VS</span>
      <div class="rated-team">${crest(f.away)}<strong>${esc(a.awayTeam||f?.away?.name||'Away')}</strong></div>
    </div>
    <div class="rated-pick">
      <div><small>PRIMARY MARKET</small><strong>${esc(r.primaryBet||'—')}</strong></div>
      <div class="rated-score"><b>${score(r.score)}</b><span>${esc(r.confidence||'Medium')} confidence</span></div>
    </div>
    <details>
      <summary>View exact 5 + 5 maths</summary>
      <div class="rated-math">
        <div class="rated-split"><h4>${esc(a.homeTeam||'Home')} · last 5 HOME</h4><div class="rated-metrics">${metric('PPG',h.ppg??'—')}${metric('GF',h.avgGF??'—')}${metric('GA',h.avgGA??'—')}${metric('O2.5',pct(h.over25Rate))}${metric('BTTS',pct(h.bttsRate))}${metric('Record',`${h.wins??0}W ${h.draws??0}D ${h.losses??0}L`)}</div></div>
        <div class="rated-split"><h4>${esc(a.awayTeam||'Away')} · last 5 AWAY</h4><div class="rated-metrics">${metric('PPG',w.ppg??'—')}${metric('GF',w.avgGF??'—')}${metric('GA',w.avgGA??'—')}${metric('O2.5',pct(w.over25Rate))}${metric('BTTS',pct(w.bttsRate))}${metric('Record',`${w.wins??0}W ${w.draws??0}D ${w.losses??0}L`)}</div></div>
      </div>
      <div class="rated-systems">${metric('Over 2.5',score(a?.markets?.over25?.score))}${metric('BTTS / GG',score(a?.markets?.btts?.score))}${metric('Win / DNB',score(a?.markets?.winDnb?.score))}</div>
    </details>
  </article>`;
}

function render(){
  const rows=orderedQualified(),topIds=new Set((board?.topBankers||[]).map(x=>String(x?.fixture?.id||x?.analysis?.id||'')));
  $('#ratedCount').textContent=rows.length;
  const p=board?.progress||{};$('#ratedProgress').textContent=`${p.processed||0}/${p.total||0}`;
  $('#ratedState').textContent=board?.complete?`Complete · ${rows.length} qualified pick${rows.length===1?'':'s'} for this date.`:`Analysing ${p.processed||0}/${p.total||0} · qualified picks update automatically.`;
  const market=$('#ratedMarket').value,conf=$('#ratedConfidence').value,q=$('#ratedSearch').value.trim().toLowerCase();
  const filtered=rows.filter(x=>{
    const a=x.analysis,f=x.fixture;
    if(market!=='ALL'&&marketType(a)!==market)return false;
    if(conf!=='ALL'&&String(a?.finalRecommendation?.confidence||'').toUpperCase()!==conf)return false;
    if(q&&!`${f?.home?.name||''} ${f?.away?.name||''}`.toLowerCase().includes(q))return false;
    return true;
  });
  $('#ratedGrid').innerHTML=filtered.length?filtered.map((x,i)=>card(x,rows.indexOf(x),topIds)).join(''):`<div class="rated-empty">No qualified picks match these filters.</div>`;
}

async function load(next=date){
  clearTimeout(timer);date=next;$('#ratedDate').value=date;history.replaceState(null,'',`/highly-rated.html?date=${encodeURIComponent(date)}`);$('#backTop4').href=`/?date=${encodeURIComponent(date)}`;$('#ratedState').textContent='Loading qualified picks…';
  try{
    const r=await fetch(`/api/golden-banker?date=${encodeURIComponent(date)}`,{cache:'no-store'});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.message||b.error||`HTTP ${r.status}`);board=b;render();if(!b.complete&&!b.historicalLock)timer=setTimeout(()=>load(date),4000);
  }catch(e){$('#ratedState').textContent=`Could not load this date · ${e.message}`;$('#ratedGrid').innerHTML='<div class="rated-empty">Qualified picks are unavailable for this date right now.</div>';}
}

$('#ratedDate').onchange=e=>{if(validDate(e.target.value))load(e.target.value);};
$('#ratedMarket').onchange=render;$('#ratedConfidence').onchange=render;$('#ratedSearch').oninput=render;
load(date);
