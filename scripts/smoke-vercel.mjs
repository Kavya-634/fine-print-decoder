// Run against Vercel dev, not Vite. Optional live public fetch is explicit;
// other checks make no outbound request. Start a fresh dev instance or wait a
// minute first so earlier manual requests do not exhaust the local limiter.
import assert from 'node:assert/strict';

const base = process.env.POLICY_API_BASE ?? 'http://127.0.0.1:3000';
const endpoint = new URL('/api/fetch-policy', base);
async function call(body, options = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(27_000),
    ...options,
  });
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  return { response, data: await response.json() };
}
const method = await fetch(endpoint);
assert.equal(method.status, 405);
const blocked = await call({ url: 'http://127.0.0.1/' });
assert.equal(blocked.response.status, 400);
assert.equal(blocked.data.code, 'BLOCKED_URL');
assert.equal(blocked.response.headers.get('cache-control'), 'no-store');
const invalid = await call({ url: 'https://example.com', extra: 'not permitted' });
assert.equal(invalid.response.status, 400);
const crossSite = await call(
  { url: 'https://example.com' },
  { headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.invalid' } }
);
assert.equal(crossSite.response.status, 403);
if (process.env.POLICY_LIVE_URL) {
  const live = await call({ url: process.env.POLICY_LIVE_URL });
  assert.equal(live.response.status, 200, JSON.stringify(live.data));
  assert.ok(live.data.pages.length >= 1);
  for (const page of live.data.pages) assert.ok(page.text.length >= 160);
  console.log(
    'Live extraction:',
    live.data.pages.map(({ kind, url, text }) => ({ kind, url, characters: text.length })),
    live.data.warnings
  );
} else await call({ url: 'http://127.0.0.1/' });
const limited = await call({ url: 'http://127.0.0.1/' });
// Vercel dev may reload the module for every invocation; cloud instances also
// do not share counters. Unit tests verify the limiter deterministically.
assert.ok([400, 429].includes(limited.response.status));
if (limited.response.status === 429)
  assert.equal(limited.response.headers.get('retry-after'), '60');
else
  console.log(
    'This dev worker did not reuse its limiter. Enable edge rate limits before public deployment.'
  );
console.log('Vercel API smoke checks passed: routing, method, SSRF, schema, origin, and no-store.');
