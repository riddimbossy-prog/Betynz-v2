const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[c]));
const iso=d=>d.toISOString().slice(0,10);
const today=new Date(),fromDate=new Date(Date.now()-14*86400000);
$('#to').value=iso(today);$('#from').value=iso(fromDate);
function resultClass(v){return String(v||'PENDING').toLowerCase()}
function renderSummary(s={}){
  const accuracy=s.accuracy==null?'—':`${s.accuracy}%`;
  $('#summary').innerHTML=[['Published',s.published??0],['Settled',s.settled??0],['Wins',s.wins??0],['Losses',s.losses??0],['Pushes',s.pushes??0],['Win rate',accuracy]].map(([k,v])=>`<article><small>${esc(k)}</small><strong>${esc(v)}</strong></article>`).join('');
}
function renderRows(rows=[]){
  $('#rows').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.fixture_date||'')}</td><td><b>${esc(r.home_team||'')}</b><span> vs </span><b>${esc(r.away_team||'')}</b></td><td>${esc(r.selection_label||r.market||'')}</td><td>${Number.isFinite(Number(r.engine_score))?Number(r.engine_score).toFixed(1):'—'}</td><td><em class="proof-result ${resultClass(r.settlement_status)}">${esc(r.settlement_status||'PENDING')}</em></td></tr>`).join(''):`<tr><td colspan="5" class="proof-empty">No published picks in this period.</td></tr>`;
}
async function load(){
  const from=$('#from').value,to=$('#to').value;$('#state').textContent='Loading…';
  try{const r=await fetch(`/api/proof?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{cache:'no-store'}),b=await r.json();if(!r.ok)throw new Error(b.message||b.error||`HTTP ${r.status}`);renderSummary(b.summary||{});renderRows(b.rows||[]);$('#state').textContent=`${(b.rows||[]).length} published pick${(b.rows||[]).length===1?'':'s'}`}
  catch(e){$('#state').textContent=`Proof unavailable · ${e.message}`;renderSummary({});renderRows([])}
}
$('#load').onclick=load;load();
