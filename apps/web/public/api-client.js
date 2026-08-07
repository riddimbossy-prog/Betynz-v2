/** Shared browser API client for Betynz public intelligence pages. */
export function transientHttpStatus(status) {
  return [429, 502, 503, 504].includes(Number(status));
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
