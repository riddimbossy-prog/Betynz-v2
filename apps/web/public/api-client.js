/** Shared browser API client for Betynz public intelligence pages. */
export function transientHttpStatus(status) {
  return [429, 502, 503, 504].includes(Number(status));
}

function fixtureKey(item) {
  return String(item?.fixture?.id ?? item?.fixtureId ?? '');
}

function engineResolved(item) {
  const decision = String(item?.engine?.decision || '').toUpperCase();
  return Boolean(decision && decision !== 'WAITING');
}

function mergeFreshFixture(previous, incoming) {
  if (!previous || !incoming) return previous || incoming;
  return {
    ...incoming,
    ...previous,
    fixture: incoming.fixture ? { ...(previous.fixture || {}), ...incoming.fixture } : previous.fixture
  };
}

/**
 * Keep progressive engine boards monotonic during automatic polling.
 * A later partial/cooldown snapshot is never allowed to replace an already
 * analysed fixture with WAITING or to drop an already-visible fixture.
 * A genuinely analysed newer result is still allowed to replace the old one.
 */
export function mergeProgressiveBoard(previous, incoming) {
  if (!previous || !incoming) return incoming || previous || null;
  if (previous.date && incoming.date && previous.date !== incoming.date) return incoming;

  const previousProcessed = Number(previous?.progress?.processed || 0);
  const incomingProcessed = Number(incoming?.progress?.processed || 0);
  const regressed = !incoming.complete && incomingProcessed < previousProcessed;
  if (incoming.failed && !previous.failed && (previous?.all?.length || previous?.qualified?.length)) return previous;

  const previousRows = Array.isArray(previous.all) ? previous.all : [];
  const incomingRows = Array.isArray(incoming.all) ? incoming.all : [];
  const previousById = new Map(previousRows.map(item => [fixtureKey(item), item]).filter(([id]) => id));
  const seen = new Set();
  const all = incomingRows.map(item => {
    const id = fixtureKey(item);
    if (id) seen.add(id);
    const old = id ? previousById.get(id) : null;
    if (!old) return item;
    if (engineResolved(old) && !engineResolved(item)) return mergeFreshFixture(old, item);
    if (regressed && engineResolved(old)) return mergeFreshFixture(old, item);
    return item;
  });

  if (!incoming.complete) {
    for (const old of previousRows) {
      const id = fixtureKey(old);
      if (id && !seen.has(id)) all.push(old);
    }
  }

  all.sort((a, b) => new Date(a?.fixture?.kickoff || 0) - new Date(b?.fixture?.kickoff || 0));
  const qualified = all.filter(item => item?.engine?.selection);
  const total = Math.max(Number(previous?.progress?.total || 0), Number(incoming?.progress?.total || 0));
  const processed = Math.min(total || Number.MAX_SAFE_INTEGER, Math.max(previousProcessed, incomingProcessed));
  const analysed = all.filter(item => engineResolved(item)).length;
  const fire = all.filter(item => String(item?.engine?.decision || '').toUpperCase() === 'FIRE').length;
  const safer = all.filter(item => String(item?.engine?.decision || '').toUpperCase() === 'SAFER').length;
  const conflict = all.filter(item => ['CONFLICT','STAT_CONFLICT','VETO'].includes(String(item?.engine?.decision || '').toUpperCase())).length;
  const waiting = all.filter(item => String(item?.engine?.decision || '').toUpperCase() === 'WAITING').length;

  return {
    ...previous,
    ...incoming,
    all,
    qualified,
    summary: {
      ...(previous.summary || {}),
      ...(incoming.summary || {}),
      fixtures: all.length,
      analysed: Math.max(Number(previous?.summary?.analysed || 0), Number(incoming?.summary?.analysed || 0), analysed),
      fire,
      safer,
      conflict,
      waiting,
      noSignal: all.filter(item => !item?.engine?.selection).length
    },
    progress: {
      ...(previous.progress || {}),
      ...(incoming.progress || {}),
      processed,
      total,
      percent: total ? Math.max(Number(previous?.progress?.percent || 0), Number(incoming?.progress?.percent || 0), Math.round(processed / total * 100)) : 100
    }
  };
}

/** Preserve consensus rows only when a polling response demonstrably regresses. */
export function mergeConsensusPayload(previous, incoming) {
  if (!previous || !incoming) return incoming || previous || null;
  if (previous.from && incoming.from && previous.from !== incoming.from) return incoming;
  const prevProcessed = Number(previous?.progress?.processed || 0);
  const nextProcessed = Number(incoming?.progress?.processed || 0);
  if (incoming.failed && !previous.failed && (previous?.consensus?.all?.length || previous?.enginePicks?.length)) return previous;
  if (!incoming.complete && nextProcessed < prevProcessed) {
    return {
      ...incoming,
      consensus: previous.consensus,
      bankers: previous.bankers,
      qualified: previous.qualified,
      enginePicks: previous.enginePicks,
      consensusPicks: previous.consensusPicks,
      elite: previous.elite,
      consensusBankers: previous.consensusBankers,
      singleQualified: previous.singleQualified,
      safer: previous.safer,
      conflicts: previous.conflicts,
      holds: previous.holds,
      byDate: previous.byDate,
      summary: previous.summary,
      progress: {
        ...(incoming.progress || {}),
        processed: prevProcessed,
        total: Math.max(Number(previous?.progress?.total || 0), Number(incoming?.progress?.total || 0)),
        percent: Math.max(Number(previous?.progress?.percent || 0), Number(incoming?.progress?.percent || 0))
      }
    };
  }
  return incoming;
}

export async function fetchJson(url, timeoutOrOptions = 20000) {
  const options = typeof timeoutOrOptions === 'number' ? { timeoutMs: timeoutOrOptions } : (timeoutOrOptions || {});
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 20000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: options.cache || 'no-store',
      method: options.method || 'GET',
      headers: options.headers || undefined,
      body: options.body,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = data.code || null;
      error.payload = data;
      error.transient = transientHttpStatus(response.status);
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}
