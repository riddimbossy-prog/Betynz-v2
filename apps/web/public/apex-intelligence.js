const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;
let pollTimer = null;
let requestVersion = 0;
let pollCount = 0;

$('#apexDate').value = today;
$('#apexRefresh').addEventListener('click', () => load());
$('#apexDate').addEventListener('change', () => load());
$('#apexDecisionFilter').addEventListener('change', render);

function kickoff(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Kickoff TBA' : date.toLocaleString([], { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
}

function formChips(form = []) {
  return form.map(value => `<span class="form-${String(value).toLowerCase()}">${esc(value)}</span>`).join('') || '<span>—</span>';
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

function schedulePoll(date, version) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (version === requestVersion && ($('#apexDate').value || today) === date) load({ silent: true });
  }, payload?.providerQueue?.coolingDown ? 5000 : (pollCount++ < 16 ? 1500 : 4000));
}

async function load({ silent = false } = {}) {
  const date = $('#apexDate').value || today;
  const version = ++requestVersion;
  clearTimeout(pollTimer);
  if (!silent) {
    pollCount = 0;
    $('#apexGrid').innerHTML = '<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>Starting Apex analysis…</h3><p>Qualified selections will appear while shared team-history work continues.</p></div>';
  }
  try {
    const data = await fetchJson(`/api/apex-intelligence-board?date=${encodeURIComponent(date)}`);
    if (version !== requestVersion) return;
    payload = data;
    $('#apexFixtures').textContent = payload.summary?.fixtures || 0;
    $('#apexAnalysed').textContent = payload.summary?.analysed || 0;
    $('#apexFire').textContent = payload.summary?.fire || 0;
    $('#apexSafer').textContent = payload.summary?.safer || 0;
    render();
    if (!payload.complete && !payload.failed) schedulePoll(date, version);
  } catch (error) {
    if (version !== requestVersion) return;
    payload = null;
    const message = error?.name === 'AbortError' ? 'The server did not respond in time.' : (error.message || 'Check the football-data connection and try again.');
    $('#apexGrid').innerHTML = `<div class="route-empty"><h3>Apex analysis could not be completed</h3><p>${esc(message)}</p></div>`;
  }
}

function render() {
  if (!payload) return;
  const filter = $('#apexDecisionFilter').value;
  const rows = (payload.qualified || []).filter(item => filter === 'ALL' || item.engine?.decision === filter);
  if (!rows.length) {
    if (payload.failed) {
      $('#apexGrid').innerHTML = `<div class="route-empty"><h3>Apex analysis failed</h3><p>${esc(payload.error || 'Refresh to try again.')}</p></div>`;
      return;
    }
    if (!payload.complete) {
      const progress = payload.progress || {};
      const queue = payload.providerQueue || progress.providerQueue || {};
      const cooling = Boolean(queue.coolingDown || progress.stage === 'RATE_LIMIT_COOLDOWN');
      const seconds = Math.max(1, Math.ceil(Number(queue.retryInMs || 0) / 1000));
      const title = cooling ? 'Provider cooldown active…' : 'Building composite evidence…';
      const detail = cooling
        ? `API-Football reached the subscription minute limit. Apex will resume automatically${Number(queue.retryInMs) > 0 ? ` in about ${seconds}s` : ''}. ${Number(progress.processed || 0)} fixtures are already complete.`
        : `${Number(progress.processed || payload.summary?.analysed || 0)} of ${Number(progress.total || payload.summary?.fixtures || 0)} fixtures processed.`;
      $('#apexGrid').innerHTML = `<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;
      return;
    }
    $('#apexGrid').innerHTML = `<div class="route-empty"><h3>No qualifying Apex picks</h3><p>${esc(payload.warning || 'No fixture reached the composite score, evidence-family count and exact-market requirements.')}</p></div>`;
    return;
  }
  const queue = payload.providerQueue || payload.progress?.providerQueue || {};
  const progressLabel = queue.coolingDown
    ? `Provider cooldown · ${Number(payload.progress?.processed || 0)}/${Number(payload.progress?.total || 0)} completed`
    : `Composite analysis continues · ${Number(payload.progress?.processed || 0)}/${Number(payload.progress?.total || 0)}`;
  const progressBanner = !payload.complete ? `<div class="route-progress apex-progress-glow">${esc(progressLabel)}</div>` : '';
  $('#apexGrid').innerHTML = progressBanner + rows.map((item, index) => {
    const fixture = item.fixture || {};
    const engine = item.engine || {};
    const selection = engine.selection || {};
    const candidate = (engine.candidates || []).find(value => value.id === selection.routeId) || {};
    const checks = (candidate.checks || []).filter(value => value.pass && !value.contradiction).slice(0, 5);
    return `<article class="route-pick-card apex-pick-card apex-soft-reveal" style="--reveal-index:${index}">
      <div class="route-pick-head">
        <div><h2>${esc(fixture.home?.name)} vs ${esc(fixture.away?.name)}</h2><p>${esc(fixture.league?.country || 'International')} · ${esc(fixture.league?.name || 'League')} · ${esc(kickoff(fixture.kickoff))}</p></div>
        <span class="decision-pill ${String(selection.decision || '').toLowerCase()}">${esc(selection.decision || engine.decision || 'FIRE')}</span>
      </div>
      <div class="route-market"><b>${esc(selection.label || selection.market)}</b><strong>${odd(selection.odds)}</strong></div>
      <div class="apex-score-row"><span>Composite score <b>${Number(selection.score || candidate.score || 0)}%</b></span><span>Evidence families <b>${Number(selection.evidenceFamilies || candidate.familyCount || 0)}</b></span><span>Data quality <b>${Number(engine.dataQuality || 0)}%</b></span></div>
      <div class="apex-split-grid">
        <div><small>Home · last 5 home</small><strong>${Number(item.venueForm?.home?.ppg || 0).toFixed(2)} strength</strong><div class="form-chips">${formChips(item.venueForm?.home?.form)}</div></div>
        <div><small>Away · last 5 away</small><strong>${Number(item.venueForm?.away?.ppg || 0).toFixed(2)} strength</strong><div class="form-chips">${formChips(item.venueForm?.away?.form)}</div></div>
      </div>
      <div class="route-checks">${checks.map(value => `<div class="route-check pass"><span>✓</span><div><b>${esc(value.label)}</b><small>${esc(value.actual)}</small></div></div>`).join('')}</div>
      <p class="muted">${esc(engine.explanation || candidate.explanation || '')}</p>
    </article>`;
  }).join('');
}

load();
