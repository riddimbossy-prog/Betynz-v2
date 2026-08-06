import { withTimeout } from "./utils.mjs";

export async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const timeout = withTimeout(timeoutMs, url);
  try {
    const response = await fetch(url, { ...options, signal: timeout.signal });
    const text = await response.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!response.ok) {
      const error = new Error(`Upstream returned ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    timeout.clear();
  }
}
