import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { createPlatform, platformConfig, httpError } from '../server/platform.mjs';
import { settingsSchema } from '../server/workspace.mjs';
const owner = '11111111-1111-4111-8111-111111111111',
  friend = '22222222-2222-4222-8222-222222222222';
const fixture = {
  version: 1,
  profile: {
    name: 'Friend',
    email: 'friend@example.com',
    phone: '',
    location: '',
    website: '',
    summary: '',
    skills: [],
    education: '',
    resumeText: '',
    resumeName: '',
    experiences: [
      {
        id: 'p',
        kind: 'Project',
        title: 'Project',
        organization: 'University',
        dates: '2026',
        details: 'Built a Python app.',
        skills: ['Python'],
        url: '',
      },
    ],
  },
  jobs: [],
  updatedAt: '2026-10-14',
  preferences: { theme: 'System' },
};
const tokens = {
  owner: { id: owner, email: 'owner@example.com' },
  friend: { id: friend, email: 'friend@example.com' },
  revoked: { id: 'revoked', email: 'revoked@example.com' },
};
function mockPlatform() {
  const calls = { save: [], load: [], reserve: 0, accept: 0 };
  return {
    calls,
    config: {
      configured: true,
      url: 'https://example.supabase.co',
      publicKey: 'sb_publishable_example',
    },
    async identify(req) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      if (!tokens[token]) throw httpError(401, 'Sign in to continue.');
      return tokens[token];
    },
    async member(user) {
      if (user.id === 'revoked') throw httpError(403, 'Invitation required.');
      return { user, role: user.id === owner ? 'admin' : 'member' };
    },
    async settings() {
      return {
        aiDailyLimit: 10,
        globalAiDailyLimit: 100,
        catalogEnabled: true,
        adzunaEnabled: true,
      };
    },
    async load(id) {
      calls.load.push(id);
      return {
        workspace: { ...fixture, profile: { ...fixture.profile, name: id } },
        revision: 1,
      };
    },
    async save(id, data, revision) {
      calls.save.push({ id, data, revision });
      return { revision: revision + 1 };
    },
    async reserveAi() {
      calls.reserve++;
      throw httpError(429, 'Daily AI allowance reached.');
    },
    async adminOverview() {
      return { members: [], settings: {}, providers: {} };
    },
    async accept() {
      calls.accept++;
    },
  };
}
test('authenticated API enforces owner controls, user isolation, revoked access, and AI allowances', async () => {
  const platform = mockPlatform();
  let searches = 0,
    aiCalls = 0;
  const app = createApp({
    platform,
    discovery: {
      async search() {
        searches++;
        return { jobs: [] };
      },
    },
    adzuna: { configured: false },
    ai: async () => {
      aiCalls++;
      return {};
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token, body, extra = {}) =>
    fetch(base + '/api/' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    const config = await (await request('config')).json();
    assert.equal(config.publicKey, 'sb_publishable_example');
    assert.equal(config.signupEnabled, true);
    assert.equal('serviceKey' in config, false);
    assert.equal((await request('openings')).status, 401);
    assert.equal(searches, 0);
    assert.equal((await request('admin', 'friend')).status, 403);
    assert.equal((await request('admin/schema', 'friend')).status, 403);
    assert.equal((await request('admin', 'owner')).status, 200);
    assert.equal((await request('workspace', 'revoked')).status, 403);
    const read = await request(`workspace?user_id=${owner}`, 'friend');
    assert.equal(read.status, 200);
    assert.equal(platform.calls.load.at(-1), friend);
    const wrong = await request(
      'workspace',
      'friend',
      { workspace: fixture, revision: 1 },
      { 'X-Workspace-Owner': owner },
    );
    assert.equal(wrong.status, 409);
    assert.equal(platform.calls.save.length, 0);
    const saved = await request(
      'workspace',
      'friend',
      { workspace: fixture, revision: 1, user_id: owner },
      { 'X-Workspace-Owner': friend },
    );
    assert.equal(saved.status, 200);
    assert.equal(platform.calls.save[0].id, friend);
    const accepted = await request('invitations/accept', 'revoked', {
      token: 'x'.repeat(43),
    });
    assert.equal(accepted.status, 200);
    assert.equal(platform.calls.accept, 1);
    const job = {
      title: 'Intern',
      company: 'Example',
      description: 'A complete description with Python requirements.',
      location: '',
      url: 'https://example.com',
      requirementsComplete: false,
    };
    assert.equal(
      (await request('tailor', 'friend', { profile: fixture.profile, job })).status,
      400,
    );
    assert.equal(platform.calls.reserve, 0);
    assert.equal(aiCalls, 0);
    assert.equal(
      (
        await request('tailor', 'friend', {
          profile: fixture.profile,
          job: { ...job, requirementsComplete: true },
        })
      ).status,
      429,
    );
    assert.equal(aiCalls, 0);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test('verified user identity controls owner privileges; role metadata and database role labels do not', async () => {
  let checkedToken = '';
  const user = {
    id: friend,
    email: 'friend@example.com',
    user_metadata: { role: 'admin' },
  };
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          user_id: friend,
          email: user.email,
          role: 'admin',
          active: true,
        },
        error: null,
      };
    },
  };
  const db = {
    auth: {
      async getUser(token) {
        checkedToken = token;
        return { data: { user }, error: null };
      },
    },
    from() {
      return query;
    },
  };
  const platform = createPlatform({
    env: { ADMIN_USER_ID: owner },
    client: db,
  });
  const verified = await platform.identify({
    headers: { authorization: 'Bearer ' + 'signed-token-'.repeat(3) },
  });
  assert.equal(checkedToken, 'signed-token-'.repeat(3));
  assert.equal((await platform.member(verified)).role, 'member');
  await assert.rejects(platform.identify({ headers: {} }), (e) => e.status === 401);
});

test('public configuration fails closed when a secret is entered as the public key', () => {
  const base = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_example',
    ADMIN_USER_ID: owner,
  };
  assert.equal(
    platformConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example' }).configured,
    false,
  );
  assert.equal(
    platformConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example' }).configured,
    true,
  );
  assert.equal(
    platformConfig({
      ...base,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_SECRET_KEY: 'sb_secret_alias',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    }).configured,
    true,
  );
  const legacy =
    'header.' +
    Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') +
    '.signature';
  assert.equal(platformConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: legacy }).configured, false);
});

test('stale cloud saves return a conflict with both current and earlier database migrations', async () => {
  for (const code of ['PT409', '40001']) {
    const platform = createPlatform({
      env: { ADMIN_USER_ID: owner },
      client: {
        async rpc() {
          return { data: null, error: { code, message: 'Workspace conflict' } };
        },
      },
    });
    await assert.rejects(platform.save(friend, fixture, 0), (error) => error.status === 409);
  }
});

// Model membership records independently of the access logic, including conditional updates.
function membershipDb(initial = [], signupEnabled = true) {
  const rows = new Map(initial.map((row) => [row.email, { ...row }]));
  return {
    rows,
    from(table) {
      const filters = [];
      let change;
      const matches = (row) => filters.every(([key, value]) => row[key] === value);
      const query = {
        select() {
          return this;
        },
        eq(key, value) {
          filters.push([key, value]);
          return this;
        },
        is(key, value) {
          filters.push([key, value]);
          return this;
        },
        update(value) {
          change = value;
          return this;
        },
        async upsert(row, options) {
          const existing =
            options.onConflict === 'user_id'
              ? [...rows.values()].find((item) => item.user_id === row.user_id)
              : rows.get(row.email);
          if (!existing || !options.ignoreDuplicates) rows.set(row.email, { ...existing, ...row });
          return { error: null };
        },
        async maybeSingle() {
          return {
            data:
              table === 'applicator_settings'
                ? { settings: { signupEnabled } }
                : [...rows.values()].find(matches) || null,
            error: null,
          };
        },
        then(resolve, reject) {
          for (const row of rows.values()) if (matches(row)) Object.assign(row, change);
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test('public email signup enrolls ordinary members and claims unused active invitations', async () => {
  assert.equal(settingsSchema.parse({}).signupEnabled, true);
  for (const pending of [false, true]) {
    const user = { id: friend, email: 'friend@example.com', user_metadata: { role: 'admin' } };
    const db = membershipDb(
      pending
        ? [{ email: user.email, user_id: null, active: true, role: 'member', invite_digest: 'old' }]
        : [],
    );
    const platform = createPlatform({ env: { ADMIN_USER_ID: owner }, client: db });
    assert.equal((await platform.member(user)).role, 'member');
    assert.equal(db.rows.get(user.email).user_id, friend);
    assert.equal(db.rows.get(user.email).active, true);
    assert.equal((await platform.member(user)).role, 'member');
    assert.equal(db.rows.size, 1);
  }
});

test('open registration never restores revoked users; paused registration does not block the owner', async () => {
  const user = { id: friend, email: 'friend@example.com' };
  for (const existingId of [friend, null]) {
    const db = membershipDb([
      { email: user.email, user_id: existingId, role: 'member', active: false },
    ]);
    const platform = createPlatform({ env: { ADMIN_USER_ID: owner }, client: db });
    await assert.rejects(platform.member(user), (error) => error.status === 403);
    assert.equal(db.rows.get(user.email).active, false);
    assert.equal(db.rows.get(user.email).user_id, existingId);
  }
  const db = membershipDb([], false);
  const platform = createPlatform({ env: { ADMIN_USER_ID: owner }, client: db });
  await assert.rejects(platform.member(user), (error) => error.status === 403);
  assert.equal(db.rows.size, 0);
  assert.equal((await platform.member({ id: owner, email: 'owner@example.com' })).role, 'admin');
});
