import type { Workspace } from './model';
export function workspaceCacheKey(userId: string): string;
export function resolveWorkspaceSnapshot(
  cloud: { workspace: Workspace; revision: number },
  local: { workspace: Workspace; revision: number; dirty: boolean } | null,
  discard?: boolean,
): {
  workspace: Workspace;
  revision: number;
  dirty: boolean;
  conflict: boolean;
};
