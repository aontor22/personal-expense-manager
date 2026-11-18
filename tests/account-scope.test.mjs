import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { databaseNameForUser, expenseStoreForUser } from '../src/lib/idb.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';

test('each account has a different IndexedDB namespace', () => {
  assert.notEqual(databaseNameForUser(alice), databaseNameForUser(bob));
  assert.ok(databaseNameForUser(alice).includes(alice));
  assert.ok(databaseNameForUser(bob).includes(bob));
});
test('missing or malformed auth IDs cannot access storage', () => {
  for (const bad of ['', null, undefined, '../bob', 'guest', 'alice@example.com']) {
    assert.throws(() => expenseStoreForUser(bad), /authenticated user ID/i);
  }
});
test('scoped data access functions require user ID at creation', () => {
  const store = expenseStoreForUser(alice);
  for (const name of ['getAllLocalExpenses','getLocalExpense','saveLocalExpense','deleteLocalExpense','bulkSaveLocalExpenses','getPendingLocalExpenses','getMeta','setMeta']) {
    assert.equal(typeof store[name], 'function');
  }
});
test('sync does not create a new anonymous session in the background', () => {
  const code = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');
  assert.match(code, /detectSessionInUrl:\s*true/);
  const ensureFn = code.split('export async function ensureSupabaseSession')[1];
  assert.ok(ensureFn);
  assert.doesNotMatch(ensureFn, /signInAnonymously/);
});
test('public SEO and private dashboard have separate routes', () => {
  const routes = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(routes.rewrites.some((r) => r.source === '/app' && r.destination === '/index.html'));
  assert.ok(routes.headers.some((rule) => rule.source === '/app' && rule.headers.some((header) => header.key === 'X-Robots-Tag' && header.value.includes('noindex'))));
});
test('existing Google verification & indexable public sitemap are preserved', () => {
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  assert.ok(sitemap.includes('personal-expense-manager-six.vercel.app/features.html'));
  assert.ok(!sitemap.includes('/app<'));
  assert.ok(readFileSync(new URL('../public/googleaed5d75e3e7e6e43.html', import.meta.url), 'utf8').includes('google-site-verification'));
});
