import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdzuna } from '../server/adzuna.mjs';
test('US search covers provider employers, uses supported filters, shares cache, and labels incomplete requirements', async () => {
  const entries = new Map();
  let requests = 0,
    reserves = 0;
  const cache = {
    async cacheGet(key) {
      return entries.get(key) || null;
    },
    async cacheSet(key, data) {
      entries.set(key, data);
    },
  };
  const source = createAdzuna({
    env: { ADZUNA_APP_ID: 'test-id', ADZUNA_APP_KEY: 'test-private-key' },
    cache,
    reserve: async () => {
      reserves++;
    },
    fetcher: async (url) => {
      requests++;
      const u = new URL(url);
      if (u.pathname.endsWith('/categories'))
        return {
          ok: true,
          json: async () => ({
            results: [
              { tag: 'healthcare-nursing-jobs', label: 'Healthcare & Nursing Jobs' },
              { tag: 'it-jobs', label: 'IT Jobs' },
            ],
          }),
        };
      assert.match(u.pathname, /jobs\/us\/search\/2$/);
      assert.equal(u.searchParams.get('company'), 'Some new employer');
      assert.equal(u.searchParams.get('sort_by'), 'relevance');
      assert.equal(u.searchParams.get('category'), 'it-jobs');
      assert.match(u.searchParams.get('what_or'), /graduate/);
      assert.match(u.searchParams.get('what'), /Python remote/);
      return {
        ok: true,
        json: async () => ({
          count: 25,
          results: [
            {
              id: '42',
              title: '<b>Junior Engineer</b>',
              company: { display_name: 'Some new employer' },
              location: { display_name: 'Remote, US' },
              description: '<p>A short Python description snippet.</p>',
              category: { label: 'IT Jobs', tag: 'it-jobs' },
              redirect_url: 'http://www.adzuna.com/land/ad/42',
              created: '2026-10-14T00:00:00Z',
            },
            {
              id: 'unsafe',
              title: 'Other job',
              redirect_url: 'https://evil.example/jobs/1',
            },
          ],
        }),
      };
    },
  });
  const params = {
    page: 2,
    q: 'Python',
    level: 'Early career',
    company: 'Some new employer',
    work: 'Remote',
    sort: 'relevance',
    department: 'it-jobs',
  };
  const [a, b] = await Promise.all([source.search(params), source.search(params)]);
  assert.equal(requests, 2);
  assert.equal(reserves, 2);
  assert.equal(a.total, 25);
  assert.equal(b.jobs.length, 1);
  assert.equal(a.jobs[0].requirementsComplete, false);
  assert.equal(a.jobs[0].company, 'Some new employer');
  assert.equal(a.departments[0].value, 'it-jobs');
  assert.equal(a.jobs[0].department, 'IT Jobs');
  assert.ok(a.jobs[0].url.startsWith('https://www.adzuna.com'));
  assert.doesNotMatch(JSON.stringify(a), /test-private-key/);
  await source.search(params);
  assert.equal(requests, 2);
  assert.equal((await source.detail('adzuna-42')).description, a.jobs[0].description);
  await assert.rejects(source.detail('expired-id'), (e) => e.status === 404);
});
test('provider credentials and error payloads never reach clients', async () => {
  const cache = {
    async cacheGet() {
      return null;
    },
    async cacheSet() {},
  };
  await assert.rejects(createAdzuna({ env: {}, cache }).search(), (e) => e.status === 503);
  const source = createAdzuna({
    env: { ADZUNA_APP_ID: 'id', ADZUNA_APP_KEY: 'secret-test-key' },
    cache,
    fetcher: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'secret-test-key' }),
    }),
  });
  await assert.rejects(source.search(), (e) => {
    assert.doesNotMatch(e.message, /secret-test-key/);
    return e.status === 502;
  });
});
