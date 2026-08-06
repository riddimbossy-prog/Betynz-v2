const store = new Map();

export function cacheGet(key) {
  const item = store.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    store.delete(key);
    return null;
  }
  return item.value;
}

export function cacheSet(key, value, ttlSeconds = 900) {
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  return value;
}

export function cacheStats() {
  const now = Date.now();
  for (const [key, item] of store.entries()) if (now > item.expiresAt) store.delete(key);
  return { entries: store.size };
}
