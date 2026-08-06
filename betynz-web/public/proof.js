const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const offset = days => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const fmt = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); };
$('#fromDate').value = offset(-30); $('#toDate').value = offset(0);
async function load() {
  const button = $('#proofRefresh'); button.disabled = true; $('#proofState').textContent = 'Loading…';
  try {
    const query = new URLSearchParams({ from: $('#fromDate').value, to: $('#toDate').value, status: $('#proofStatus').value });
    const response = await fetch(`/api/proof?${query}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Could not load proof');
    const summary = payload.summary || {};
    $('#proofTotal').textContent = summary.total || 0;
    $('#proofRecord').textContent = `${summary.wins || 0}–${summary.losses || 0}`;
    $('#proofHit').textContent = `${summary.hitRate || 0}%`;
    $('#proofRoi').textContent = `${summary.roi || 0}%`;
    $('#proofState').textContent = payload.configured ? 'Frozen records loaded' : 'Supabase is not configured';
    const rows = payload.rows || [];
    $('#proofList').innerHTML = rows.length ? rows.map(row => {
      const engineName = row.engine === 'PPG_ROUTE' ? 'PPG ROUTE' : row.engine === 'CONVERGENCE_ROUTE' ? 'CONVERGENCE' : row.engine === 'CONSENSUS_SYSTEM' ? `CONSENSUS · ${String(row.classification||'').replaceAll('_',' ')}` : 'MARKET ROUTE';
      return `<article class="proof-row ${row.recordType === 'CONSENSUS' ? 'consensus-proof-row' : ''}"><div class="proof-main"><span class="proof-status ${String(row.status || 'pending').toLowerCase()}">${esc(row.status)}</span><div><small>${engineName} · ${esc(row.league || 'Competition')}</small><h3>${esc(row.home)} <span>vs</span> ${esc(row.away)}</h3><p>${esc(row.selection || row.market)} @ <b>${Number(row.odds || 0).toFixed(2)}</b> · ${esc(row.decision || 'FIRE')} · Grade ${esc(row.grade || '—')}</p></div></div><div class="proof-result"><b>${row.homeScore == null ? '—' : `${row.homeScore}–${row.awayScore}`}</b><span>${fmt(row.kickoff)}</span><small>Frozen ${fmt(row.frozenAt)}</small></div></article>`;
    }).join('') : '<div class="empty-state">No frozen engine or consensus predictions match these filters.</div>';
    window.dispatchEvent(new CustomEvent('betynz:content-rendered')); 
  } catch (error) {
    $('#proofState').textContent = error.message;
    $('#proofList').innerHTML = '<div class="empty-state">Proof is temporarily unavailable.</div>';
  } finally { button.disabled = false; }
}
$('#proofRefresh').addEventListener('click', load); load();
