const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = new Date().toISOString().slice(0,10);
$('#opsDate').value = today;
let refreshTimer = null;

function dateTime(value){
  if(!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function age(value){
  const ms = Date.now() - new Date(value || 0).getTime();
  if(!Number.isFinite(ms)) return '—';
  if(ms < 60_000) return `${Math.max(0,Math.round(ms/1000))}s ago`;
  if(ms < 3_600_000) return `${Math.round(ms/60_000)}m ago`;
  return `${Math.round(ms/3_600_000)}h ago`;
}
function stateClass(value){
  const s=String(value||'').toUpperCase();
  if(['READY','COMPLETE','WON'].includes(s)) return 'ok';
  if(['ERROR','FAILED','LOST'].includes(s)) return 'bad';
  if(['RUNNING','RETRYING','PARTIAL','LOCKED'].includes(s)) return 'warn';
  return '';
}
async function auth(){
  const r=await fetch('/api/auth/me',{cache:'no-store'});
  if(r.status===401){location.href=`/admin-login.html?next=${encodeURIComponent('/admin-operations.html')}`;return false}
  return r.ok;
}
function render(data){
  const p=data.persistence||{};
  const rows=p.fixtureRows||[];
  const states=p.fixtureStates||{};
  const ready=Number(states.READY||0);
  const total=Math.max(rows.length,ready);
  const remaining=Math.max(0,total-ready);
  const locks=p.locks||[];
  const activeLocks=locks.filter(row=>new Date(row.lease_until||row.leaseUntil||0).getTime()>Date.now());
  const jobs=p.jobs||[];
  const runningJobs=jobs.filter(row=>['RUNNING','RETRYING','PARTIAL'].includes(String(row.state||'').toUpperCase()));
  const api=data.providers?.apiFootball||{};
  const memory=data.runtime||{};
  const ledger=p.ledger||[];
  const supabase=Boolean(p.supabase);
  const databaseReady=Boolean(p.databaseReady);

  $('#opsBanner').className=`operations-banner ${databaseReady?'ok':'warn'}`;
  $('#opsBanner').innerHTML=databaseReady
    ? `<b>Persistence Core online.</b> Fixture progress, job state and firing history are backed by Supabase. Worker: <code>${esc(p.instanceId||'—')}</code>`
    : supabase
      ? `<b>Supabase is connected but the v5.2.0 persistence migration is not ready.</b> Run <code>019_persistence_core.sql</code>. Betynz will use safe local fallback until then.`
      : `<b>Persistence Core is in local fallback mode.</b> Configure Supabase and apply <code>019_persistence_core.sql</code> to survive Render restarts.`;

  $('#opsKpis').innerHTML=`
    <article><strong>${ready}</strong><span>Saved fixtures</span></article>
    <article><strong>${remaining}</strong><span>Remaining</span></article>
    <article><strong>${activeLocks.length}</strong><span>Active leases</span></article>
    <article><strong>${runningJobs.length}</strong><span>Running/retrying jobs</span></article>
    <article><strong>${Number(api.queued||api.queueDepth||0)}</strong><span>API-Football queued</span></article>
    <article><strong>${ledger.length}</strong><span>Recent ledger entries</span></article>`;

  const pct=total?Math.min(100,Math.round(ready/total*100)):0;
  $('#fixtureProgressBar').style.width=`${pct}%`;
  $('#fixtureProgressText').textContent=total?`${ready} / ${total} durable · ${pct}%`:'No fixture checkpoints for this date yet';
  $('#fixtureState').textContent=`${Object.keys(states).length} states`;
  $('#fixtureStates').innerHTML=Object.entries(states).length
    ? Object.entries(states).map(([key,value])=>`<div><b class="${stateClass(key)}">${esc(key)}</b><strong>${value}</strong></div>`).join('')
    : '<div><b>PENDING</b><strong>0</strong></div>';

  const stats=data.providers?.statsApi||{};
  $('#runtimeState').textContent=`up ${Math.round(Number(memory.uptimeSeconds||0)/60)}m`;
  $('#providerMetrics').innerHTML=`
    <div><span>API-Football cooldown</span><b class="${api.coolingDown?'warn':'ok'}">${api.coolingDown?'ACTIVE':'CLEAR'}</b></div>
    <div><span>API-Football retry</span><b>${api.retryInMs?`${Math.ceil(api.retryInMs/1000)}s`:'—'}</b></div>
    <div><span>API-Football queue</span><b>${Number(api.queued||api.queueDepth||0)}</b></div>
    <div><span>Stats API cooldown</span><b class="${stats.coolingDown?'warn':'ok'}">${stats.coolingDown?'ACTIVE':'CLEAR'}</b></div>
    <div><span>Heap used</span><b>${memory.heapUsedMb??'—'} MB</b></div>
    <div><span>RSS</span><b>${memory.rssMb??'—'} MB</b></div>
    <div><span>Last persistence write</span><b>${age(p.lastWriteAt)}</b></div>
    <div><span>Restored fixtures this process</span><b>${Number(p.restoredFixtures||0)}</b></div>`;

  $('#lockCount').textContent=`${activeLocks.length} active · ${locks.length} recorded`;
  $('#locksTable').innerHTML=locks.length?locks.map(row=>`<tr><td><code>${esc(row.lock_key||row.lockKey)}</code></td><td>${esc(row.owner||'—')}</td><td>${dateTime(row.lease_until||row.leaseUntil)}</td><td>${age(row.updated_at||row.updatedAt)}</td></tr>`).join(''):'<tr><td colspan="4">No active or recent leases.</td></tr>';

  $('#jobCount').textContent=`${jobs.length} recent jobs`;
  $('#jobsTable').innerHTML=jobs.length?jobs.map(row=>{
    const done=Number(row.completed_count||0), total=Number(row.total||0), progress=total?`${done}/${total}`:'—';
    return `<tr><td><code>${esc(row.job_key)}</code></td><td><b class="${stateClass(row.state)}">${esc(row.state||'—')}</b></td><td>${esc(row.phase||'—')}</td><td>${progress}</td><td>${age(row.updated_at)}</td></tr>`;
  }).join(''):'<tr><td colspan="5">No persistent jobs recorded yet.</td></tr>';

  const week=data.weeklyPrecompute||{};
  const dates=week.dates||{};
  $('#weekState').textContent=`${week.processed||0}/${week.total||0} · ${week.phase||'IDLE'}`;
  $('#weekGrid').innerHTML=Object.keys(dates).length?Object.entries(dates).map(([date,row])=>`<article><small>${esc(date)}</small><b class="${stateClass(row.state)}">${esc(row.state||'—')}</b><span>${row.fixtures!=null?`${row.fixtures} fixtures`:row.resumed?'restored checkpoint':row.skipped?'already ready':'—'}</span></article>`).join(''):'<article><small>No dates</small><b>IDLE</b><span>Scheduler has not published a date yet.</span></article>';

  $('#ledgerCount').textContent=`${ledger.length} recent entries`;
  $('#ledgerTable').innerHTML=ledger.length?ledger.map(row=>`<tr><td>${dateTime(row.first_fired_at||row.last_seen_at)}</td><td><b>${esc(row.home_team||'')}</b> vs <b>${esc(row.away_team||'')}</b><br><small>${esc(row.league_name||'')}</small></td><td>${esc(row.engine||'—')}</td><td>${esc(row.selection_label||row.market||'—')}</td><td>${Number(row.odds||0)>1?Number(row.odds).toFixed(2):'—'}</td><td><b class="${stateClass(row.settlement_status)}">${esc(row.settlement_status||'PENDING')}</b></td></tr>`).join(''):'<tr><td colspan="6">No ledger entries for this window yet.</td></tr>';
}

async function load(){
  if(!await auth()) return;
  const date=$('#opsDate').value||today;
  $('#opsRefresh').disabled=true;
  try{
    const r=await fetch(`/api/admin/operations?date=${encodeURIComponent(date)}`,{cache:'no-store'});
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||'Operations status unavailable');
    render(data);
  }catch(error){
    $('#opsBanner').className='operations-banner bad';
    $('#opsBanner').textContent=error.message;
  }finally{$('#opsRefresh').disabled=false}
}
async function action(path,body){
  const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||'Action failed');
  $('#opsBanner').className='operations-banner ok';
  $('#opsBanner').textContent=`Accepted: ${data.action||'operation'}${data.date?` · ${data.date}`:''}`;
  setTimeout(load,1200);
}
$('#opsRefresh').addEventListener('click',load);
$('#opsDate').addEventListener('change',load);
$('#refreshDate').addEventListener('click',()=>action('/api/admin/operations/refresh-date',{date:$('#opsDate').value}).catch(e=>alert(e.message)));
$('#retryFailed').addEventListener('click',()=>action('/api/admin/operations/retry-failed',{date:$('#opsDate').value}).catch(e=>alert(e.message)));
$('#recomputeFixture').addEventListener('click',()=>{
  const fixtureId=$('#recomputeFixtureId').value.trim();
  if(!fixtureId) return;
  action('/api/admin/operations/recompute-fixture',{date:$('#opsDate').value,fixtureId}).catch(e=>alert(e.message));
});
load();
refreshTimer=setInterval(load,20_000);
window.addEventListener('beforeunload',()=>clearInterval(refreshTimer));
