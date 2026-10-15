import test from 'node:test';
import assert from 'node:assert/strict';
import { rankOpenings } from '../server/relevance.mjs';
import { selectOpenings } from '../server/openings.mjs';
import { createApp } from '../server/app.mjs';

const job = (id, title, description = '') => ({
  id,
  title,
  description,
  company: 'Example',
  location: 'Remote',
  department: '',
  careerLevel: 'Internship',
  workArrangement: 'Remote',
  updatedAt: '2026-10-14',
});
test('profile sorting respects whole skills, punctuation and aliases without duplicate weighting', () => {
  const jobs = [
    job('js', 'JavaScript Intern'),
    job('java', 'Java Intern'),
    job('cpp', 'C++ Intern', 'C# and .NET'),
    job('ml', 'Machine-learning Intern'),
  ];
  const profile = { skills: ['Java', 'C++', 'C#', '.NET', 'Machine Learning'], experiences: [] };
  const result = rankOpenings(jobs, profile);
  assert.equal(result.jobs[0].id, 'cpp');
  assert.deepEqual(result.jobs.find((j) => j.id === 'js').profileMatch.skills, []);
  assert.deepEqual(result.jobs.find((j) => j.id === 'ml').profileMatch.skills, [
    'Machine Learning',
  ]);
  assert.deepEqual(
    rankOpenings(jobs, { ...profile, skills: [...profile.skills, 'CPP', 'c++', 'Java'] }).jobs,
    result.jobs,
  );
  assert.deepEqual(rankOpenings(jobs, { skills: ['JS'] }).jobs[0].profileMatch.skills, ['JS']);
  assert.ok(jobs.every((j) => !j.profileMatch));
});
test('project skills and structured text provide reasons; empty and contact-only profiles remain neutral', () => {
  const jobs = [
    job('contact', 'Jane Acme Intern'),
    job('python', 'Python Intern', 'Data analysis'),
    job('finance', 'Accounting Intern'),
  ];
  const profile = {
    skills: [],
    education: 'Accounting',
    experiences: [{ title: 'Data analysis', skills: ['Python'], details: 'Created a dashboard' }],
  };
  const result = rankOpenings(jobs, profile);
  assert.equal(result.jobs[0].id, 'python');
  assert.deepEqual(result.jobs[0].profileMatch.skills, ['Python']);
  assert.ok(
    result.jobs.find((j) => j.id === 'finance').profileMatch.keywords.includes('accounting'),
  );
  const contacts = {
    name: 'Jane',
    email: 'jane@acme.example',
    location: 'Acme',
    resumeText: 'Python',
    experiences: [{ organization: 'Acme', dates: '2026', skills: [] }],
  };
  assert.equal(rankOpenings(jobs, contacts).available, false);
  assert.deepEqual(
    rankOpenings(jobs, {}).jobs.map((j) => j.id),
    jobs.map((j) => j.id),
  );
});
test('company-board profile sorting runs before pagination, preserves filters and does not mutate the shared snapshot', () => {
  const jobs = Array.from({ length: 30 }, (_, i) => job(String(i), 'Marketing Intern'));
  jobs[29] = { ...job('best', 'Python Intern'), updatedAt: '2025-01-01' };
  const first = selectOpenings(
    jobs,
    { level: 'Internship', sort: 'profile', page: 1 },
    { skills: ['Python'] },
  );
  const second = selectOpenings(
    jobs,
    { level: 'Internship', sort: 'profile', page: 2 },
    { skills: ['Python'] },
  );
  assert.equal(first.jobs[0].id, 'best');
  assert.equal(first.rankingScope, 'catalog');
  assert.equal(first.total, 30);
  assert.ok(!second.jobs.some((j) => j.id === 'best'));
  assert.equal(
    selectOpenings(jobs, { sort: 'profile', company: 'Different' }, { skills: ['Python'] }).total,
    0,
  );
  assert.equal(selectOpenings(jobs, { sort: 'profile' }, {}).profileRankingAvailable, false);
  assert.ok(jobs.every((j) => !j.profileMatch));
});
test('authenticated ranking uses only the current account and keeps personalized data out of provider queries and caches', async () => {
  const sourceJobs = [job('java', 'Java Intern'), job('python', 'Python Intern')];
  const profiles = { one: { skills: ['Python'] }, two: { skills: ['Java'] } };
  const loads = [],
    queries = [],
    catalogProfiles = [];
  const platform = {
    config: { configured: true, url: '', publicKey: '' },
    identify: async (req) => ({ id: req.headers.authorization.replace('Bearer ', '') }),
    member: async (user) => ({ user, role: 'member' }),
    settings: async () => ({ catalogEnabled: true, adzunaEnabled: true }),
    load: async (id) => {
      loads.push(id);
      return { workspace: { profile: profiles[id] } };
    },
  };
  const server = createApp({
    platform,
    discovery: {
      search: async (_params, profile) => {
        catalogProfiles.push(profile);
        return { jobs: [] };
      },
    },
    adzuna: {
      search: async (params) => {
        queries.push({ ...params });
        return { jobs: sourceJobs, page: 2, pages: 3 };
      },
    },
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const id of ['one', 'two']) {
      const response = await fetch(
        `${origin}/api/openings?sort=profile&provider=adzuna&page=2&user_id=someone-else`,
        { headers: { Authorization: `Bearer ${id}` } },
      );
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.rankingScope, 'page');
      assert.equal(result.jobs[0].id, id === 'one' ? 'python' : 'java');
      assert.equal(loads.at(-1), id);
      assert.equal(result.page, 2);
    }
    assert.ok(sourceJobs.every((j) => !j.profileMatch));
    assert.ok(
      queries.every((query) => query.sort === 'relevance' && !query.profile && !query.skills),
    );
    await fetch(`${origin}/api/openings?sort=profile`, {
      headers: { Authorization: 'Bearer one' },
    });
    assert.equal(catalogProfiles[0], profiles.one);
    const oldLoads = loads.length;
    await fetch(`${origin}/api/openings?sort=updated&provider=adzuna`, {
      headers: { Authorization: 'Bearer two' },
    });
    assert.equal(loads.length, oldLoads);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
