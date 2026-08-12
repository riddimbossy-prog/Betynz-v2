import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authHtml=readFileSync(new URL('./public/auth.html',import.meta.url),'utf8');
const authCss=readFileSync(new URL('./public/auth.css',import.meta.url),'utf8');
const authJs=readFileSync(new URL('./public/auth.js',import.meta.url),'utf8');
const accountJs=readFileSync(new URL('./public/account.js',import.meta.url),'utf8');
const accountCss=readFileSync(new URL('./public/account.css',import.meta.url),'utf8');
const authServer=readFileSync(new URL('./auth.mjs',import.meta.url),'utf8');
const server=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const rated=readFileSync(new URL('./public/highly-rated.html',import.meta.url),'utf8');

assert.match(authHtml,/zeus-board-loading\.jpg/);
assert.match(authHtml,/THE GATES OF OLYMPUS/);
assert.match(authHtml,/id="loginTab"/);
assert.match(authHtml,/id="signupTab"/);
assert.match(authHtml,/Send Secure Login Link/);
assert.match(authHtml,/Create Account/);
assert.doesNotMatch(authHtml,/type="password"/);
assert.match(authCss,/backdrop-filter:blur\(42px\)/);
assert.match(authCss,/\.zeus-stage__image/);
assert.match(authCss,/@media\(max-width:560px\)/);
assert.match(authCss,/prefers-reduced-motion/);

assert.match(authJs,/\/api\/auth\/login-link/);
assert.match(authJs,/\/api\/auth\/signup-link/);
assert.match(authJs,/\/api\/auth\/session/);
assert.match(authJs,/location\.pathname==='\/create-account'/);
assert.doesNotMatch(authJs,/SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(authJs,/SUPABASE_ANON_KEY/);

assert.match(authServer,/create_user:Boolean\(createUser\)/);
assert.match(authServer,/HttpOnly/);
assert.match(authServer,/SameSite=Lax/);
assert.match(authServer,/Secure/);
assert.match(authServer,/AUTH_MAX_ATTEMPTS=10/);
assert.match(authServer,/token\?grant_type=refresh_token/);
assert.doesNotMatch(authServer,/grant_type=password/);
assert.doesNotMatch(authServer,/validPassword/);

assert.match(server,/\/api\/auth\/login-link/);
assert.match(server,/\/api\/auth\/signup-link/);
assert.match(server,/\/api\/auth\/session/);
assert.match(server,/\/api\/auth\/me/);
assert.match(server,/\/api\/auth\/logout/);
assert.match(server,/url\.pathname==='\/login'\|\|url\.pathname==='\/create-account'/);
assert.match(server,/'set-cookie'/);

for(const html of[index,rated]){
  assert.match(html,/account\.css\?v=8\.0\.0/);
  assert.match(html,/data-account-login/);
  assert.match(html,/data-account-create/);
  assert.match(html,/account\.js\?v=8\.0\.0/);
}
assert.match(accountJs,/\/api\/auth\/me/);
assert.match(accountJs,/data-account-login/);
assert.match(accountCss,/\.header-actions/);
assert.match(accountCss,/@media\(max-width:620px\)/);

console.log('Zeus passwordless account UI + secure Supabase session wiring tests passed');
