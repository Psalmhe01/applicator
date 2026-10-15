import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { load } from 'cheerio';
import { createServer } from 'vite';
import { createApp } from '../server/app.mjs';
import {
  clearAuthReturnPath,
  consumeAuthReturnPath,
  rememberAuthReturnPath,
} from '../src/authReturn.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const storeKey = Symbol.for('applicator.routing-test.store');
let server, App, AuthContext, emptyWorkspace, newJob;

before(async () => {
  // Exercise the actual App routes and page components without credentials or
  // cloud writes. Radix portals do not render on the server, so the detail stub
  // exposes only the job selected by App; it does not test modal interactions.
  server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    plugins: [
      {
        name: 'routing-test-boundaries',
        enforce: 'pre',
        resolveId(source, importer) {
          if (!importer?.replaceAll('\\', '/').endsWith('/src/App.tsx')) return;
          if (source === './useWorkspace') return '\0routing-test-workspace';
          if (source === './RoleDetail') return '\0routing-test-detail';
        },
        load(id) {
          if (id === '\0routing-test-workspace')
            return 'export function useWorkspace() { return globalThis[Symbol.for("applicator.routing-test.store")]; }';
          if (id === '\0routing-test-detail')
            return 'import { createElement } from "react"; export default function RoleDetail({ job }) { return createElement("section", { "data-routing-job": job.id }, job.title); }';
        },
      },
    ],
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, preTransformRequests: false, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ({ default: App } = await server.ssrLoadModule('/src/App.tsx'));
  ({ AuthContext } = await server.ssrLoadModule('/src/Auth.tsx'));
  ({ emptyWorkspace, newJob } = await server.ssrLoadModule('/src/model.ts'));
});

after(async () => {
  delete globalThis[storeKey];
  await server?.close();
});

function account(role) {
  return {
    user: { id: 'routing-test-user', email: 'routing@example.invalid' },
    role,
    providers: { catalog: true, adzuna: false },
    settings: {
      aiDailyLimit: 10,
      globalAiDailyLimit: 100,
      catalogEnabled: true,
      adzunaEnabled: false,
      signupEnabled: true,
    },
  };
}

function harness(path, { role = 'member', jobs = [] } = {}) {
  const workspace = emptyWorkspace();
  workspace.jobs = jobs;
  globalThis[storeKey] = {
    workspace,
    ready: true,
    saveState: 'Synthetic workspace',
    storageError: '',
    conflict: false,
    saveJob() {},
    saveProfile() {},
    removeJob() {},
    setTheme() {},
    replace() {},
    reset() {},
    async saveNow() {},
    async loadCloud() {},
  };
  const auth = {
    account: account(role),
    loading: false,
    configured: true,
    client: null,
    session: null,
    error: '',
    invite: '',
    async signOut() {},
    async recheck() {},
  };
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: createElement(AuthContext.Provider, { value: auth }, createElement(App)),
      },
    ],
    { initialEntries: [path] },
  );
  return {
    router,
    render: () => load(renderToStaticMarkup(createElement(RouterProvider, { router }))),
  };
}

function activePage($) {
  return $('aside a[aria-current="page"]')
    .map((_, el) => $(el).attr('href'))
    .get();
}

test('each major URL renders its page and marks a real navigation link active', () => {
  for (const [path, heading] of [
    ['/', 'A little momentum.'],
    ['/opportunities', 'Find your next chapter.'],
    ['/experience', 'Your experience bank.'],
    ['/tracker', 'Your application tracker.'],
    ['/settings', 'Your account, your workspace.'],
  ]) {
    const { router, render } = harness(path);
    try {
      const $ = render();
      assert.equal($('h1').first().text(), heading, path);
      assert.deepEqual(activePage($), [path], path);
      assert.equal($('nav[aria-label="Main navigation"] button').length, 0);
      assert.equal($('aside a[href="/experience"]').length > 0, true);
    } finally {
      router.dispose();
    }
  }
});

test('discovery is URL state and screen history restores saved and discovered views', async () => {
  const { router, render } = harness('/experience');
  try {
    await router.navigate('/opportunities?tab=discover');
    let $ = render();
    assert.equal($('.discovery-controls').length, 1);
    assert.deepEqual(activePage($), ['/opportunities']);
    assert.equal(
      $('nav[aria-label="Opportunity sources"] a[aria-current="page"]').attr('href'),
      '/opportunities?tab=discover',
    );
    await router.navigate('/opportunities');
    assert.equal(render()('.discovery-controls').length, 0);
    await router.navigate(-1);
    assert.equal(render()('.discovery-controls').length, 1);
    await router.navigate(-1);
    assert.match(render()('h1').text(), /Your experience bank/);
    await router.navigate(1);
    assert.equal(router.state.location.search, '?tab=discover');
    assert.equal(render()('.discovery-controls').length, 1);
    const direct = harness('/opportunities?tab=discover');
    try {
      assert.equal(direct.render()('.discovery-controls').length, 1);
    } finally {
      direct.router.dispose();
    }
  } finally {
    router.dispose();
  }
});

test('saved opportunity links select the requested job while retaining the source page', () => {
  const jobs = [
    newJob({ id: 'first-job', title: 'First synthetic role', company: 'Example' }),
    newJob({
      id: 'saved job/with punctuation',
      title: 'Linked synthetic role',
      company: 'Example',
    }),
  ];
  for (const base of ['/opportunities?tab=discover', '/tracker', '/']) {
    const separator = base.includes('?') ? '&' : '?';
    const { router, render } = harness(`${base}${separator}job=${encodeURIComponent(jobs[1].id)}`, {
      jobs,
    });
    try {
      const $ = render();
      assert.equal($('[data-routing-job]').attr('data-routing-job'), jobs[1].id);
      assert.equal($('[data-routing-job]').text(), jobs[1].title);
      assert.deepEqual(activePage($), [base.split('?')[0]]);
      if (base.includes('tab=discover')) assert.equal($('.discovery-controls').length, 1);
    } finally {
      router.dispose();
    }
  }
  const missing = harness('/opportunities?job=not-in-this-account', { jobs });
  try {
    assert.equal(missing.render()('[data-routing-job]').length, 0);
    assert.equal(missing.render()('h1').text(), 'Find your next chapter.');
  } finally {
    missing.router.dispose();
  }
});

test('owner routes enforce access and unknown routes offer a working overview link', () => {
  for (const [path, role, heading, active] of [
    ['/admin', 'member', 'Owner access required.', []],
    ['/admin', 'admin', 'A place for your people.', ['/admin']],
    ['/not-a-page/nested', 'member', 'Page not found.', []],
  ]) {
    const { router, render } = harness(path, { role });
    try {
      const $ = render();
      assert.equal($('h1').text(), heading);
      assert.deepEqual(activePage($), active);
      if (role === 'member') {
        assert.equal($('aside a[href="/admin"]').length, 0);
        assert.equal($('main a[href="/"]').text(), 'Return to overview');
      }
    } finally {
      router.dispose();
    }
  }
});

function memoryStorage(initial) {
  const values = new Map(initial === undefined ? [] : [['applicator.authReturnPath', initial]]);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('authentication return paths are local, consumed once, and tolerate unavailable storage', () => {
  const storage = memoryStorage();
  rememberAuthReturnPath(storage, '/opportunities', '?tab=discover&job=qa%2F1');
  assert.equal(consumeAuthReturnPath(storage), '/opportunities?tab=discover&job=qa%2F1');
  assert.equal(consumeAuthReturnPath(storage), null);
  rememberAuthReturnPath(storage, '/tracker');
  clearAuthReturnPath(storage);
  assert.equal(consumeAuthReturnPath(storage), null);
  rememberAuthReturnPath(storage, '/tracker');
  rememberAuthReturnPath(storage, '/');
  assert.equal(consumeAuthReturnPath(storage), null);
  for (const value of [
    'https://example.com',
    '//example.com/path',
    '/\\example.com',
    '/..//example.com',
    '/tracker#access_token=secret',
    '/\n/evil',
    ' /tracker',
  ]) {
    const unsafe = memoryStorage(value);
    assert.equal(consumeAuthReturnPath(unsafe), null, value);
    assert.equal(unsafe.getItem('applicator.authReturnPath'), null);
  }
  const unavailable = {
    getItem() {
      throw new Error('Storage blocked');
    },
    setItem() {
      throw new Error('Storage blocked');
    },
    removeItem() {
      throw new Error('Storage blocked');
    },
  };
  assert.doesNotThrow(() => rememberAuthReturnPath(unavailable, '/tracker'));
  assert.equal(consumeAuthReturnPath(unavailable), null);
  assert.doesNotThrow(() => rememberAuthReturnPath(undefined, '/tracker'));
  assert.equal(consumeAuthReturnPath(undefined), null);
});

test('production server serves nested screen URLs and keeps unknown API paths as JSON 404s', async (t) => {
  let index;
  try {
    index = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    t.skip('Run npm run build to exercise the production SPA fallback.');
    return;
  }
  const user = { id: 'routing-http-test', email: 'routing@example.invalid' };
  const platform = {
    config: { configured: false },
    identify: async () => user,
    member: async () => ({ user, role: 'member' }),
  };
  const app = createApp({
    platform,
    discovery: {},
    adzuna: {},
    ai: async () => {
      throw new Error('Unexpected AI call');
    },
  });
  const http = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      http.once('listening', resolve);
      http.once('error', reject);
    });
    const origin = `http://127.0.0.1:${http.address().port}`;
    for (const path of ['/experience', '/opportunities/some/nested/path?tab=discover']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.equal(await response.text(), index);
    }
    const unknown = await fetch(`${origin}/api/no-such-route/nested`);
    assert.equal(unknown.status, 404);
    assert.match(unknown.headers.get('content-type'), /application\/json/);
    assert.equal(typeof (await unknown.json()).error, 'string');
  } finally {
    await new Promise((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
