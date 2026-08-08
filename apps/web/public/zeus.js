import { dataBackedButton } from './data-backed-ui.js';
import { fetchJson, mergeProgressiveBoard } from './api-client.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0,10);
let payload = null, timer = null, version = 0, polls = 0;
$('#zeusDate').value = today;
$('#zeusRefresh').addEventListener('click',()=>load());
$('#zeusDate').addEventListener('change',()=>load());
$('#zeusDecisionFilter').addEventListener('change',render);

function kickoff(value){const d=new Date(value);return Number.isNaN(d.getTime())?'Kickoff TBA':d.toLocaleString([],{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function schedule(date,v){clearTimeout(timer);timer=setTimeout(()=>{if(v===version&&($('#zeusDate').value||today)===date)load({silent:true});},polls++<18?1800:5000);}

async function load({silent=false}={}){
 const date=$('#zeusDate').value||today,v=++version;clearTimeout(timer);if(!silent){polls=0;$('#zeusGrid').innerHTML='<div class="route-empty zeus-soft-pulse"><span class="zeus-loader"></span><h3>Zeus is assembling the statistical picture…</h3><p>Completed evidence appears while the seven underlying engines and Stats API finish.</p></div>';}
 try{const data=await fetchJson(`/api/zeus-board?date=${encodeURIComponent(date)}`);if(v!==version)return;payload=mergeProgressiveBoard(payload,data);$('#zeusFixtures').textContent=payload.summary?.fixtures||0;$('#zeusAnalysed').textContent=payload.summary?.analysed||0;$('#zeusApproved').textContent=payload.summary?.approved||0;$('#zeusVeto').textContent=(payload.summary?.veto||0)+(payload.summary?.noEdge||0);render();if(!payload.complete&&!payload.failed)schedule(date,v);}catch(error){if(v!==version)return;if(error?.transient||error?.name==='AbortError'){if(payload?.qualified?.length){render();schedule(date,v);return}$('#zeusGrid').innerHTML='<div class="route-empty zeus-soft-pulse"><span class="zeus-loader"></span><h3>Zeus service is recovering…</h3><p>A temporary gateway delay was detected. Completed evidence is preserved and supervision will retry automatically.</p></div>';schedule(date,v);return;}$('#zeusGrid').innerHTML=`<div class="route-empty"><h3>Zeus could not complete supervision</h3><p>${esc(error.message||'Try again.')}</p></div>`;}
}

function badge(decision){const d=String(decision||'').toUpperCase();if(d==='FIRE')return'APPROVED';if(d==='SAFER')return'SAFER';if(d==='VETO'||d==='STAT_CONFLICT')return'VETO';if(d==='WAITING')return'WAITING';return'NO CLEAR EDGE';}
function evidenceRows(candidate){return (candidate?.evidence||[]).filter(x=>x.available).sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,6).map(x=>`<div class="zeus-evidence"><span>${Number(x.score||0)>=62?'✓':'·'}</span><div><b>${esc(x.label)}</b><small>${esc(x.detail)}</small></div><strong>${Math.round(Number(x.score||0))}</strong></div>`).join('');}
function contradictionRows(engine){const rows=engine?.contradictions||[];return rows.length?`<div class="zeus-contradictions">${rows.slice(0,4).map(x=>`<p class="${String(x.level||'').toLowerCase()}"><b>${esc(x.level)}</b> ${esc(x.label)} · ${esc(x.detail)}</p>`).join('')}</div>`:'<div class="zeus-clean">✓ No material contradiction detected on the leading route.</div>';}

function render(){if(!payload)return;const filter=$('#zeusDecisionFilter').value;let rows=(payload.all||[]).filter(item=>{const d=String(item?.engine?.decision||'NO_CLEAR_EDGE').toUpperCase();return filter==='ALL'||d===filter||(filter==='VETO'&&['VETO','STAT_CONFLICT'].includes(d));});rows.sort((a,b)=>Number(b.engine?.confidence||0)-Number(a.engine?.confidence||0)||new Date(a.fixture?.kickoff||0)-new Date(b.fixture?.kickoff||0));if(!rows.length){$('#zeusGrid').innerHTML=payload.complete?'<div class="route-empty"><h3>No Zeus results match this filter</h3><p>Try another decision filter.</p></div>':'<div class="route-empty zeus-soft-pulse"><span class="zeus-loader"></span><h3>Supervision in progress…</h3><p>The page updates as underlying statistics complete.</p></div>';return;}
 const progress=!payload.complete?`<div class="route-progress zeus-progress">Zeus supervision · ${Number(payload.progress?.processed||0)}/${Number(payload.progress?.total||0)} statistical candidates processed</div>`:'';
 $('#zeusGrid').innerHTML=progress+rows.map((item,i)=>{const f=item.fixture||{},e=item.engine||{},s=e.selection||{},candidate=(e.candidates||[]).find(x=>x.id===s.routeId)||[...(e.candidates||[])].sort((a,b)=>Number(b.confidence||0)-Number(a.confidence||0))[0]||{};const verdict=e.supervisor?.verdict||'HOLD';return `<article class="route-pick-card zeus-card zeus-reveal" style="--reveal-index:${i}">
  <div class="route-pick-head"><div><small>${esc(f.league?.country||'International')} · ${esc(f.league?.name||'League')} · ${esc(kickoff(f.kickoff))}</small><h2>${esc(f.home?.name)} vs ${esc(f.away?.name)}</h2></div><span class="zeus-verdict ${String(verdict).toLowerCase()}">${esc(badge(e.decision))}</span></div>
  <div class="zeus-meters"><div><small>ZEUS CONFIDENCE</small><strong>${Math.round(Number(e.confidence||0))}<i>/100</i></strong></div><div><small>DATA QUALITY</small><strong>${Math.round(Number(e.dataQuality||0))}<i>/100</i></strong></div><div><small>DOMINANT DIRECTION</small><b>${esc(String(e.dominantDirection||'NO CLEAR EDGE').replaceAll('_',' '))}</b></div><div><small>EVIDENCE FAMILIES</small><b>${Number(e.evidenceFamilies?.length||s.evidenceFamilies||0)}</b></div></div>
  ${s.market?`<div class="route-market zeus-market"><span><small>ZEUS APPROVED DIRECTION</small><b>${esc(s.label||s.market)}</b></span><strong>${odd(s.odds)}</strong></div>`:`<div class="zeus-hold-copy"><b>${esc(e.supervisor?.reason||'No clear statistical edge.')}</b></div>`}
  ${s.market?dataBackedButton(e.dataValidation || s.dataValidation):''}
  <div class="zeus-card-grid"><section><h3>Strongest evidence</h3>${evidenceRows(candidate)||'<div class="muted">Evidence is still building.</div>'}</section><section><h3>Contradiction control</h3>${contradictionRows(e)}</section></div>
  <p class="muted">${esc(e.explanation||'')}</p>
 </article>`;}).join('');window.dispatchEvent(new CustomEvent('betynz:content-rendered'));
}
load();
