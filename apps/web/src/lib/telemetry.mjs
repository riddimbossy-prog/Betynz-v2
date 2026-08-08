const routes = new Map();
const errors = new Map();
let eventLoopLagMs = 0;
let expected = Date.now() + 1000;

const sampler = setInterval(() => {
  const now = Date.now();
  eventLoopLagMs = Math.max(0, now - expected);
  expected = now + 1000;
}, 1000);
sampler.unref?.();

function bounded(map, key, init) {
  if (!map.has(key)) map.set(key, init());
  while (map.size > 200) map.delete(map.keys().next().value);
  return map.get(key);
}

export function recordHttpRequest(path, status, durationMs) {
  const key = String(path || 'unknown').replace(/\/[0-9]{4,}/g, '/:id');
  const row = bounded(routes, key, () => ({ requests: 0, errors: 0, totalMs: 0, maxMs: 0, status: {} }));
  row.requests += 1;
  row.totalMs += Number(durationMs || 0);
  row.maxMs = Math.max(row.maxMs, Number(durationMs || 0));
  if (Number(status) >= 500) row.errors += 1;
  row.status[String(status || 0)] = (row.status[String(status || 0)] || 0) + 1;
}

export function recordRuntimeError(kind, error) {
  const key = String(kind || 'runtime');
  const row = bounded(errors, key, () => ({ count: 0, lastMessage: null, lastAt: null }));
  row.count += 1;
  row.lastMessage = String(error?.message || error || '').slice(0, 500);
  row.lastAt = new Date().toISOString();
}

export function telemetrySnapshot() {
  const routeRows = [...routes.entries()].map(([path, row]) => ({
    path,
    requests: row.requests,
    errorRate: row.requests ? Number((row.errors / row.requests * 100).toFixed(2)) : 0,
    averageMs: row.requests ? Number((row.totalMs / row.requests).toFixed(1)) : 0,
    maxMs: Number(row.maxMs.toFixed(1)),
    status: row.status
  })).sort((a, b) => b.requests - a.requests).slice(0, 40);
  return {
    uptimeSeconds: Math.round(process.uptime()),
    eventLoopLagMs: Number(eventLoopLagMs.toFixed(1)),
    routes: routeRows,
    errors: [...errors.entries()].map(([kind, row]) => ({ kind, ...row })).sort((a, b) => b.count - a.count),
    generatedAt: new Date().toISOString()
  };
}
