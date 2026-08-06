import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const webDirectory = join(root, 'apps', 'web');
const apiDirectory = join(root, 'apps', 'sportybet-api');
const webPort = Math.max(1, Number(process.env.PORT || 10000));
const corePort = Math.max(1, Number(process.env.SPORTYBET_INTERNAL_PORT || 10001));
const internalKey = String(process.env.SPORTYBET_API_KEY || randomBytes(32).toString('hex'));
const children = new Map();
let shuttingDown = false;

function launch(name, cwd, env) {
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.set(name, child);
  child.stdout.on('data', chunk => process.stdout.write(`[${name}] ${chunk}`));
  child.stderr.on('data', chunk => process.stderr.write(`[${name}] ${chunk}`));
  child.once('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    console.error(`[combined] ${name} stopped unexpectedly (code=${code}, signal=${signal || 'none'}).`);
    shutdown(code || 1);
  });
  return child;
}

async function waitForCore(timeoutMs = 30000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${corePort}/api/health`);
      if (response.ok) {
        const body = await response.json();
        if (body?.ok && body?.source === 'SPORTYBET_CUSTOM_API') return;
      }
      lastError = new Error(`Core health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw lastError || new Error('SportyBet core API did not become ready.');
}

function webEnvironment() {
  return {
    PORT: String(webPort),
    BETYNZ_DATA_API_BASE_URL: `http://127.0.0.1:${corePort}/api/`,
    BETYNZ_DATA_API_KEY: internalKey,
    BETYNZ_DATA_API_KEY_HEADER: 'X-API-Key',
    BETYNZ_DATA_API_FIXTURES_PATH: 'search_matches?date={date}&page=1&page_size=100',
    BETYNZ_DATA_API_PAGE_SIZE: process.env.BETYNZ_DATA_API_PAGE_SIZE || '100',
    BETYNZ_DATA_API_MAX_PAGES: process.env.BETYNZ_DATA_API_MAX_PAGES || '0',
    BETYNZ_DATA_API_TIMEOUT_MS: process.env.BETYNZ_DATA_API_TIMEOUT_MS || '60000',
    BETYNZ_DATA_API_RETRIES: process.env.BETYNZ_DATA_API_RETRIES || '2',
    BETYNZ_DATA_API_ENRICH_CONCURRENCY: process.env.BETYNZ_DATA_API_ENRICH_CONCURRENCY || '2',
    BETYNZ_DATA_API_ACTION_CONCURRENCY: process.env.BETYNZ_DATA_API_ACTION_CONCURRENCY || '2',
    BETYNZ_DATA_API_ACTION_MIN_INTERVAL_MS: process.env.BETYNZ_DATA_API_ACTION_MIN_INTERVAL_MS || '250',
    BETYNZ_DATA_API_RETRY_BASE_MS: process.env.BETYNZ_DATA_API_RETRY_BASE_MS || '1000',
    BETYNZ_DATA_API_RETRY_MAX_MS: process.env.BETYNZ_DATA_API_RETRY_MAX_MS || '30000',
    BETYNZ_DATA_API_MEDIA_BASE_URL: 'https://www.sportybet.com/',
    BETYNZ_DATA_API_FIXTURE_STATS_PATH: 'get_fixture_stats',
    BETYNZ_DATA_API_TEAM_HISTORY_PATH: 'get_team_history',
    BETYNZ_DATA_API_TEAM_STREAKS_PATH: 'get_team_streaks',
    BETYNZ_DATA_API_STANDINGS_PATH: 'get_standings',
    BETYNZ_DATA_API_COMPETITION_STATS_PATH: 'get_competition_stats',
    BETYNZ_DATA_API_LIVE_PATH: 'live',
    BETYNZ_DATA_API_RESULTS_PATH: 'results',
    BETYNZ_DATA_API_EVENTS_PATH: 'events',
    BETYNZ_DATA_API_EVENT_ID_PARAM: 'event_id'
  };
}

function coreEnvironment() {
  return {
    PORT: String(corePort),
    SPORTYBET_API_KEY: internalKey,
    SPORTYBET_API_KEY_HEADER: 'X-API-Key',
    CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${webPort},https://betynz.com,https://www.betynz.com`,
    ALLOW_INTERNAL_RATE_LIMIT_BYPASS: process.env.ALLOW_INTERNAL_RATE_LIMIT_BYPASS || 'true',
    SPORTYBET_UPSTREAM_CONCURRENCY: process.env.SPORTYBET_UPSTREAM_CONCURRENCY || '2',
    SPORTYBET_UPSTREAM_MIN_INTERVAL_MS: process.env.SPORTYBET_UPSTREAM_MIN_INTERVAL_MS || '250',
    SPORTYBET_UPSTREAM_RETRIES: process.env.SPORTYBET_UPSTREAM_RETRIES || '4',
    SPORTYBET_UPSTREAM_BACKOFF_BASE_MS: process.env.SPORTYBET_UPSTREAM_BACKOFF_BASE_MS || '1000',
    SPORTYBET_UPSTREAM_BACKOFF_MAX_MS: process.env.SPORTYBET_UPSTREAM_BACKOFF_MAX_MS || '30000'
  };
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) child.kill('SIGTERM');
  const timer = setTimeout(() => {
    for (const child of children.values()) child.kill('SIGKILL');
    process.exit(exitCode);
  }, 5000);
  timer.unref();
  Promise.all([...children.values()].map(child => new Promise(resolve => child.once('exit', resolve))))
    .finally(() => process.exit(exitCode));
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
process.on('uncaughtException', error => {
  console.error('[combined] uncaught exception', error);
  shutdown(1);
});
process.on('unhandledRejection', error => {
  console.error('[combined] unhandled rejection', error);
  shutdown(1);
});

console.log(`[combined] Starting private SportyBet core on 127.0.0.1:${corePort}.`);
launch('sportybet-core', apiDirectory, coreEnvironment());
await waitForCore();
console.log(`[combined] SportyBet core is ready. Starting Betynz on 0.0.0.0:${webPort}.`);
launch('betynz-web', webDirectory, webEnvironment());
