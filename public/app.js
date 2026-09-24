const $=id=>document.getElementById(id);
const state={index:null,board:null,date:null,request:0};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>Number.isFinite(v)?`${(v*100).toFixed(1)}%`:'—';
const signed=v=>`${v>=0?'+':''}${(v*100).toFixed(1)}%`;
const localTime=v=>new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
const utcDay=()=>new Date().toISOString().slice(0,10);
async function get(path) {const response=await fetch(`${path}?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error(`Data request failed (${response.status})`);return response.json();}
function crest(t) {
  let safe=null;try{const url=new URL(t.logo);if(url.protocol==='https:')safe=url.href;}catch{}
  const initial=esc(t.name?.slice(0,2).toUpperCase());
  return safe?`<img class="crest" src="${esc(safe)}" alt="" loading="lazy" data-initial="${initial}">`:`<span class="crest initial" aria-hidden="true">${initial}</span>`;
}
function teams(m) {return `<div class="teams">${['home','away'].map(side=>`<div class="team">${crest(m[side])}<span>${esc(m[side].name)} ${m.standings?.[side]?`<small class="rank">#${m.standings[side]}</small>`:''}</span></div>`).join('')}</div>`;}
function effective(m) {
  if(!m.tip)return m;
  if(Date.parse(m.kickoff)<=Date.now())return {...m,tip:null,status:'skipped',reasons:['Match has started; the pre-match tip is no longer active.']};
  const age=Date.now()-Date.parse(m.oddsFetchedAt),max=state.board.policy?.maximumOddsAgeMinutes||90;
  if(!Number.isFinite(age)||age>max*60000)return {...m,tip:null,status:'skipped',reasons:['Odds snapshot has expired. Waiting for a fresh Sportybet scan.']};
  return m;
}
function detail(m) {
  const p=m.tip,form=m.form||{};
  return `<details><summary>Why this pick · compare markets & risk</summary><div class="analysis">
    <ul>${m.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
    <div class="form-grid">${['home','away'].map(s=>`<div><h3>${esc(m[s].name)} · ${s} form</h3><div class="form-line">${(form[s]?.form||[]).map(v=>`<span class="form-letter ${esc(v)}">${esc(v)}</span>`).join('')}</div><p>Most recent first · ${form[s]?.games||0} games</p></div>`).join('')}</div>
    ${m.h2h?.games?`<h3>H2H advanced</h3><p>${m.h2h.games} meetings · ${m.h2h.sameVenue} in the same venue arrangement. Both teams scored in ${pct(m.h2h.bttsRate)}; over 2.5 goals occurred in ${pct(m.h2h.over25Rate)}. Half-time leads were held in ${pct(m.h2h.leadHoldRate)} of cases, with ${m.h2h.reversals} full reversals across ${m.h2h.halfTimeGames} known half-time results.</p><p>Home-perspective HT/FT paths: ${Object.entries(m.h2h.htftCounts||{}).map(([k,v])=>`${esc(k)}: ${v}`).join(' · ')}. H = home, A = away, D = draw.</p>`:''}
    <h3>Probability, value & uncertainty</h3><p>Estimated chance of a positive return: <b>${pct(p.probability)}</b>. Estimated chance of losing money: <b>${pct(p.lossProbability)}</b>. Push probability: <b>${pct(p.push)}</b>. Estimated return per unit staked: <b class="${p.expectedReturn<0?'negative':'positive'}">${signed(p.expectedReturn)}</b>.</p>
    <p>Sampling range: ${pct(p.probabilityRange[0])}–${pct(p.probabilityRange[1])}; ${p.sampleCount} usable historical matches. ${esc(p.method)}. Risk factors: ${esc(p.risk.factors.join('; ')||'Normal model and match uncertainty')}.</p>
    <h3>Best candidate in each market category</h3><div class="table-wrap"><table><thead><tr><th>Market & selection</th><th>Odds</th><th>Model chance</th><th>Loss chance</th><th>Est. return</th></tr></thead><tbody>${m.categoryTips.map(c=>`<tr><td><b>${esc(c.selection)}</b><small>${esc(c.market)} ${esc(c.specifier)}</small></td><td>${c.odds.toFixed(2)}</td><td>${pct(c.probability)}</td><td>${pct(c.lossProbability)}</td><td class="${c.expectedReturn<0?'negative':'positive'}">${signed(c.expectedReturn)}</td></tr>`).join('')}</tbody></table></div>
    ${p.scenarios?.length?`<h3>What happens if the match goes wrong?</h3><div class="scenario-grid">${p.scenarios.map(s=>`<div class="scenario"><span>${esc(s.label)}</span><strong>${pct(s.survivalProbability)}</strong><small>Conditional chance of avoiding a loss · scenario chance ${pct(s.scenarioProbability)}</small></div>`).join('')}</div>`:''}
    <h3>League & market coverage</h3><p>${m.coverage?.markets||0} markets fetched; ${m.coverage?.underCap||0} outcomes at 1.50 or lower. League stability checked against ${m.leagueReliability?.forecastChecks||0} historical forecasts. Observed upset rate: ${pct(m.leagueReliability?.upsetRate)}.</p>
    ${m.excludedMarkets?.length?`<details><summary>${m.excludedMarkets.length} market outcomes excluded from analysis</summary><ul>${m.excludedMarkets.map(c=>`<li>${esc(c.market)} — ${esc(c.selection)} (${c.odds.toFixed(2)}): ${esc(c.reason)}</li>`).join('')}</ul></details>`:''}
    <p class="analysis-note">${esc(m.probabilityNotice)} Half-win and half-loss settlement is included for supported Asian lines. Sportybet odds checked ${esc(new Date(m.oddsFetchedAt).toLocaleString())}.</p>
  </div></details>`;
}
function matchCard(m) {
  const p=m.tip;
  return `<article class="match ${p?'':'skipped'}"><div class="match-top"><span class="competition">${esc(m.league.country)} · ${esc(m.league.name)}</span><span>${esc(localTime(m.kickoff))}${m.gate?.mismatch?' · Mismatch':''}</span></div><div class="match-body">${teams(m)}${p?`<div class="pick"><span class="label">FINAL PICK <span class="price">${p.odds.toFixed(2)}</span></span><div class="selection">${esc(p.selection)}</div><span class="market-name">${esc(p.market)} ${esc(p.specifier)}</span></div><div class="stats"><div class="chance"><strong>${pct(p.probability)}</strong><span>MODEL CHANCE</span></div><div><span class="risk ${p.risk.label.toLowerCase()}">${esc(p.risk.label)} risk</span><span class="risk-score">${p.risk.score}/100 risk score</span></div></div>`:`<div class="skipped-reason"><span class="label">EXCLUDED</span><br>${m.reasons.map(esc).join('<br>')}</div>`}</div>${p?detail(m):''}</article>`;
}
function render() {
  if(!state.board)return;
  const all=state.board.matches.map(effective),search=$('search').value.toLowerCase(),league=$('league').value,market=$('market').value,skipped=$('show-skipped').checked;
  const matches=all.filter(m=>(m.tip||skipped)&&(!league||m.league.id===league)&&(!market||m.tip?.category===market)&&(!search||`${m.home.name} ${m.away.name} ${m.league.name}`.toLowerCase().includes(search)));
  const sort=$('sort').value;
  matches.sort((a,b)=>sort==='kickoff'?Date.parse(a.kickoff)-Date.parse(b.kickoff):sort==='risk'?(a.tip?.risk.score??100)-(b.tip?.risk.score??100):sort==='value'?(b.tip?.expectedReturn??-9)-(a.tip?.expectedReturn??-9):(b.tip?.probability??-1)-(a.tip?.probability??-1));
  $('result-count').textContent=`${matches.length} shown · ${all.filter(m=>m.tip).length} active picks`;
  if(matches.length)$('board').innerHTML=matches.map(matchCard).join('');
  else {
    const unavailable=['unavailable','pending'].includes(state.board.status),filtered=Boolean(search||league||market);
    $('board').innerHTML=`<div class="empty"><h3>${unavailable?'Waiting for verified data':filtered?'No matches for these filters':'No matches qualify right now'}</h3><p>${unavailable?'The current Sportybet feed is unavailable or the first scan has not completed. The board will populate after a successful refresh.':filtered?'Change the team, league or market filters to see more matches.':'Matches must pass the odds, standings, form and league checks. Open excluded matches to see the reasons.'}</p><button id="empty-action">${filtered?'Clear filters':unavailable?'Check again':'View excluded matches'}</button></div>`;
    $('empty-action').onclick=()=>{if(filtered){$('search').value='';$('league').value='';$('market').value='';render();}else if(unavailable)load();else{$('show-skipped').checked=true;render();}};
  }
  document.querySelectorAll('img.crest').forEach(img=>{img.onerror=()=>{const node=document.createElement('span');node.className='crest initial';node.textContent=img.dataset.initial;node.setAttribute('aria-hidden','true');img.replaceWith(node);};});
}
async function selectDate(date) {
  const request=++state.request;state.date=date;
  document.querySelectorAll('#dates button').forEach(b=>{b.classList.toggle('active',b.dataset.date===date);b.setAttribute('aria-pressed',String(b.dataset.date===date));});
  $('board').innerHTML='<div class="empty"><div class="loading-ring"></div><h3>Loading matches…</h3></div>';
  try {
    const board=await get(`./data/board-${date}.json`);if(request!==state.request)return;
    if(!Array.isArray(board.matches))throw new Error('The board data is incomplete');
    state.board=board;
    $('statistics-source').textContent=`Statistics: ${board.statisticsSource||'Awaiting data'}`;
    const warnings=[...(board.diagnostics||[])];
    if(board.generatedAt&&Date.now()-Date.parse(board.generatedAt)>90*60000)warnings.unshift('This board is older than 90 minutes. Expired odds and started matches are excluded.');
    if(board.busyDay)warnings.unshift(`${board.leagueCount} leagues on this date: only clear table and form mismatches can qualify.`);
    $('notice').hidden=!warnings.length;$('notice').textContent=warnings.slice(0,3).join(' · ');
    $('updated').textContent=board.generatedAt?`Updated ${new Date(board.generatedAt).toLocaleString()}`:'Awaiting first scan';
    const summary=board.summary||{};
    $('metrics').innerHTML=[[summary.fixtures||0,'Fixtures scanned'],[board.matches.filter(m=>effective(m).tip).length,'Active selections'],[summary.markets||0,'Markets collected'],[board.leagueCount||0,board.busyDay?'Leagues · mismatch mode':'Leagues today']].map(([v,label])=>`<div class="metric"><strong>${Number(v).toLocaleString()}</strong><span>${esc(label)}</span></div>`).join('');
    const leagues=new Map(board.matches.map(m=>[m.league.id,m.league.name]));
    $('league').innerHTML='<option value="">All leagues</option>'+[...leagues].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
    const markets=new Map(board.matches.filter(m=>m.tip).map(m=>[m.tip.category,m.tip.market]));
    $('market').innerHTML='<option value="">All final markets</option>'+[...markets].map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
    $('market-download').hidden=board.status==='pending';$('market-download').href=`./data/markets-${date}.json`;
    const fresh=board.generatedAt&&Date.now()-Date.parse(board.generatedAt)<90*60000;
    $('source-status').textContent=board.status==='ready'&&fresh?'Sportybet snapshot':board.status==='partial'?'Partial scan':'Feed unavailable';$('source-status').classList.toggle('live',board.status==='ready'&&fresh);
    render();
  }catch(e){if(request!==state.request)return;state.board=null;$('board').innerHTML=`<div class="empty"><h3>Unable to load this board</h3><p>${esc(e.message)}</p><button id="retry-date">Try again</button></div>`;$('retry-date').onclick=()=>selectDate(date);$('source-status').textContent='Feed unavailable';$('source-status').classList.remove('live');}
}
async function load() {
  $('refresh').disabled=true;
  try {
    state.index=await get('./data/index.json');
    const days=state.index.dates||[];if(!days.length)throw new Error('No dates have been published yet');
    $('dates').innerHTML=days.map(d=>`<button data-date="${esc(d.date)}">${d.date===utcDay()?'Today':new Date(`${d.date}T12:00:00Z`).toLocaleDateString([],{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})}<small>${d.qualified||0} picks</small></button>`).join('');
    document.querySelectorAll('#dates button').forEach(b=>b.onclick=()=>selectDate(b.dataset.date));
    await selectDate(days.some(d=>d.date===state.date)?state.date:days.find(d=>d.date===utcDay())?.date||days[0].date);
  }catch(e){$('notice').hidden=false;$('notice').textContent=`The board could not be loaded: ${e.message}. Use Refresh to try again.`;$('source-status').textContent='Feed unavailable';$('board').innerHTML='<div class="empty"><h3>The board is temporarily unavailable</h3><p>Please refresh in a moment.</p></div>';}
  finally{$('refresh').disabled=false;}
}
for(const id of ['search','league','market','sort','show-skipped'])$(id).addEventListener(id==='search'?'input':'change',render);
$('refresh').onclick=load;
setInterval(render,60000);setInterval(()=>{if(!document.hidden)load();},5*60000);
load();
