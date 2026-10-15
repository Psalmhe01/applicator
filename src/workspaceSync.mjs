// Device copies are namespaced by the authenticated ID, never by a shared browser-wide key.
export const workspaceCacheKey = (userId) => `applicator.workspace.v2.${userId}`;

// Keep the revision on which unsaved edits were based. Advancing it during a conflict would
// make a later retry appear current and overwrite the other device's newer workspace.
export function resolveWorkspaceSnapshot(cloud, local, discard = false) {
  if (
    !discard &&
    local?.dirty &&
    JSON.stringify(local.workspace) !== JSON.stringify(cloud.workspace)
  ) {
    return { ...local, conflict: local.revision !== cloud.revision };
  }
  // An identical cloud copy also resolves an interrupted save whose acknowledgement was lost.
  return { ...cloud, dirty: false, conflict: false };
}
