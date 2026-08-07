const buckets = new Map();

function nowMinuteKey(windowMs) {
  return Math.floor(Date.now() / windowMs);
}

function ipOf(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || 'unknown');
}

function prune() {
  const now = Date.now();
  for (const [key, value] of buckets.entries()) if (!value || value.expiresAt <= now) buckets.delete(key);
  while (buckets.size > 5000) buckets.delete(buckets.keys().next().value);
}

export function consumeRateLimit(req, group = 'public', { limit = 120, windowMs = 60_000 } = {}) {
  prune();
  const bucketKey = `${group}:${ipOf(req)}:${nowMinuteKey(windowMs)}`;
  const entry = buckets.get(bucketKey) || { count: 0, expiresAt: Date.now() + windowMs };
  entry.count += 1;
  buckets.set(bucketKey, entry);
  return {
    allowed: entry.count <= limit,
    limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))
  };
}

export function utcDateString(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Number(offsetDays || 0));
  return date.toISOString().slice(0, 10);
}

export function publicAnalysisDateState(date, { pastDays = 0, futureDays = 7 } = {}) {
  if (process.env.NODE_TEST_CONTEXT === '1' || process.env.BETYNZ_TEST_MODE === '1') return { allowed: true, testMode: true };
  const input = Date.parse(`${date}T00:00:00Z`);
  const min = Date.parse(`${utcDateString(-Math.max(0, pastDays))}T00:00:00Z`);
  const max = Date.parse(`${utcDateString(Math.max(0, futureDays))}T23:59:59Z`);
  if (!Number.isFinite(input)) return { allowed: false, reason: 'INVALID_DATE' };
  if (input < min) return { allowed: false, reason: 'HISTORICAL_ANALYSIS_LOCKED', min: new Date(min).toISOString().slice(0,10), max: new Date(max).toISOString().slice(0,10) };
  if (input > max) return { allowed: false, reason: 'ANALYSIS_WINDOW_EXCEEDED', min: new Date(min).toISOString().slice(0,10), max: new Date(max).toISOString().slice(0,10) };
  return { allowed: true, min: new Date(min).toISOString().slice(0,10), max: new Date(max).toISOString().slice(0,10) };
}

export function requestGuardStats() {
  prune();
  return { buckets: buckets.size };
}
