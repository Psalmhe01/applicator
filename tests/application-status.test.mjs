import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { load } from 'cheerio';
import { createServer } from 'vite';
import { workspaceSchema as serverWorkspaceSchema } from '../server/workspace.mjs';

const statusKey = Symbol.for('applicator.status-test.control');
const recordKey = Symbol.for('applicator.status-test.record');
let server, client, RoleDetail, ApplicationStatus, JobsView, AuthContext;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, preTransformRequests: false, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    ssr: { noExternal: ['@radix-ui/react-dialog'] },
    plugins: [
      {
        name: 'application-status-test-boundaries',
        enforce: 'pre',
        resolveId(source, importer) {
          if (!importer?.replaceAll('\\', '/').endsWith('/src/RoleDetail.tsx')) return;
          if (source === './ApplicationStatus') return '\0status-test-control';
          if (source === './components/ui') return '\0status-test-ui';
          if (source === '@radix-ui/react-dialog') return '\0status-test-dialog';
        },
        load(id) {
          // Radix portals do not render on the server. Expose their children while
          // retaining the real detail component, controls, and persistence handlers.
          if (id === '\0status-test-dialog')
            return `
          import { createElement } from 'react';
          const children = ({children}) => children;
          export const Root = children, Portal = children, Title = children;
          export const Overlay = ({className}) => createElement('div', {className});
          export const Content = ({children, className}) => createElement('section', {className}, children);
        `;
          if (id === '\0status-test-control')
            return `
          import { createElement } from 'react';
          import Control from '/src/ApplicationStatus.tsx';
          export default function Capture(props) {
            globalThis[Symbol.for('applicator.status-test.control')] = props;
            return createElement(Control, props);
          }
        `;
          if (id === '\0status-test-ui')
            return `
          import { createElement } from 'react';
          import { Button, Field, Modal as OriginalModal, Pill } from '/src/components/ui.tsx';
          export { Button, Field, Pill };
          export function Modal(props) {
            if (props.title === 'Record your application')
              globalThis[Symbol.for('applicator.status-test.record')] = props.children;
            return createElement(OriginalModal, props);
          }
        `;
        },
      },
    ],
  });
  client = await server.ssrLoadModule('/src/model.ts');
  ({ default: RoleDetail } = await server.ssrLoadModule('/src/RoleDetail.tsx'));
  ({ default: ApplicationStatus } = await server.ssrLoadModule('/src/ApplicationStatus.tsx'));
  ({ default: JobsView } = await server.ssrLoadModule('/src/JobsView.tsx'));
  ({ AuthContext } = await server.ssrLoadModule('/src/Auth.tsx'));
});

after(async () => {
  delete globalThis[statusKey];
  delete globalThis[recordKey];
  await server?.close();
});

function fixture(status = 'Applied') {
  const workspace = client.emptyWorkspace();
  const submitted = {
    ...client.manualResume(workspace.profile),
    id: 'submitted',
    reviewed: true,
    downloadedAt: '2026-10-01T18:00:00.000Z',
  };
  const newer = { ...client.manualResume(workspace.profile), id: 'newer-unsubmitted' };
  return client.newJob({
    title: 'Example role',
    company: 'Example Company',
    status,
    appliedAt: '2026-10-01',
    appliedResumeId: submitted.id,
    followUp: '2026-10-20',
    deadline: '2026-11-01',
    notes: 'Keep recruiter notes.',
    resumes: [submitted, newer],
  });
}

function detail(job) {
  const saved = [];
  const html = renderToStaticMarkup(
    createElement(RoleDetail, {
      job,
      profile: client.emptyWorkspace().profile,
      save: (next) => saved.push(next),
      remove() {},
      close() {},
      aiConfigured: false,
      notify() {},
      onProfile() {},
    }),
  );
  return { saved, $: load(html), control: globalThis[statusKey], record: globalThis[recordKey] };
}

function findElement(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  } else if (node && typeof node === 'object' && node.props) {
    if (predicate(node)) return node;
    return findElement(node.props.children, predicate);
  }
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object' && node.props) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

function assertRecordPreserved(next, original) {
  for (const key of ['appliedAt', 'appliedResumeId', 'followUp', 'deadline', 'notes', 'resumes']) {
    assert.deepEqual(next[key], original[key], key);
  }
}

function tracker(job) {
  const account = {
    user: { id: 'status-test-user', email: 'status@example.invalid' },
    role: 'member',
    providers: { catalog: true, adzuna: false },
    settings: { catalogEnabled: true, adzunaEnabled: false },
  };
  return load(
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          AuthContext.Provider,
          { value: { account } },
          createElement(JobsView, {
            jobs: [job],
            tracker: true,
            save() {},
            open() {},
            notify() {},
          }),
        ),
      ),
    ),
  );
}

test('application status is editable above the detail tabs and exposes every supported stage', () => {
  const { $, control } = detail(fixture());
  const select = $('.detail-actionbar .application-status-control select');
  assert.equal(select.length, 1);
  assert.equal($('.application-status-control').length, 1, 'One always-visible status control');
  assert.equal(select.closest('label').find('span').first().text(), 'Application status');
  assert.equal(select.val(), 'Applied');
  assert.deepEqual(
    select
      .find('option')
      .map((_, option) => $(option).attr('value'))
      .get(),
    client.statuses,
  );
  assert.equal(control.value, 'Applied');
  assert.ok($('.detail-actionbar').text().includes('Update application record'));
  const forwarded = [];
  const nativeSelect = findElement(
    ApplicationStatus({ value: 'Applied', onChange: (value) => forwarded.push(value) }),
    (node) => node.type === 'select',
  );
  nativeSelect.props.onChange({ currentTarget: { value: 'Interviewing' } });
  assert.deepEqual(forwarded, ['Interviewing']);
});

test('applied jobs move through later stages and persist without changing their application record', () => {
  const original = fixture();
  const { saved, control } = detail(original);
  for (const status of ['Interviewing', 'Offer', 'Rejected', 'Withdrawn']) {
    control.onChange(status);
    const next = saved.at(-1);
    assert.equal(next.status, status);
    assertRecordPreserved(next, original);
    const workspace = client.emptyWorkspace();
    workspace.jobs = [next];
    const imported = client.workspaceSchema.parse(
      JSON.parse(JSON.stringify(serverWorkspaceSchema.parse(workspace))),
    );
    assert.equal(imported.jobs[0].status, status);
    assertRecordPreserved(imported.jobs[0], original);
    const $ = tracker(imported.jobs[0]);
    assert.equal($('.application-table tbody .pill').text(), status);
    assert.ok(
      $('select[aria-label="Filter by status"] option')
        .toArray()
        .some((option) => $(option).text() === status),
    );
    const stage = $('.pipeline-strip button').filter(
      (_, button) => $(button).find('span').text() === status,
    );
    if (status !== 'Withdrawn') assert.equal(stage.find('strong').text(), '1');
    assert.equal(
      $('.pipeline-strip button')
        .filter((_, button) => $(button).find('span').text() === 'Applied')
        .find('strong')
        .text(),
      '0',
    );
  }
  assert.equal(saved.length, 4);
  assert.equal(original.status, 'Applied', 'Status changes do not mutate the original snapshot');
});

test('updating a submitted resume record retains a later application stage and its original date', () => {
  for (const status of ['Interviewing', 'Offer', 'Rejected', 'Withdrawn']) {
    const original = fixture(status);
    const { saved, record } = detail(original);
    const confirm = findElement(
      record,
      (node) =>
        typeof node.props.onClick === 'function' && text(node).trim() === 'Save application record',
    );
    assert.ok(confirm, status);
    confirm.props.onClick();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].status, status);
    assertRecordPreserved(saved[0], original);
  }
});

test('marking a new opportunity applied still records the date and selected resume after confirmation', () => {
  const original = fixture('Saved');
  original.appliedAt = '';
  delete original.appliedResumeId;
  const { saved, control, record } = detail(original);
  control.onChange('Applied');
  assert.equal(saved.length, 0, 'Selecting Applied waits for application confirmation');
  const confirm = findElement(
    record,
    (node) => typeof node.props.onClick === 'function' && text(node).trim() === 'Mark applied',
  );
  assert.ok(confirm);
  confirm.props.onClick();
  assert.equal(saved[0].status, 'Applied');
  assert.equal(saved[0].appliedAt, client.localDate());
  assert.equal(saved[0].appliedResumeId, 'newer-unsubmitted');
  assert.deepEqual(saved[0].resumes, original.resumes);
});

test('a recorded external resume remains selected when updating an application record', () => {
  const original = fixture('Interviewing');
  original.appliedResumeId = '';
  const { saved, record } = detail(original);
  const selection = findElement(record, (node) => node.type === 'select');
  assert.equal(selection.props.value, '');
  const confirm = findElement(
    record,
    (node) =>
      typeof node.props.onClick === 'function' && text(node).trim() === 'Save application record',
  );
  confirm.props.onClick();
  assert.equal(saved[0].status, 'Interviewing');
  assertRecordPreserved(saved[0], original);
});
