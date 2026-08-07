const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function encode(value){try{return encodeURIComponent(JSON.stringify(value||{}));}catch{return '';}}
function decode(value){try{return JSON.parse(decodeURIComponent(value||''));}catch{return null;}}

export function dataBackedButton(validation, text='Backed by data'){
  if(!validation || validation.status!=='BACKED_BY_DATA') return '';
  return `<button type="button" class="data-backed-trigger" data-validation="${esc(encode(validation))}"><span>✓</span>${esc(text)}<small>${Number.isFinite(Number(validation.score))?`${Number(validation.score).toFixed(0)}% support`:'verified'}</small></button>`;
}

function evidenceRows(rows=[], kind='support'){
  if(!rows.length) return `<p class="data-backed-none">No ${kind} flags were recorded.</p>`;
  return rows.slice(0,8).map(row=>`<div class="data-backed-evidence ${kind}"><span>${kind==='support'?'✓':kind==='oppose'?'×':'·'}</span><div><b>${esc(row.label)}</b><small>${esc(row.value)} · ${esc(String(row.source||'match data').replaceAll('_',' '))}</small></div></div>`).join('');
}

function ensureDialog(){
  let dialog=document.querySelector('#dataBackedDialog');
  if(dialog) return dialog;
  dialog=document.createElement('dialog');dialog.id='dataBackedDialog';dialog.className='data-backed-dialog';
  dialog.innerHTML=`<div class="data-backed-shell"><button class="data-backed-close" type="button" aria-label="Close">×</button><div id="dataBackedContent"></div></div>`;
  document.body.appendChild(dialog);
  dialog.querySelector('.data-backed-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  return dialog;
}

function openValidation(validation){
  if(!validation) return;
  const dialog=ensureDialog(), content=dialog.querySelector('#dataBackedContent');
  const samples=validation.sample||{};
  content.innerHTML=`
    <div class="data-backed-head"><span>✓ STATISTICALLY VERIFIED</span><h2>Backed by match data</h2><p>${esc(validation.explanation||'The proposed market has independent statistical support.')}</p></div>
    <div class="data-backed-summary"><article><small>Validation score</small><strong>${Number.isFinite(Number(validation.score))?`${Number(validation.score).toFixed(0)}%`:'—'}</strong></article><article><small>Market family</small><strong>${esc(String(validation.family||'MATCH_DATA').replaceAll('_',' '))}</strong></article><article><small>Venue samples</small><strong>${Number(samples.home||0)} + ${Number(samples.away||0)}</strong></article></div>
    ${validation.adaptiveRecovery?`<section class="adaptive-recovery-note"><h3>Why Betynz changed the market</h3><p>The original ${esc(String(validation.originalMarket||'route').replaceAll('_',' '))} did not survive the final checks. Betynz re-opened this fixture and independently verified ${esc(String(validation.recoveredMarket||validation.market||'the replacement').replaceAll('_',' '))} from the remaining match evidence instead of applying a fixed fallback.</p></section>`:''}
    <section><h3>Why the data support it</h3>${evidenceRows(validation.supporting,'support')}</section>
    ${validation.opposing?.length?`<section><h3>Caution flags</h3>${evidenceRows(validation.opposing,'oppose')}</section>`:''}
    ${validation.neutral?.length?`<details><summary>Neutral evidence</summary>${evidenceRows(validation.neutral,'neutral')}</details>`:''}
    <p class="data-backed-foot">This check is performed after the engine selects a direction. A tip is withheld when the available match data materially contradict it or cannot independently confirm it.</p>`;
  dialog.showModal();
}

document.addEventListener('click',event=>{
  const button=event.target.closest('.data-backed-trigger');
  if(!button) return;
  openValidation(decode(button.dataset.validation));
});
