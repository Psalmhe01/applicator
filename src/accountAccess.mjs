// Check existing access first. A stale invite must never block the owner or a member.
export async function resolveAccount({ request, invitation, clearInvitation }) {
  try {
    const account = await request('session');
    if (invitation) clearInvitation();
    return account;
  } catch (error) {
    if (error.status !== 403 || !invitation) throw error;
  }
  try {
    await request('invitations/accept', { token: invitation });
  } catch (error) {
    if (error.status === 403) clearInvitation();
    throw error;
  }
  clearInvitation();
  return request('session');
}
