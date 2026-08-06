export const env = (name, fallback = '') => String(process.env[name] ?? fallback).trim();
export const text = value => String(value ?? '').trim();
export const number = value => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
export const integer = (value, fallback = 0) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
};
export const enabled = (value, fallback = true) => {
  const raw = text(value);
  if (!raw) return fallback;
  return !/^(0|false|no|off)$/i.test(raw);
};
export const canonical = value => text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.]+/g, ' ').trim();
export const safeDate = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || /^\d+$/.test(text(value))) {
    const n = Number(value);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
export const isoDate = value => safeDate(value)?.toISOString() || null;
export const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) && Boolean(safeDate(`${text(value)}T00:00:00Z`));
export const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
export const stripProviderId = value => text(value).replace(/^sportybet:/i, '');

export function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders
  });
  res.end(body);
}

export function publicError(error) {
  const message = text(error?.message || error || 'Request failed');
  return message.replace(/https?:\/\/[^\s)]+/gi, '[upstream]').replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]').slice(0, 240);
}

const memory = new Map();
export function cacheGet(key) {
  const row = memory.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) { memory.delete(key); return null; }
  return row.value;
}
export function cacheSet(key, value, ttlSeconds) {
  memory.set(key, { value, expiresAt: Date.now() + Math.max(1, Number(ttlSeconds) || 1) * 1000 });
  if (memory.size > 500) {
    const first = memory.keys().next().value;
    if (first) memory.delete(first);
  }
  return value;
}
