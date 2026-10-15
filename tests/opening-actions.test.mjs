import test from 'node:test';
import assert from 'node:assert/strict';
import { selectOpening } from '../src/openingActions.mjs';
const listing = {
  id: 'greenhouse-example-123',
  url: 'https://example.com/jobs/123',
  description: 'Listing excerpt',
};
const full = {
  ...listing,
  description: 'Complete employer requirements',
  createdAt: 'original-feed-time',
};
function actions() {
  const calls = { load: [], save: [], open: [], preview: [] };
  return {
    calls,
    load: async (id) => {
      calls.load.push(id);
      return full;
    },
    save: (job) => calls.save.push(job),
    open: (job) => calls.open.push(job),
    preview: (job) => calls.preview.push(job),
  };
}
test('viewing an unsaved discovery result previews full details without saving or opening a saved workspace', async () => {
  const api = actions(),
    jobs = [];
  assert.equal(await selectOpening(listing, jobs, 'view', api), 'previewed');
  assert.deepEqual(api.calls.load, [listing.id]);
  assert.deepEqual(api.calls.preview, [full]);
  assert.deepEqual(api.calls.save, []);
  assert.deepEqual(api.calls.open, []);
  assert.deepEqual(jobs, []);
  assert.equal(full.createdAt, 'original-feed-time');
});
test('an explicit bookmark action saves the fetched full details exactly once', async () => {
  const api = actions();
  assert.equal(await selectOpening(listing, [], 'save', api), 'saved');
  assert.equal(api.calls.save.length, 1);
  assert.equal(api.calls.save[0].description, full.description);
  assert.ok(Number.isFinite(Date.parse(api.calls.save[0].createdAt)));
  assert.deepEqual(api.calls.open, []);
  assert.deepEqual(api.calls.preview, []);
  assert.equal(full.createdAt, 'original-feed-time');
});
test('existing jobs are opened intact by ID or application URL without refetching or saving over edits', async () => {
  for (const sameId of [true, false]) {
    const saved = {
      ...full,
      id: sameId ? listing.id : 'manually-added-id',
      notes: 'Keep my notes',
      resumes: [{ id: 'my-resume' }],
    };
    const api = actions();
    assert.equal(await selectOpening(listing, [saved], 'view', api), 'opened');
    assert.deepEqual(api.calls.open, [saved]);
    assert.equal(await selectOpening(listing, [saved], 'save', api), 'already-saved');
    assert.deepEqual(api.calls.load, []);
    assert.deepEqual(api.calls.save, []);
    assert.deepEqual(api.calls.preview, []);
    assert.equal(saved.notes, 'Keep my notes');
  }
});
test('failed detail fetches do not create saved jobs or incomplete previews', async () => {
  for (const intent of ['view', 'save']) {
    const api = actions();
    api.load = async () => {
      throw new Error('Opening no longer listed');
    };
    await assert.rejects(selectOpening(listing, [], intent, api), /no longer listed/);
    assert.deepEqual(api.calls.save, []);
    assert.deepEqual(api.calls.preview, []);
    assert.deepEqual(api.calls.open, []);
  }
});
