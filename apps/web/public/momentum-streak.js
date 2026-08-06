const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const odd = value => Number(value) > 1 ? Number(value).toFixed(2) : '—';
const today = new Date().toISOString().slice(0, 10);
let payload = null;
let pollTimer = null;
let requestVersion = 0;
let pollCount = 0;

$('#momentumDate').value = today;
$('#momentumRefresh').addEventListener('click', () => load());
$('#momentumDate').addEventListener('change', () => load());
$('#momentumDecisionFilter').addEventListener('change', render);

function kickoff(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Kickoff TBA' : date.toLocaleString([], { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
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
    if (version === requestVersion && ($('#momentumDate').value || today) === date) load({ silent: true });
  }, payload?.providerQueue?.coolingDown ? 5000 : (pollCount++ < 16 ? 1500 : 4000));
}

async function load({ silent = false } = {}) {
  const date = $('#momentumDate').value || today;
  const version = ++requestVersion;
  clearTimeout(pollTimer);
  if (!silent) $('#momentumGrid').innerHTML = '<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>Starting momentum analysis…</h3><p>The page will update automatically while venue histories are processed.</p></div>';
  try {
    const data = await fetchJson(`/api/momentum-streak-board?date=${encodeURIComponent(date)}`);
    if (version !== requestVersion) return;
    payload = data;
    $('#momentumFixtures').textContent = payload.summary?.fixtures || 0;
    $('#momentumAnalysed').textContent = payload.summary?.analysed || 0;
    $('#momentumFire').textContent = payload.summary?.fire || 0;
    $('#momentumSafer').textContent = payload.summary?.safer || 0;
    render();
    if (!payload.complete && !payload.failed) schedulePoll(date, version);
  } catch (error) {
    if (version !== requestVersion) return;
    payload = null;
    const message = error?.name === 'AbortError' ? 'The server did not respond in time.' : (error.message || 'Check the football-data connection and retry.');
    $('#momentumGrid').innerHTML = `<div class="route-empty"><h3>Momentum analysis could not be completed</h3><p>${esc(message)}</p></div>`;
  }
}

function formBadges(form = []) {
  return (form || []).map(value => `<span class="form-dot ${String(value).toLowerCase()}">${esc(value)}</span>`).join('') || '<span class="muted">No form</span>';
}

function streakLine(split = {}) {
  const streaks = split.streaks || {};
  return `<div class="momentum-form-row"><div>${formBadges(split.form)}</div><small>${Number(streaks.wins || 0)}W run · ${Number(streaks.unbeaten || 0)} unbeaten · ${Number(streaks.winless || 0)} winless</small></div>`;
}

function render() {
  if (!payload) return;
  const filter = $('#momentumDecisionFilter').value;
  const rows = (payload.qualified || []).filter(item => filter === 'ALL' || item.engine?.decision === filter);
  if (!rows.length) {
    if (payload.failed) {
      $('#momentumGrid').innerHTML = `<div class="route-empty"><h3>Momentum analysis failed</h3><p>${esc(payload.error || 'Refresh to try again.')}</p></div>`;
      return;
    }
    if (!payload.complete) {
      const progress = payload.progress || {};
      const queue = payload.providerQueue || progress.providerQueue || {};
      const cooling = Boolean(queue.coolingDown || progress.stage === 'RATE_LIMIT_COOLDOWN');
      const seconds = Math.max(1, Math.ceil(Number(queue.retryInMs || 0) / 1000));
      const title = cooling ? 'Provider cooldown active…' : 'Building ordered streak evidence…';
      const detail = cooling
        ? `API-Football reached the subscription minute limit. Momentum will resume automatically${Number(queue.retryInMs) > 0 ? ` in about ${seconds}s` : ''}. ${Number(progress.processed || 0)} fixtures are already complete.`
        : `${Number(progress.processed || payload.summary?.analysed || 0)} of ${Number(progress.total || payload.summary?.fixtures || 0)} fixtures processed. This page updates automatically.`;
      $('#momentumGrid').innerHTML = `<div class="route-empty apex-soft-pulse"><span class="apex-loader-dot" aria-hidden="true"></span><h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;
      return;
    }
    $('#momentumGrid').innerHTML = `<div class="route-empty"><h3>No qualifying momentum picks</h3><p>${esc(payload.warning || 'No match had two independent streak families plus an offered market.')}</p></div>`;
    return;
  }
  const queue = payload.providerQueue || payload.progress?.providerQueue || {};
  const progressLabel = queue.coolingDown
    ? `Provider cooldown · ${Number(payload.progress?.processed || 0)}/${Number(payload.progress?.total || 0)} completed`
    : `Momentum analysis continues · ${Number(payload.progress?.processed || payload.summary?.analysed || 0)}/${Number(payload.progress?.total || payload.summary?.fixtures || 0)}`;
  const progressBanner = !payload.complete ? `<div class="route-progress apex-progress-glow">${esc(progressLabel)}</div>` : '';
  $('#momentumGrid').innerHTML = progressBanner + rows.map((item, index) => {
    const fixture = item.fixture || {};
    const engine = item.engine || {};
    const selection = engine.selection || {};
    const candidate = (engine.candidates || []).find(row => row.id === selection.routeId) || {};
    return `<article class="route-pick-card momentum-pick-card apex-soft-reveal" style="--reveal-index:${index}">
      <div class="route-pick-head">
        <div><h2>${esc(fixture.home?.name)} vs ${esc(fixture.away?.name)}</h2><p>${esc(fixture.league?.country || 'International')} · ${esc(fixture.league?.name || 'League')} · ${esc(kickoff(fixture.kickoff))}</p></div>
        <span class="decision-pill ${String(selection.decision || '').toLowerCase()}">${esc(selection.decision || 'FIRE')}</span>
      </div>
      <div class="route-market"><b>${esc(selection.label || selection.market)}</b><strong>${odd(selection.odds)}</strong></div>
      <div class="momentum-team-grid"><article><small>${esc(fixture.home?.name || 'Home')}</small>${streakLine(engine.home)}</article><article><small>${esc(fixture.away?.name || 'Away')}</small>${streakLine(engine.away)}</article></div>
      <div class="momentum-family-row">${(selection.streakFamilies || candidate.streakFamilies || []).map(value => `<span>${esc(String(value).replaceAll('_',' '))}</span>`).join('')}</div>
      <p class="muted">${esc(engine.explanation || '')}</p>
      <div class="route-card-checks">${(candidate.checks || []).map(check => `<span class="${check.pass ? 'pass' : 'fail'}">${check.pass ? '✓' : '×'} ${esc(check.label)}: ${esc(check.actual)}</span>`).join('')}</div>
    </article>`;
  }).join('');
}

load();
