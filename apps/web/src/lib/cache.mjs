const store = new Map();

function maxEntries() {
  return Math.max(100, Math.min(5000, Number(process.env.BETYNZ_CACHE_MAX_ENTRIES || 700)));
}

function prune(now = Date.now()) {
  for (const [key, item] of store.entries()) {
    if (!item || now > item.expiresAt) store.delete(key);
  }
  const cap = maxEntries();
  while (store.size > cap) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function cacheGet(key) {
  const item = store.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    store.delete(key);
    return null;
  }
  // Refresh insertion order so frequently used values survive bounded-cache eviction.
  store.delete(key);
  store.set(key, item);
  return item.value;
}

export function cacheSet(key, value, ttlSeconds = 900) {
  if (store.has(key)) store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + Math.max(1, Number(ttlSeconds) || 1) * 1000 });
  prune();
  return value;
}

export function cachePrune() {
  prune();
  return cacheStats();
}

export function cacheStats() {
  prune();
  return { entries: store.size, maxEntries: maxEntries() };
}


export function cacheDelete(key) {
  return store.delete(key);
}

export function cacheDeletePrefix(prefix) {
  let deleted = 0;
  for (const key of [...store.keys()]) {
    if (String(key).startsWith(String(prefix))) {
      store.delete(key);
      deleted += 1;
    }
  }
  return deleted;
}
