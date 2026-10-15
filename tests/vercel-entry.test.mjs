import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

test('the shared Vercel function handles nested API URLs and returns JSON authentication errors', async () => {
  // Isolate the function from real credentials; these requests require no external service.
  Object.assign(process.env, {
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SECRET_KEY: 'sb_secret_test',
    ADMIN_USER_ID: '11111111-1111-4111-8111-111111111111',
  });
  const { default: handler } = await import('../api/index.mjs');
  const server = createServer(handler).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(origin + '/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    for (const path of [
      '/api/openings',
      '/api/openings/greenhouse-example-123',
      '/api/admin/schema',
      '/api/admin/invitations',
    ]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 401, path);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.equal((await response.json()).error, 'Sign in to continue.');
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
