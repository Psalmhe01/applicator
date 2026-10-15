import test from 'node:test';
import assert from 'node:assert/strict';
import { publicIPv4, validatePublicUrl, fetchPublicPage } from '../server/security.mjs';
import { extractJob, groundGenerated, generatedSchema } from '../server/domain.mjs';
import { generateJson } from '../server/gemini.mjs';

test('job links cannot read loopback, private networks, or credentials', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.9',
    '172.16.5.1',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
  ])
    assert.equal(publicIPv4(address), false);
  assert.equal(publicIPv4('8.8.8.8'), true);
  for (const url of [
    'file:///etc/passwd',
    'http://example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://user:password@example.com',
    'https://example.com:8080',
  ])
    assert.throws(() => validatePublicUrl(url));
  assert.equal(validatePublicUrl('https://example.com/careers').hostname, 'example.com');
  await assert.rejects(fetchPublicPage('https://127.0.0.1'), /public HTTPS/);
});
test('imports structured job data and removes executable markup', () => {
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify({
      '@graph': [
        {
          '@type': 'JobPosting',
          title: 'Engineering Intern',
          hiringOrganization: { name: 'Example Company' },
          description: '<h2>Requirements</h2><p>Python and SQL</p><script>steal()</script>',
          jobLocation: { address: { addressLocality: 'Chicago' } },
        },
      ],
    }).replace(/</g, '\\u003c') +
    '</script><h1>Wrong heading</h1>';
  const result = extractJob(html, 'https://example.com/job');
  assert.equal(result.title, 'Engineering Intern');
  assert.equal(result.company, 'Example Company');
  assert.equal(result.location, 'Chicago');
  assert.match(result.description, /Python and SQL/);
  assert.doesNotMatch(result.description, /steal/);
});
const profile = {
  name: 'Zoë Example',
  email: 'test@example.com',
  phone: '',
  location: '',
  website: '',
  education: 'BSc Computer Science',
  skills: ['Python'],
  experiences: [
    {
      id: 'source-1',
      kind: 'Project',
      title: 'Transit app',
      organization: 'University',
      dates: '2025',
      url: '',
      details: 'Built a Python transit app.',
      skills: ['SQL'],
    },
  ],
};
const generated = {
  summary: 'Student building transit tools.',
  skills: ['Python', 'Kubernetes'],
  entries: [
    {
      sourceId: 'source-1',
      bullets: ['Built a Python transit app.'],
      reason: 'Relevant Python experience.',
    },
  ],
  matches: ['Python'],
  gaps: [],
  changes: ['Emphasized Python project.'],
};
test('AI titles and dates come from the actual source; unsupported skills are excluded', () => {
  const result = groundGenerated(profile, generated);
  assert.equal(result.entries[0].title, 'Transit app');
  assert.equal(result.entries[0].dates, '2025');
  assert.deepEqual(result.skills, ['Python']);
  const reordered = groundGenerated(profile, {
    ...generated,
    skills: ['SQL', 'Kubernetes', 'Python'],
  });
  assert.deepEqual(reordered.skills, ['SQL', 'Python']);
  assert.match(result.gaps[0], /Kubernetes/);
  assert.equal(result.name, 'Zoë Example');
  assert.throws(
    () =>
      groundGenerated(profile, {
        ...generated,
        entries: [{ ...generated.entries[0], sourceId: 'invented' }],
      }),
    /unrecognized/,
  );
  assert.throws(
    () =>
      groundGenerated(profile, {
        ...generated,
        entries: [generated.entries[0], generated.entries[0]],
      }),
    /unrecognized/,
  );
});
test('Gemini request keeps the key in a header, supplies a schema, and validates JSON', async () => {
  let calls = 0;
  const result = await generateJson('Use only real facts.', { profile }, generatedSchema, {
    apiKey: 'test-key',
    fetcher: async (url, options) => {
      calls++;
      assert.doesNotMatch(url, /test-key/);
      assert.equal(options.headers['x-goog-api-key'], 'test-key');
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      assert.equal(body.generationConfig.responseJsonSchema.type, 'object');
      assert.match(body.systemInstruction.parts[0].text, /untrusted/);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: JSON.stringify(generated) }] },
            },
          ],
        }),
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.entries[0].sourceId, 'source-1');
});
test('quota exhaustion and invalid AI output fail cleanly without retrying', async () => {
  let calls = 0;
  await assert.rejects(
    generateJson('x', {}, generatedSchema, {
      apiKey: 'test-key',
      fetcher: async () => {
        calls++;
        return { ok: false, status: 429 };
      },
    }),
    /quota reached/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    generateJson('x', {}, generatedSchema, {
      apiKey: 'test-key',
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ text: '{"unexpected":true}' }] },
            },
          ],
        }),
      }),
    }),
    /invalid draft/,
  );
  await assert.rejects(
    generateJson('x', {}, generatedSchema, {
      apiKey: 'test-key',
      fetcher: async () => ({
        ok: true,
        json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }),
      }),
    }),
    /did not complete/,
  );
  await assert.rejects(generateJson('x', {}, generatedSchema, { apiKey: '' }), /not connected/);
});

test('local API rejects cross-site use and validates requests without exposing a key', async () => {
  process.env.NODE_ENV = 'test';
  const { createApp } = await import('../server/app.mjs');
  const app = createApp({
    platform: {
      config: {
        configured: true,
        url: 'https://example.supabase.co',
        publicKey: 'public-test',
      },
      identify: async () => ({ id: 'test-user', email: 'test@example.com' }),
      member: async (user) => ({ user, role: 'member' }),
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const data = await health.json();
    assert.equal(data.ok, true);
    assert.equal('apiKey' in data, false);
    const cross = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(cross.status, 403);
    const csrf = await fetch(`${base}/api/tailor`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    assert.equal(csrf.status, 415);
    const invalid = await fetch(`${base}/api/tailor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(invalid.status, 400);
    const privateLink = await fetch(`${base}/api/import-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://127.0.0.1/secrets' }),
    });
    assert.equal(privateLink.status, 500);
    assert.match((await privateLink.json()).error, /public HTTPS/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
