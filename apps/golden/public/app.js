const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const S = {
  date: new Date().toISOString().slice(0,10),
  fixtures: [],
  g: null,
  map: new Map(),
  timer: null,
  scope: 'CANDIDATES',
  centreOpen: false,
  page: 1,
  pageSize: 20
};

const off = n => { const d = new Date(); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
const time = v => { const d = new Date(v); return isNaN(d) ? 'TBA' : d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); };
const shortDate = v => { const d = new Date(v); return isNaN(d) ? '—' : d.toLocaleDateString([],{day:'2-digit',month:'short'}); };
const pct = v => Number.isFinite(Number(v)) ? `${Math.round(Number(v)*100)}%` : '—';
const scoreText = v => Number.isFinite(Number(v)) ? `${Number(v).toFixed(1)}/10` : '—';
const kickMs = f => { const n = new Date(f?.kickoff).getTime(); return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; };

function group(f){
  if(/^(1H|HT|2H|ET|BT|P|LIVE|INT|INPLAY)$/i.test(f?.status)) return 'LIVE';
  if(/^(FT|AET|PEN|FINISHED|ENDED|COMPLETED)$/i.test(f?.status)) return 'SETTLED';
  if(/PST|CANC|ABD/i.test(f?.status)) return 'WAITING';
  return 'UPCOMING';
}

function finalBankerIds(){
  return new Set((S.g?.topBankers||[]).map(x=>String(x?.fixture?.id||x?.analysis?.id||'')).filter(Boolean));
}

function isFinalBanker(f){
  return finalBankerIds().has(String(f?.id||''));
}

function fixtureScore(f){
  const s=f?.score||{};
  const h=Number.isFinite(Number(s.fulltimeHome))?Number(s.fulltimeHome):Number(s.home);
  const a=Number.isFinite(Number(s.fulltimeAway))?Number(s.fulltimeAway):Number(s.away);
  return Number.isFinite(h)&&Number.isFinite(a)?{h,a}:null;
}

function settledOutcome(f,a){
  if(group(f)!=='SETTLED'||!a?.banker||!isFinalBanker(f)) return null;
  const s=fixtureScore(f); if(!s) return null;
  const bet=String(a?.finalRecommendation?.primaryBet||'');
  if(bet==='Over 2.5') return s.h+s.a>=3?'WON':'LOST';
  if(bet==='BTTS Yes') return s.h>0&&s.a>0?'WON':'LOST';
  if(/ DNB$/.test(bet)){
    const home=/^Home|Home DNB/i.test(bet)||a?.markets?.winDnb?.favouriteSide==='Home';
    if(s.h===s.a) return 'PUSH';
    return (home?s.h>s.a:s.a>s.h)?'WON':'LOST';
  }
  if(/ Win$/.test(bet)){
    const home=/^Home|Home Win/i.test(bet)||a?.markets?.winDnb?.favouriteSide==='Home';
    return (home?s.h>s.a:s.a>s.h)?'WON':'LOST';
  }
  return null;
}

function stateFor(f,a){
  const g=group(f);
  if(g==='LIVE') return 'LIVE';
  const settled=settledOutcome(f,a);
  if(settled) return settled;
  if(a?.waiting) return 'WAITING FOR 5+5';
  if(!a) return 'ANALYSING';
  if(a.banker) return isFinalBanker(f)?'BANKER':'CANDIDATE';
  return 'REJECTED';
}

function stateClass(label){
  return String(label||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function marketType(a){
  const bet=String(a?.finalRecommendation?.primaryBet||'');
  if(bet==='Over 2.5') return 'OVER25';
  if(bet==='BTTS Yes') return 'BTTS';
  if(/DNB| Win$/.test(bet)) return 'WIN_DNB';
  return 'NONE';
}

async function api(u){
  const r=await fetch(u,{cache:'no-store'}),b=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(b.message||b.error||`HTTP ${r.status}`);
  return b;
}

function crest(team,cls='crest'){
  const name=esc(team?.name||'Team'),logo=esc(team?.logo||'');
  const fallback=esc((team?.name||'?').trim().slice(0,1).toUpperCase());
  return `<span class="${cls}">${logo?`<img src="${logo}" alt="${name}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`:''}<b ${logo?'hidden':''}>${fallback}</b></span>`;
}

function days(){
  const root=$('#days'); root.innerHTML='';
  for(let i=0;i<7;i++){
    const date=off(i),d=new Date(`${date}T00:00:00Z`),b=document.createElement('button');
    b.dataset.date=date; b.className=date===S.date?'on':'';
    b.innerHTML=`<span>${i?'':'Today · '}${d.toLocaleDateString(undefined,{weekday:'short',timeZone:'UTC'})}</span><b>${d.toLocaleDateString(undefined,{day:'numeric',month:'short',timeZone:'UTC'})}</b>`;
    b.onclick=()=>load(date); root.appendChild(b);
  }
}

function updateLeagueFilter(){
  const el=$('#league'),old=el.value;
  const leagues=[...new Set(S.fixtures.map(f=>f?.league?.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  el.innerHTML='<option value="ALL">All leagues</option>'+leagues.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  el.value=leagues.includes(old)?old:'ALL';
}

function renderTop(){
  const top=S.g?.topBankers||[];
  $('#top4').innerHTML=top.length?top.map((x,i)=>{
    const f=x.fixture||{},a=x.analysis||{},r=a.finalRecommendation||{};
    const conf=r.confidence||'Medium';
    return `<article class="banker-card" data-open="${esc(f.id)}">
      <div class="banker-rank">#${i+1}</div>
      <div class="banker-league"><span>${esc(f?.league?.country||'')}</span><b>${esc(f?.league?.name||a.league||'League')}</b><em>${esc(time(f.kickoff))}</em></div>
      <div class="banker-teams">
        <div>${crest(f.home,'banker-crest')}<strong>${esc(a.homeTeam||f?.home?.name||'Home')}</strong></div>
        <span>VS</span>
        <div>${crest(f.away,'banker-crest')}<strong>${esc(a.awayTeam||f?.away?.name||'Away')}</strong></div>
      </div>
      <div class="banker-pick"><small>PRIMARY MARKET</small><strong>${esc(r.primaryBet||'—')}</strong></div>
      <div class="banker-metrics"><span><small>SCORE</small><b>${scoreText(r.score)}</b></span><span><small>CONFIDENCE</small><b>${esc(conf)}</b></span></div>
      <p>${esc(r.summary||'Qualified by Golden Banker split-form rules.')}</p>
      <button class="why-btn" type="button" data-open="${esc(f.id)}">Why this pick →</button>
    </article>`;
  }).join(''):`<div class="empty">${S.g?.complete?'No match cleared the 7/10 banker gates for this date.':'Golden Banker is still analysing the exact 5 + 5 samples.'}</div>`;
  $$('[data-open]').forEach(el=>el.onclick=e=>{e.stopPropagation();open(el.dataset.open);});
}

function baseFiltered(){
  const st=$('#status').value,market=$('#market').value,conf=$('#confidence').value,league=$('#league').value,q=$('#search').value.trim().toLowerCase();
  return S.fixtures.filter(f=>{
    const a=S.map.get(String(f.id)),g=group(f);
    if(st==='WAITING'&&!a?.waiting) return false;
    if(st!=='ALL'&&st!=='WAITING'&&g!==st) return false;
    if(market!=='ALL'&&marketType(a)!==market) return false;
    if(conf!=='ALL'&&String(a?.finalRecommendation?.confidence||'').toUpperCase()!==conf) return false;
    if(league!=='ALL'&&f?.league?.name!==league) return false;
    if(q&&!`${f.home?.name||''} ${f.away?.name||''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderMatch(f){
  const a=S.map.get(String(f.id)),r=a?.finalRecommendation||{},label=stateFor(f,a),s=fixtureScore(f),g=group(f);
  const pick=a?.waiting?'Waiting exact 5 + 5':a?r.primaryBet:'Analysing…';
  const liveScore=s?`${s.h} – ${s.a}`:g==='LIVE'?'LIVE':'VS';
  return `<button class="match" type="button" data-id="${esc(f.id)}">
    <div class="match-meta"><span>${esc(f?.league?.country||'')}</span><b>${esc(f?.league?.name||'League')}</b><em>${esc(time(f.kickoff))}</em></div>
    <div class="match-teams">
      <div>${crest(f.home)}<strong>${esc(f.home?.name||'Home')}</strong></div>
      <span>${esc(liveScore)}</span>
      <div>${crest(f.away)}<strong>${esc(f.away?.name||'Away')}</strong></div>
    </div>
    <footer>
      <em class="status-badge ${stateClass(label)}">${esc(label)}</em>
      <div><small>${isFinalBanker(f)?'FINAL BANKER':a?.banker?'QUALIFIED CANDIDATE':'ENGINE'}</small><strong>${esc(pick)}</strong></div>
      <i>${scoreText(r.score)}</i>
    </footer>
  </button>`;
}

function setScopeButtons(){
  $$('#scopeTabs [data-scope]').forEach(x=>x.classList.toggle('active',x.dataset.scope===S.scope));
}

function renderMatches(){
  const base=baseFiltered(),finalIds=finalBankerIds();
  const otherBase=base.filter(f=>!finalIds.has(String(f.id)));
  const candidates=otherBase.filter(f=>S.map.get(String(f.id))?.banker)
    .sort((a,b)=>Number(S.map.get(String(b.id))?.finalRecommendation?.score||0)-Number(S.map.get(String(a.id))?.finalRecommendation?.score||0)||kickMs(a)-kickMs(b));
  const analysing=otherBase.filter(f=>{const a=S.map.get(String(f.id));return !a||a.waiting;}).sort((a,b)=>kickMs(a)-kickMs(b));
  const all=otherBase.slice().sort((a,b)=>kickMs(a)-kickMs(b));

  $('#candidateCount').textContent=candidates.length;
  $('#analysingCount').textContent=analysing.length;
  $('#allCount').textContent=all.length;

  const finalVisible=base.filter(f=>finalIds.has(String(f.id))).length;
  $('#boardSummary').textContent=`${finalVisible} final banker${finalVisible===1?'':'s'} pinned above · ${candidates.length} other 7/10+ candidate${candidates.length===1?'':'s'} · ${all.length} other fixture${all.length===1?'':'s'}.`;
  $('#matchCentreToggle').textContent=S.centreOpen?`Hide Match Centre ↑`:`Browse ${all.length} other match${all.length===1?'':'es'} ↓`;
  $('#centreBody').hidden=!S.centreOpen;

  if(!S.centreOpen){
    $('#matches').innerHTML='';
    $('#pagination').hidden=true;
    return;
  }

  let rows=S.scope==='CANDIDATES'?candidates:S.scope==='ANALYSING'?analysing:all;
  const pages=Math.max(1,Math.ceil(rows.length/S.pageSize));
  S.page=Math.min(Math.max(1,S.page),pages);
  const start=(S.page-1)*S.pageSize;
  const pageRows=rows.slice(start,start+S.pageSize);

  $('#matches').innerHTML=pageRows.length?pageRows.map(renderMatch).join(''):`<div class="empty">${S.scope==='CANDIDATES'?'No extra qualified candidates match these filters.':S.scope==='ANALYSING'?'No fixtures are currently waiting for analysis.':'No matches match this view.'}</div>`;
  $$('.match').forEach(b=>b.onclick=()=>open(b.dataset.id));

  const pagination=$('#pagination');
  pagination.hidden=rows.length<=S.pageSize;
  $('#pageInfo').textContent=`Page ${S.page} of ${pages} · ${rows.length} match${rows.length===1?'':'es'}`;
  $('#pagePrev').disabled=S.page<=1;
  $('#pageNext').disabled=S.page>=pages;
}

function render(){
  S.map=new Map((S.g?.all||[]).map(x=>[String(x.fixture?.id),x.analysis]));
  const p=S.g?.progress||{};
  $('#progress').textContent=`${p.processed||0}/${p.total||0}`;
  $('#progressText').textContent=S.g?.complete?'Complete':`${p.percent||0}% analysed`;
  $('#state').textContent=S.g?.complete
    ? `Complete · ${S.g.topBankers?.length||0} final bankers`
    : `Analysing ${p.processed||0}/${p.total||0} fixtures · final bankers stay pinned`;
  updateLeagueFilter();
  renderTop();
  renderMatches();
}

function metric(label,value){return `<span><small>${esc(label)}</small><b>${esc(value)}</b></span>`;}

function evidenceTable(rows,title){
  const safe=Array.isArray(rows)?rows:[];
  return `<section class="evidence-block"><div class="section-title"><h3>${esc(title)}</h3><span>Exactly ${safe.length}/5</span></div><div class="evidence-list">${safe.map(r=>`
    <div class="evidence-row">
      <time>${esc(shortDate(r.date))}</time>
      <span>${esc(r.homeTeam||'Home')} <b>${esc(r.homeGoals??'—')}–${esc(r.awayGoals??'—')}</b> ${esc(r.awayTeam||'Away')}</span>
      <em class="result-${String(r.result||'').toLowerCase()}">${esc(r.result||'—')}</em>
    </div>`).join('')||'<div class="empty compact">Exact match evidence is not available in this saved snapshot yet.</div>'}</div></section>`;
}

function marketCard(name,m){
  if(!m) return `<article><small>${esc(name)}</small><b>—</b><p>Waiting for data.</p></article>`;
  const reasons=(m.reasons||[]).slice(0,3);
  return `<article class="market-score-card"><small>${esc(name)}</small><b>${scoreText(m.score)}</b><em>${esc(m.verdict||'')}</em>${reasons.length?`<ul>${reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</article>`;
}

function open(id){
  const f=S.fixtures.find(x=>String(x.id)===String(id)),a=S.map.get(String(id));
  if(!f)return;
  let html=`<div class="detail-hero"><div>${crest(f.home,'detail-crest')}<h2>${esc(f.home?.name||'Home')}</h2><small>HOME</small></div><span><b>${esc(time(f.kickoff))}</b><em>${esc(f.league?.name||'League')}</em></span><div>${crest(f.away,'detail-crest')}<h2>${esc(f.away?.name||'Away')}</h2><small>AWAY</small></div></div>`;

  if(!a||a.waiting){
    html+=`<div class="empty detail-wait">${esc(a?.warning||'Still analysing. Golden Banker will not score this fixture until both exact 5-match venue samples are available.')}</div>`;
  }else{
    const h=a.split.home,w=a.split.away,r=a.finalRecommendation||{};
    html+=`<div class="decision"><div><small>PRIMARY RECOMMENDATION</small><b>${esc(r.primaryBet)}</b><span>${esc(r.confidence)} confidence</span></div><strong>${scoreText(r.score)}</strong></div>`;
    html+=`<div class="split-stat-grid">
      <article><div class="section-title"><h3>${esc(a.homeTeam)} · last 5 HOME</h3><span>5/5 verified</span></div><div class="metric-grid">${metric('PPG',h.ppg)}${metric('Avg GF',h.avgGF)}${metric('Avg GA',h.avgGA)}${metric('Scored',pct(h.scoreRate))}${metric('Conceded',pct(h.concedeRate))}${metric('O2.5',pct(h.over25Rate))}${metric('BTTS',pct(h.bttsRate))}${metric('Record',`${h.wins}W ${h.draws}D ${h.losses}L`)}</div></article>
      <article><div class="section-title"><h3>${esc(a.awayTeam)} · last 5 AWAY</h3><span>5/5 verified</span></div><div class="metric-grid">${metric('PPG',w.ppg)}${metric('Avg GF',w.avgGF)}${metric('Avg GA',w.avgGA)}${metric('Scored',pct(w.scoreRate))}${metric('Conceded',pct(w.concedeRate))}${metric('O2.5',pct(w.over25Rate))}${metric('BTTS',pct(w.bttsRate))}${metric('Record',`${w.wins}W ${w.draws}D ${w.losses}L`)}</div></article>
    </div>`;
    html+=`<section class="market-breakdown"><div class="section-title"><h3>Three-system scorecard</h3><span>Banker gate ≥7/10</span></div><div class="scores">${marketCard('Over 2.5',a.markets.over25)}${marketCard('BTTS / GG',a.markets.btts)}${marketCard('Win / DNB',a.markets.winDnb)}</div></section>`;
    html+=evidenceTable(a.evidence?.homeLast5,`${a.homeTeam} — exact home results`);
    html+=evidenceTable(a.evidence?.awayLast5,`${a.awayTeam} — exact away results`);
    html+=`<section class="why-section"><div class="section-title"><h3>Why this pick</h3><span>${esc(stateFor(f,a))}</span></div><p>${esc(r.summary||'No summary available.')}</p></section>`;
  }
  $('#detailBody').innerHTML=html;
  $('#detail').showModal();
}

function resetCentre(){
  S.centreOpen=false;
  S.scope='CANDIDATES';
  S.page=1;
  setScopeButtons();
  $('#centreBody').hidden=true;
}

async function load(date=S.date){
  clearTimeout(S.timer);
  S.date=date;
  resetCentre();
  days();
  $('#title').textContent=new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
  $('#state').textContent=S.fixtures.length?'Refreshing while keeping the last good board visible…':'Loading fixtures…';
  try{
    const [f,g]=await Promise.all([api(`/api/fixtures?date=${date}`),api(`/api/golden-banker?date=${date}`)]);
    S.fixtures=f.fixtures||[]; S.g=g; render();
    if(!g.complete&&!g.historicalLock)poll();
  }catch(e){
    $('#state').textContent=`Refresh failed · keeping last good board · ${e.message}`;
  }
}

function poll(){
  clearTimeout(S.timer);
  S.timer=setTimeout(async()=>{
    try{S.g=await api(`/api/golden-banker?date=${S.date}`);render();}catch{}
    if(!S.g?.complete)poll();
  },3500);
}

$('#refresh').onclick=()=>load();
['#status','#market','#confidence','#league'].forEach(id=>$(id).onchange=()=>{S.page=1;renderMatches();});
$('#search').oninput=()=>{S.page=1;renderMatches();};
$('#scopeTabs').onclick=e=>{
  const b=e.target.closest('[data-scope]'); if(!b)return;
  S.scope=b.dataset.scope; S.page=1;
  setScopeButtons();
  renderMatches();
};
$('#matchCentreToggle').onclick=()=>{S.centreOpen=!S.centreOpen;S.page=1;renderMatches();};
$('#pagePrev').onclick=()=>{if(S.page>1){S.page--;renderMatches();$('#centreBody').scrollIntoView({behavior:'smooth',block:'start'});}};
$('#pageNext').onclick=()=>{S.page++;renderMatches();$('#centreBody').scrollIntoView({behavior:'smooth',block:'start'});};
$('#close').onclick=()=>$('#detail').close();
$('#detail').onclick=e=>{if(e.target===$('#detail'))$('#detail').close();};

days();
load();
