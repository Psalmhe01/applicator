import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { workspaceSchema as serverWorkspaceSchema } from '../server/workspace.mjs';

let server, client;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true, preTransformRequests: false, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  client = await server.ssrLoadModule('/src/model.ts');
});

after(async () => {
  await server?.close();
});

function fixture(layout) {
  const workspace = client.emptyWorkspace();
  workspace.profile.name = 'Example Applicant';
  const resume = client.manualResume(workspace.profile);
  if (layout === undefined) delete resume.layout;
  else resume.layout = layout;
  workspace.jobs = [
    client.newJob({ title: 'Example role', company: 'Example', resumes: [resume] }),
  ];
  return workspace;
}

test('legacy resume versions default to the current layout on both client and server', () => {
  const legacy = fixture();
  for (const schema of [client.workspaceSchema, serverWorkspaceSchema]) {
    assert.equal(schema.parse(legacy).jobs[0].resumes[0].layout, 'current');
  }
  assert.equal(Object.hasOwn(legacy.jobs[0].resumes[0], 'layout'), false);
  assert.equal(client.manualResume(legacy.profile).layout, 'current');
  assert.equal(client.resumeSchema.parse(legacy.jobs[0].resumes[0]).layout, 'current');
});

test('both layouts survive cloud validation, JSON backup, and client import', () => {
  for (const layout of ['current', 'classic']) {
    const workspace = fixture(layout);
    const local = client.workspaceSchema.parse(workspace);
    const cloud = serverWorkspaceSchema.parse(local);
    const imported = client.workspaceSchema.parse(JSON.parse(JSON.stringify(cloud)));
    assert.equal(imported.jobs[0].resumes[0].layout, layout);
    assert.deepEqual(imported, local);
    assert.deepEqual(serverWorkspaceSchema.parse(imported), cloud);
  }
});

test('unsupported resume layouts are rejected rather than silently losing the selected format', () => {
  for (const layout of ['modern', 'Classic', '', null, 1]) {
    const workspace = fixture(layout);
    for (const schema of [client.workspaceSchema, serverWorkspaceSchema]) {
      const result = schema.safeParse(workspace);
      assert.equal(result.success, false, `Unsupported layout: ${String(layout)}`);
      assert.deepEqual(result.error.issues[0].path, ['jobs', 0, 'resumes', 0, 'layout']);
    }
  }
});

test('submitted resume layout and version metadata survive a workspace backup roundtrip', () => {
  const workspace = fixture('classic');
  const job = workspace.jobs[0],
    resume = job.resumes[0];
  resume.reviewed = true;
  resume.downloadedAt = '2026-10-14T18:00:00.000Z';
  job.status = 'Applied';
  job.appliedAt = '2026-10-14';
  job.appliedResumeId = resume.id;
  const imported = client.workspaceSchema.parse(
    JSON.parse(JSON.stringify(serverWorkspaceSchema.parse(workspace))),
  );
  const submitted = imported.jobs[0].resumes.find(
    (version) => version.id === imported.jobs[0].appliedResumeId,
  );
  assert.deepEqual(submitted, resume);
  assert.equal(imported.jobs[0].status, 'Applied');
  assert.equal(imported.jobs[0].appliedAt, job.appliedAt);
});
