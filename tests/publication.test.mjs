import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPublication } from '../admin/publication.mjs';
test('public verification retries stale CDN and failures, without issuing writes', async () => {
  const replies = [null, { movimientos: [] }, { movimientos: [{ id: 'saved' }] }];
  let reads = 0, sleeps = 0;
  assert.equal(await waitForPublication('https://example.com/cars.json', d => d.movimientos.some(e => e.id === 'saved'), {
    attempts: 3, sleep: async () => sleeps++, fetcher: async (url, options) => {
      assert.equal(options.cache, 'no-store'); assert(!options.method); assert(url.includes('publication='));
      const value = replies[reads++]; if (!value) throw Error('offline');
      return { ok: true, json: async () => value };
    },
  }), true);
  assert.equal(reads, 3); assert.equal(sleeps, 2);
});
test('unpublished changes never report success and retries are bounded', async () => {
  let reads = 0;
  assert.equal(await waitForPublication('https://example.com/site-content.json', () => false, {
    attempts: 2, sleep: async () => {}, fetcher: async () => { reads++; return {ok:false}; },
  }), false);
  assert.equal(reads, 2);
});
