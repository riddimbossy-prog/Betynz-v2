import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

async function freePort() {
  const server = createServer();
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}

async function waitForHealth(port, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 50));
  }
  throw new Error('SportyBet core did not start');
}

test('trusted loopback API calls bypass the public rate limiter', async t => {
  const port = await freePort();
  const key = 'internal-test-key';
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: resolve(here, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      SPORTYBET_API_KEY: key,
      SPORTYBET_API_KEY_HEADER: 'X-API-Key',
      API_RATE_LIMIT_PER_MINUTE: '30',
      ALLOW_INTERNAL_RATE_LIMIT_BYPASS: 'true'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  t.after(() => child.kill('SIGTERM'));
  await waitForHealth(port);

  const responses = await Promise.all(Array.from({ length: 60 }, () =>
    fetch(`http://127.0.0.1:${port}/source-status`, { headers: { 'X-API-Key': key } })
  ));
  assert.equal(responses.filter(response => response.status === 200).length, 60, stderr);
  assert.equal(responses.filter(response => response.status === 429).length, 0, stderr);
});
