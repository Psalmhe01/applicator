import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAccount } from '../src/accountAccess.mjs';

test('owners and existing members sign in despite stale or mismatched invitations', async () => {
  for (const role of ['admin', 'member']) {
    const calls = [];
    let cleared = false;
    const account = { role };
    const result = await resolveAccount({
      invitation: 'expired-or-wrong-email-token',
      clearInvitation: () => {
        cleared = true;
      },
      request: async (path) => {
        calls.push(path);
        return account;
      },
    });
    assert.equal(result, account);
    assert.deepEqual(calls, ['session']);
    assert.equal(cleared, true);
  }
});

test('invitation-only registration accepts a link only after membership is denied', async () => {
  const calls = [];
  let accepted = false;
  const result = await resolveAccount({
    invitation: 'private-token',
    clearInvitation: () => {},
    request: async (path, body) => {
      calls.push(path);
      if (path === 'invitations/accept') {
        assert.equal(body.token, 'private-token');
        accepted = true;
        return {};
      }
      if (!accepted) throw Object.assign(new Error('Invitation required'), { status: 403 });
      return { role: 'member' };
    },
  });
  assert.equal(result.role, 'member');
  assert.deepEqual(calls, ['session', 'invitations/accept', 'session']);
});

test('invalid invitations are cleared, while expired sessions and service failures do not consume them', async () => {
  for (const status of [401, 403, 503]) {
    let cleared = false;
    const calls = [];
    await assert.rejects(
      resolveAccount({
        invitation: 'invalid-token',
        clearInvitation: () => {
          cleared = true;
        },
        request: async (path) => {
          calls.push(path);
          throw Object.assign(new Error('Access failed'), { status });
        },
      }),
      (error) => error.status === status,
    );
    assert.equal(cleared, status === 403);
    assert.deepEqual(calls, status === 403 ? ['session', 'invitations/accept'] : ['session']);
  }
});
