const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const offset = days => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
$('#perfFrom').value = offset(-90); $('#perfTo').value = offset(0);
function engineName(code) { if (code === 'PPG_ROUTE') return 'PPG Route Engine'; if (code === 'APEX_INTELLIGENCE') return 'Apex Intelligence Engine'; if (code === 'CONVERGENCE_ROUTE') return 'Convergence Engine'; if (code === 'MOMENTUM_STREAK') return 'Momentum & Streak Engine'; if (code === 'STREAK_VALUE') return 'Atlas Streak Value Engine'; if (code === 'HTFT_MOMENTUM') return 'Chronos HT/FT Momentum Engine'; if(code==='CONSENSUS_SYSTEM') return 'Consensus System'; return 'Market Route Engine'; }
function table(rows) {
  if (!rows.length) return '<div class="empty-state">No settled sample yet.</div>';
  return `<table><thead><tr><th>Engine</th><th>Pattern</th><th>Sample</th><th>Hit</th><th>ROI</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(engineName(row.engine))}</td><td>${esc(row.market || row.key)}${row.bucket ? ` · ${esc(row.bucket)}` : ''}</td><td>${row.settled}</td><td>${row.hitRate}%</td><td>${row.roi}%</td></tr>`).join('')}</tbody></table>`;
}
function agreementTable(rows) {
  if (!rows.length) return '<div class="empty-state">Agreement performance begins after frozen consensus picks settle.</div>';
  return `<table><thead><tr><th>Classification</th><th>Stage</th><th>Sample</th><th>Record</th><th>Hit</th><th>ROI</th><th>Recommendation</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(String(row.classification||row.key).replaceAll('_',' '))}</td><td>${esc(row.stage||'AUDIT')}</td><td>${row.sample||0}</td><td>${row.wins||0}–${row.losses||0}</td><td>${row.hitRate||0}%</td><td>${row.roi||0}%</td><td>${esc(String(row.recommendation||'KEEP_AUDITING').replaceAll('_',' '))}</td></tr>`).join('')}</tbody></table>`;
}
async function load() {
  const button = $('#perfRefresh'); button.disabled = true;
  try {
    const query = new URLSearchParams({ from: $('#perfFrom').value, to: $('#perfTo').value });
    const response = await fetch(`/api/performance?${query}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not load performance');
    const engines = payload.byEngine || [];
    $('#engineCards').innerHTML = engines.length ? engines.map(row => `<article><small>${esc(engineName(row.engine).toUpperCase())}</small><strong>${row.hitRate}%</strong><span>${row.wins}W–${row.losses}L · ${row.roi}% ROI · ${row.settled} settled</span></article>`).join('') : '<div class="empty-state">Performance begins after frozen tips settle.</div>';
    $('#marketTable').innerHTML = table((payload.byMarket || []).slice(0, 30));
    $('#oddsTable').innerHTML = table((payload.byOdds || []).slice(0, 30));
    $('#agreementTable').innerHTML = agreementTable(payload.byAgreement || []);
    window.dispatchEvent(new CustomEvent('betynz:content-rendered'));
  } catch (error) { $('#engineCards').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; $('#agreementTable').innerHTML='<div class="empty-state">Agreement performance is unavailable.</div>'; }
  finally { button.disabled = false; }
}
$('#perfRefresh').addEventListener('click', load); load();
