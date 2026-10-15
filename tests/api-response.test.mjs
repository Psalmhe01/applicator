import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse, ApiError } from '../src/apiResponse.mjs';

test('plain-text hosting 404 pages become actionable errors instead of JSON parser exceptions', async () => {
  const response = new Response('The page could not be found\nNOT_FOUND\nprivate-provider-body', {
    status: 404,
  });
  await assert.rejects(readApiResponse(response), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 404);
    assert.match(error.message, /API route/);
    assert.ok(!error.message.includes('private-provider-body'));
    assert.ok(!error.message.includes('Unexpected token'));
    return true;
  });
});

test('valid JSON preserves server errors and job details while HTML and timeouts stay readable', async () => {
  const job = { id: 'greenhouse-example-123', description: 'Full requirements' };
  assert.deepEqual(await readApiResponse(new Response(JSON.stringify(job))), job);
  await assert.rejects(
    readApiResponse(
      new Response(JSON.stringify({ error: 'This opening is no longer listed.' }), { status: 404 }),
    ),
    (error) => error.status === 404 && error.message === 'This opening is no longer listed.',
  );
  await assert.rejects(
    readApiResponse(new Response('<html>proxy failure</html>', { status: 502 })),
    (error) => error.status === 502 && /unreadable/.test(error.message),
  );
  await assert.rejects(
    readApiResponse(new Response('FUNCTION_INVOCATION_TIMEOUT', { status: 504 })),
    (error) => error.status === 504 && /too long/.test(error.message),
  );
});
