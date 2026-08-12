import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../..');
const read=p=>readFileSync(resolve(root,p),'utf8');

assert.equal(existsSync(resolve(root,'render.yaml')),false,'Render blueprint must be removed');

const pages=read('.github/workflows/pages.yml');
const supabaseWorkflow=read('.github/workflows/supabase.yml');
const worker=read('.github/workflows/precompute.yml');
const edge=read('supabase/functions/betynz-api/index.ts');
const client=read('apps/golden/public/runtime-client.js');
const runtimeConfig=read('apps/golden/public/runtime-config.js');
const index=read('apps/golden/public/index.html');
const rated=read('apps/golden/public/highly-rated.html');
const auth=read('apps/golden/public/auth.html');
const precompute=read('apps/golden/precompute.mjs');

assert.match(pages,/actions\/deploy-pages@v4/);
assert.match(pages,/actions\/configure-pages@v5/);
assert.match(pages,/betynz\.com/);
assert.match(pages,/SUPABASE_ANON_KEY/);
assert.match(pages,/zeus-thunder-original\.mp4/);
assert.match(pages,/login\/index\.html/);
assert.match(pages,/create-account\/index\.html/);

assert.match(supabaseWorkflow,/supabase\/setup-cli@v1/);
assert.match(supabaseWorkflow,/functions deploy betynz-api/);
assert.match(supabaseWorkflow,/SUPABASE_PROJECT_REF/);
assert.match(supabaseWorkflow,/API_FOOTBALL_KEY/);

assert.match(worker,/cron:/);
assert.match(worker,/apps\/golden\/precompute\.mjs/);
assert.match(worker,/SUPABASE_SERVICE_ROLE_KEY/);
assert.match(worker,/API_FOOTBALL_KEY/);

assert.match(edge,/Deno\.serve/);
assert.match(edge,/board_snapshots/);
assert.match(edge,/prediction_ledger/);
assert.match(edge,/API_FOOTBALL_KEY/);
assert.match(edge,/\/media\/team/);
assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);

assert.match(client,/GITHUB_PAGES_SUPABASE/);
assert.match(client,/functions\/v1/);
assert.match(client,/auth\/v1/);
assert.match(client,/localStorage/);
assert.match(client,/\/api\/auth\/me/);
assert.match(client,/function rewriteCrest/);
assert.match(client,/img\.src=`\$\{apiBase\}\$\{src\}`/);
assert.match(runtimeConfig,/__SUPABASE_URL__/);
assert.match(runtimeConfig,/__SUPABASE_ANON_KEY__/);

for(const html of[index,rated,auth]){
  assert.match(html,/runtime-config\.js\?v=9\.0\.0/);
  assert.match(html,/runtime-client\.js\?v=9\.0\.0/);
}
assert.doesNotMatch(auth,/HttpOnly cookies/);
assert.match(auth,/Secure Supabase session/);

assert.match(precompute,/const DAYS=7/);
assert.match(precompute,/fixtureBoard\(date\)/);
assert.match(precompute,/goldenBoard\(date\)/);
assert.match(precompute,/settleDate\(date\)/);

console.log('GitHub Pages + Supabase-only production architecture tests passed');
