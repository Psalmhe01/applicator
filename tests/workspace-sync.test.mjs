import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceCacheKey, resolveWorkspaceSnapshot } from '../src/workspaceSync.mjs';
test('switching accounts uses distinct device recovery keys', () => {
  assert.notEqual(workspaceCacheKey('owner'), workspaceCacheKey('friend'));
  assert.notEqual(workspaceCacheKey('owner'), 'applicator.workspace.v1');
});
test('unsaved changes survive reload and retain their base revision through repeated conflicts', () => {
  const local = {
      workspace: { name: 'Unsaved edits' },
      revision: 1,
      dirty: true,
    },
    cloud = { workspace: { name: 'Other device' }, revision: 2 };
  const result = resolveWorkspaceSnapshot(cloud, local);
  assert.equal(result.conflict, true);
  assert.equal(result.revision, 1);
  assert.deepEqual(result.workspace, local.workspace);
  assert.equal(resolveWorkspaceSnapshot(cloud, result).conflict, true);
  const accepted = resolveWorkspaceSnapshot(cloud, local, true);
  assert.equal(accepted.conflict, false);
  assert.equal(accepted.revision, 2);
  assert.deepEqual(accepted.workspace, cloud.workspace);
});
test('an interrupted acknowledgement is recovered without overwriting newer data', () => {
  const workspace = { name: 'Already saved' };
  const resolved = resolveWorkspaceSnapshot(
    { workspace, revision: 3 },
    { workspace, revision: 2, dirty: true },
  );
  assert.equal(resolved.dirty, false);
  assert.equal(resolved.revision, 3);
  assert.equal(resolved.conflict, false);
  assert.equal(
    resolveWorkspaceSnapshot(
      { workspace: { name: 'Newer' }, revision: 4 },
      { workspace, revision: 3, dirty: false },
    ).workspace.name,
    'Newer',
  );
});
