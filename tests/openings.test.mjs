import test from 'node:test';
import assert from 'node:assert/strict';
import {
  careerLevel,
  workArrangement,
  normalizeOpening,
  selectOpenings,
  createDiscovery,
} from '../server/openings.mjs';
const gh = { provider: 'greenhouse', slug: 'example', company: 'Example' },
  lever = { provider: 'lever', slug: 'sample', company: 'Sample' };
const raw = {
  id: 123,
  internal_job_id: 9,
  title: 'Software Engineering Intern',
  location: { name: 'Remote, United States' },
  absolute_url: 'https://example.com/jobs/123',
  updated_at: '2026-10-01T00:00:00Z',
  content: '&lt;p&gt;Python and SQL&lt;/p&gt;',
  departments: [{ name: 'Engineering' }],
};
test('discovery uses employer metadata and decodes descriptions without confusing internal with intern', () => {
  const job = normalizeOpening(raw, gh);
  assert.equal(job.company, 'Example');
  assert.equal(job.careerLevel, 'Internship');
  assert.equal(job.workArrangement, 'Remote');
  assert.equal(job.description, 'Python and SQL');
  assert.equal(careerLevel('Internal Tools Engineer'), 'Other roles');
  assert.equal(careerLevel('New Grad Engineer'), 'Entry level');
  assert.equal(careerLevel('Co-op Software Student'), 'Internship');
  assert.equal(workArrangement('San Francisco'), 'Not specified');
  assert.equal(workArrangement('Remote / Hybrid'), 'Hybrid');
  assert.equal(normalizeOpening({ ...raw, internal_job_id: null }, gh), null);
  assert.equal(normalizeOpening({ ...raw, absolute_url: 'javascript:alert(1)' }, gh), null);
  const l = normalizeOpening(
    {
      id: 'abc',
      text: 'Junior Analyst',
      categories: { location: 'London', commitment: 'Full-time' },
      workplaceType: 'on-site',
      applyUrl: 'https://jobs.lever.co/sample/abc/apply',
      descriptionPlain: 'Role description',
      lists: [{ text: 'Requirements', content: '<li>SQL</li>' }],
      additionalPlain: 'Apply today',
    },
    lever,
  );
  assert.equal(l.updatedAt, '');
  assert.equal(l.workArrangement, 'On site');
  assert.match(l.description, /Requirements\nSQL/);
  assert.match(l.description, /Apply today/);
});
test('search combines keyword, company, location, work and career filters; sorts and paginates all roles', () => {
  const base = normalizeOpening(raw, gh),
    jobs = Array.from({ length: 60 }, (_, i) => ({
      ...base,
      id: String(i),
      title: i % 2 ? 'Junior Analyst' : 'Engineering Intern',
      careerLevel: i % 2 ? 'Entry level' : 'Internship',
      company: i % 3 ? 'Zed' : 'Alpha',
    }));
  jobs.push({
    ...base,
    id: 'senior',
    title: 'Senior Architect',
    careerLevel: 'Other roles',
    company: 'Alpha',
  });
  assert.equal(selectOpenings(jobs).total, 60);
  assert.equal(selectOpenings(jobs, { level: 'All' }).total, 61);
  const result = selectOpenings(jobs, {
    q: 'Engineering Intern',
    company: 'Alpha',
    location: 'united',
    work: 'Remote',
    level: 'Internship',
    sort: 'title',
  });
  assert.equal(result.total, 10);
  assert.equal(selectOpenings(jobs, { q: 'missing' }).total, 0);
  const page = selectOpenings(jobs, { level: 'All', page: 2, sort: 'company' });
  assert.equal(page.jobs.length, 24);
  assert.equal(page.pages, 3);
  assert.equal(page.page, 2);
  assert.equal(selectOpenings(jobs, { level: 'All', page: 999 }).page, 3);
});
test('automatic feeds share cache, tolerate partial failures, recheck full details and drop closed jobs', async () => {
  let clock = 1_000_000,
    calls = 0,
    closed = false;
  const full = 'Python requirements. '.repeat(150);
  const discovery = createDiscovery({
    catalog: [gh, lever],
    now: () => clock,
    fetcher: async (url) => {
      calls++;
      if (url.includes('api.lever.co')) return { ok: false, status: 503 };
      if (url.includes('/jobs/123'))
        return closed
          ? { ok: false, status: 404 }
          : { ok: true, json: async () => ({ ...raw, content: full }) };
      return {
        ok: true,
        json: async () => ({ jobs: closed ? [] : [{ ...raw, content: full }] }),
      };
    },
  });
  const [a, b] = await Promise.all([discovery.search(), discovery.search()]);
  assert.equal(calls, 2);
  assert.equal(a.total, 1);
  assert.equal(b.total, 1);
  assert.deepEqual(a.failed, ['Sample']);
  assert.equal(a.sourceCount, 1);
  assert.equal(a.jobs[0].description.length, 1000);
  await discovery.search({ q: 'Engineering' });
  await discovery.search({ refresh: '1' });
  assert.equal(calls, 2);
  const detail = await discovery.detail(a.jobs[0].id);
  assert.ok(detail.description.length > 1000);
  assert.equal(calls, 3);
  assert.equal('postingId' in detail, false);
  closed = true;
  await assert.rejects(discovery.detail(a.jobs[0].id), /no longer listed/);
  clock += 16 * 60000;
  assert.equal((await discovery.search()).total, 0);
  await assert.rejects(discovery.detail(a.jobs[0].id), /no longer listed/);
});
test('a total board outage reports an error rather than presenting fake or stale listings', async () => {
  const discovery = createDiscovery({
    catalog: [gh],
    fetcher: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(discovery.search(), /Could not reach/);
});

test('a cold job-details request fetches only its employer posting without loading the feed', async () => {
  const urls = [];
  const discovery = createDiscovery({
    catalog: [gh, lever],
    fetcher: async (url) => {
      urls.push(url);
      assert.equal(url, 'https://boards-api.greenhouse.io/v1/boards/example/jobs/123?content=true');
      return new Response(JSON.stringify(raw), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  const detail = await discovery.detail('greenhouse-example-123');
  assert.equal(detail.title, raw.title);
  assert.equal(detail.description, 'Python and SQL');
  assert.equal(urls.length, 1);
  await assert.rejects(
    discovery.detail('greenhouse-unlisted-company-123'),
    (error) => error.status === 404,
  );
  await assert.rejects(
    discovery.detail('greenhouse-example-../123'),
    (error) => error.status === 404,
  );
  assert.equal(urls.length, 1);
});

test('cold details support Lever IDs and reject mismatched or unreadable provider replies', async () => {
  const posting = {
    id: 'abc-123',
    text: 'Engineering Intern',
    applyUrl: 'https://example.com/apply',
    descriptionPlain: 'Full requirements',
  };
  let invalid = false;
  const discovery = createDiscovery({
    catalog: [lever],
    fetcher: async (url) => {
      assert.equal(url, 'https://api.lever.co/v0/postings/sample/abc-123?mode=json');
      return invalid
        ? new Response('The page could not be found', { headers: { 'Content-Type': 'text/plain' } })
        : new Response(JSON.stringify(posting));
    },
  });
  assert.equal((await discovery.detail('lever-sample-abc-123')).description, 'Full requirements');
  posting.id = 'different-id';
  await assert.rejects(discovery.detail('lever-sample-abc-123'), (error) => error.status === 404);
  invalid = true;
  await assert.rejects(
    discovery.detail('lever-sample-abc-123'),
    (error) => error.status === 502 && /unreadable/.test(error.message),
  );
});
