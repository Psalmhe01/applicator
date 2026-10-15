import test from 'node:test';
import assert from 'node:assert/strict';
import { departmentGroups, departmentOptions } from '../shared/departments.mjs';
import { normalizeOpening, selectOpenings } from '../server/openings.mjs';
import { createAdzuna } from '../server/adzuna.mjs';
import { workspaceSchema } from '../server/workspace.mjs';

test('CS groups stay distinct while engineering, healthcare and other subjects remain available', () => {
  assert.deepEqual(departmentGroups('Software Engineering Intern', 'Engineering'), [
    'software',
    'engineering',
  ]);
  assert.ok(departmentGroups('Machine Learning Intern', 'Data Science').includes('data'));
  assert.ok(
    departmentGroups('Cybersecurity Analyst Intern', 'Information Technology').includes(
      'it-security',
    ),
  );
  assert.ok(departmentGroups('Clinical Nursing Intern', 'Healthcare').includes('healthcare'));
  assert.ok(departmentGroups('Accounting Intern', 'Finance').includes('business-finance'));
  assert.ok(
    !departmentGroups('Security Guard Intern', 'Physical Security').includes('it-security'),
  );
  assert.ok(!departmentGroups('Data Entry Intern', 'Operations').includes('data'));
  assert.deepEqual(departmentGroups('General Intern', ''), ['other']);
  assert.equal(departmentOptions[0].value, 'software');
});
test('department filters combine with existing filters and profile ranking before pagination', () => {
  const source = { provider: 'greenhouse', slug: 'example', company: 'Example' };
  const jobs = Array.from({ length: 35 }, (_, i) =>
    normalizeOpening(
      {
        id: i + 1,
        title: i < 30 ? 'Software Engineering Intern' : 'Nursing Intern',
        internal_job_id: i + 1,
        absolute_url: `https://example.com/jobs/${i}`,
        location: { name: 'Remote, US' },
        departments: [{ name: i < 30 ? 'Engineering' : 'Healthcare' }],
        content: '<p>Requirements</p>',
      },
      source,
    ),
  );
  assert.equal(selectOpenings(jobs, { department: 'software' }).total, 30);
  assert.equal(selectOpenings(jobs, { department: 'software', page: 2 }).jobs.length, 6);
  const health = selectOpenings(
    jobs,
    {
      department: 'healthcare',
      q: 'Nursing',
      company: 'Example',
      work: 'Remote',
      level: 'Internship',
      sort: 'profile',
    },
    { skills: ['Nursing'] },
  );
  assert.equal(health.total, 5);
  assert.ok(health.jobs.every((job) => job.department === 'Healthcare'));
  assert.equal(health.rankingScope, 'catalog');
  assert.equal(selectOpenings(jobs, { department: '' }).total, 35);
  assert.throws(
    () => selectOpenings(jobs, { department: 'invented' }),
    (error) => error.status === 400,
  );
});
test('legacy workspaces gain safe metadata defaults and supplied department data survives validation', () => {
  const profile = {
    name: '',
    email: '',
    phone: '',
    location: '',
    website: '',
    summary: '',
    skills: [],
    education: '',
    resumeText: '',
    resumeName: '',
    experiences: [],
  };
  const legacyJob = {
    id: 'old',
    title: 'Intern',
    company: 'Example',
    location: '',
    url: '',
    description: '',
    source: '',
    updatedAt: '',
    status: 'Saved',
    createdAt: '',
    deadline: '',
    appliedAt: '',
    followUp: '',
    notes: '',
    resumes: [],
  };
  const old = workspaceSchema.parse({ version: 1, profile, jobs: [legacyJob], updatedAt: '' });
  assert.equal(old.jobs[0].department, '');
  assert.deepEqual(old.jobs[0].departmentGroups, []);
  const current = workspaceSchema.parse({
    ...old,
    jobs: [
      { ...legacyJob, department: 'Engineering', departmentGroups: ['software', 'engineering'] },
    ],
  });
  assert.equal(current.jobs[0].department, 'Engineering');
  assert.deepEqual(current.jobs[0].departmentGroups, ['software', 'engineering']);
});

test('US departments come from the provider, category filters precede paging, and categories share cache', async () => {
  const entries = new Map(),
    urls = [];
  const source = createAdzuna({
    env: { ADZUNA_APP_ID: 'test', ADZUNA_APP_KEY: 'private-test' },
    cache: {
      cacheGet: async (key) => entries.get(key),
      cacheSet: async (key, value) => entries.set(key, value),
    },
    fetcher: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.pathname.endsWith('/categories'))
        return {
          ok: true,
          json: async () => ({
            results: [
              { tag: 'healthcare-nursing-jobs', label: 'Healthcare & Nursing Jobs' },
              { tag: 'new-provider-category', label: 'New Subject Jobs' },
              { tag: 'it-jobs', label: 'IT Jobs' },
            ],
          }),
        };
      assert.equal(parsed.searchParams.get('category'), 'healthcare-nursing-jobs');
      return {
        ok: true,
        json: async () => ({
          count: 48,
          results: [
            {
              id: '1',
              title: 'Nursing Intern',
              category: { label: 'Healthcare & Nursing Jobs' },
              redirect_url: 'https://www.adzuna.com/land/ad/1',
              description: 'Clinical requirements',
            },
          ],
        }),
      };
    },
  });
  const first = await source.search({ department: 'healthcare-nursing-jobs', page: 2 });
  assert.equal(first.page, 2);
  assert.equal(first.total, 48);
  assert.ok(first.departments.some((option) => option.value === 'new-provider-category'));
  assert.equal(first.departments[0].value, 'it-jobs');
  await source.search({ department: 'healthcare-nursing-jobs', page: 3 });
  assert.equal(urls.filter((url) => url.pathname.endsWith('/categories')).length, 1);
  assert.ok(urls.some((url) => url.pathname.endsWith('/search/3')));
  await assert.rejects(source.search({ department: 'invented' }), (error) => error.status === 400);
  assert.doesNotMatch(JSON.stringify(first), /private-test/);
});
test('department metadata outages allow all-departments searches while selected-category errors stay clear', async () => {
  const source = createAdzuna({
    env: { ADZUNA_APP_ID: 'test', ADZUNA_APP_KEY: 'secret-test' },
    cache: { cacheGet: async () => null, cacheSet: async () => {} },
    fetcher: async (url) =>
      url.includes('/categories?')
        ? { ok: false, status: 503 }
        : { ok: true, json: async () => ({ count: 0, results: [] }) },
  });
  const feed = await source.search();
  assert.equal(feed.total, 0);
  assert.deepEqual(feed.departments, []);
  assert.match(feed.departmentError, /temporarily unavailable/);
  await assert.rejects(
    source.search({ department: 'it-jobs' }),
    (error) => error.status === 502 && !error.message.includes('secret-test'),
  );
});
