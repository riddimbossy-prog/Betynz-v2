import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { upcoming } from '../src/sportybet.mjs';

function restoreEnv(previous) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('SportyBet pagination continues beyond ten pages until the day is exhausted', async t => {
  const kickoff = Date.parse('2036-01-10T15:00:00Z');
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const page = Number(url.searchParams.get('page') || 1);
    const count = page <= 11 ? 20 : page === 12 ? 3 : 0;
    const events = Array.from({ length: count }, (_, index) => ({
      eventId: `sr:match:${page}-${index}`,
      estimateStartTime: kickoff + index * 60000,
      homeTeamName: `Home ${page}-${index}`,
      awayTeamName: `Away ${page}-${index}`,
      tournamentName: 'No Cap League',
      categoryName: 'Ghana',
      eventStatusDesc: 'Not start',
      markets: [{ id: '1', desc: '1X2', outcomes: [
        { desc: 'Home', odd: '1.70' }, { desc: 'Draw', odd: '3.50' }, { desc: 'Away', odd: '4.80' }
      ] }]
    }));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: { events } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const keys = ['SPORTYBET_ALLOW_TEST_HOST','SPORTYBET_PUBLIC_UPCOMING_URL','SPORTYBET_PAGE_SIZE','SPORTYBET_MAX_PAGES','SPORTYBET_CACHE_TTL_SECONDS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    SPORTYBET_ALLOW_TEST_HOST: 'true',
    SPORTYBET_PUBLIC_UPCOMING_URL: `http://127.0.0.1:${server.address().port}/upcoming?page={page}&page_size={page_size}`,
    SPORTYBET_PAGE_SIZE: '20',
    SPORTYBET_MAX_PAGES: '0',
    SPORTYBET_CACHE_TTL_SECONDS: '1'
  });
  t.after(() => restoreEnv(previous));

  const feed = await upcoming({ date: '2036-01-10', force: true });
  assert.equal(feed.events.length, 223);
  assert.equal(feed.audits.length, 12);
  assert.equal(feed.audits.at(-1).count, 3);
});
