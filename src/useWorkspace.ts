import { useEffect, useRef, useState } from 'react';
import { emptyWorkspace, workspaceSchema, type Workspace, type Profile, type Job } from './model';
import { api, ApiError, errorText } from './api';
import { useAuth } from './Auth';
import { workspaceCacheKey, resolveWorkspaceSnapshot } from './workspaceSync.mjs';
type Snapshot = { workspace: Workspace; revision: number; dirty: boolean };
// Cloud is the account source of truth; a scoped device copy preserves interrupted edits.
export function useWorkspace() {
  const { account } = useAuth();
  const userId = account!.user.id,
    key = workspaceCacheKey(userId);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace),
    [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(''),
    [saveState, setSaveState] = useState('Loading cloud workspace…'),
    [conflict, setConflict] = useState(false);
  const current = useRef(workspace),
    revision = useRef(0),
    dirty = useRef(false),
    sequence = useRef(0),
    inFlight = useRef(false),
    alive = useRef(true),
    paused = useRef(false),
    retry = useRef<ReturnType<typeof setTimeout> | null>(null),
    raw = useRef('');
  function cache() {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          workspace: current.current,
          revision: revision.current,
          dirty: dirty.current,
        }),
      );
    } catch {
      if (alive.current)
        setStorageError(
          'The device recovery copy could not be saved. Export a backup to keep a copy.',
        );
    }
  }
  function readCache(): Snapshot | null {
    try {
      raw.current = localStorage.getItem(key) || '';
      if (!raw.current) return null;
      const value = JSON.parse(raw.current);
      if (!Number.isSafeInteger(value.revision) || value.revision < 0)
        throw new Error('Invalid revision');
      return {
        workspace: workspaceSchema.parse(value.workspace),
        revision: value.revision,
        dirty: Boolean(value.dirty),
      };
    } catch {
      setStorageError(
        'The account’s device copy could not be read. Export the recovery file before replacing it.',
      );
      return null;
    }
  }
  // Reconcile recovery data before edits are enabled; never silently overwrite another device.
  async function loadCloud(discard = false) {
    setSaveState('Loading cloud workspace…');
    try {
      const local = readCache(),
        cloud = await api<{ workspace: Workspace | null; revision: number }>('workspace');
      if (!alive.current) return;
      const remote = cloud.workspace ? workspaceSchema.parse(cloud.workspace) : emptyWorkspace();
      const next = resolveWorkspaceSnapshot(
        { workspace: remote, revision: cloud.revision },
        local,
        discard,
      );
      current.current = next.workspace;
      revision.current = next.revision;
      dirty.current = next.dirty;
      paused.current = next.conflict;
      setConflict(next.conflict);
      setStorageError(
        next.conflict
          ? 'Another device has newer changes. Your unsaved work is kept here. Export it, then load the cloud version to continue.'
          : '',
      );
      sequence.current++;
      setWorkspace(current.current);
      setReady(true);
      setSaveState(
        paused.current
          ? 'Sync paused'
          : dirty.current
            ? 'Changes waiting to save'
            : 'Saved to Supabase',
      );
      cache();
    } catch (e) {
      if (!alive.current) return;
      const local = readCache();
      if (local) {
        current.current = local.workspace;
        revision.current = local.revision;
        dirty.current = local.dirty;
        setWorkspace(local.workspace);
        setReady(true);
      }
      setStorageError(errorText(e));
      setSaveState(local ? 'Using device recovery copy' : 'Cloud unavailable');
    }
  }
  // Serialize saves and retain changes made while the previous request is in flight.
  async function saveNow() {
    if (!alive.current || !ready || !dirty.current || inFlight.current || paused.current) return;
    const snapshot = current.current,
      seq = sequence.current;
    inFlight.current = true;
    setSaveState('Saving to Supabase…');
    try {
      const result = await api<{ revision: number }>(
        'workspace',
        { workspace: snapshot, revision: revision.current },
        { headers: { 'X-Workspace-Owner': userId } },
      );
      if (!alive.current) return;
      revision.current = result.revision;
      dirty.current = sequence.current !== seq;
      setStorageError('');
      setSaveState(dirty.current ? 'Changes waiting to save' : 'Saved to Supabase');
      cache();
    } catch (e) {
      if (!alive.current) return;
      setStorageError(errorText(e));
      if (e instanceof ApiError && e.status === 409) {
        paused.current = true;
        setConflict(true);
      }
      setSaveState(
        paused.current ? 'Sync paused' : 'Changes saved on this device; cloud retry pending',
      );
      cache();
    } finally {
      inFlight.current = false;
      if (alive.current && dirty.current && !paused.current) {
        retry.current = setTimeout(() => void saveNow(), 15000);
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    void loadCloud();
    return () => {
      alive.current = false;
      if (retry.current) clearTimeout(retry.current);
    };
  }, [userId]);
  useEffect(() => {
    current.current = workspace;
    if (!ready) return;
    cache();
    if (!dirty.current || paused.current) return;
    const timer = setTimeout(() => void saveNow(), 1200);
    return () => clearTimeout(timer);
  }, [workspace, ready]);
  // Cache edits immediately so sign-out or navigation cannot lose a debounced save.
  function update(fn: (previous: Workspace) => Workspace) {
    if (!ready || !alive.current) return;
    const next = {
      ...fn(current.current),
      updatedAt: new Date().toISOString(),
    };
    current.current = next;
    dirty.current = true;
    sequence.current++;
    cache();
    setWorkspace(next);
    setSaveState(paused.current ? 'Sync paused' : 'Changes waiting to save');
  }
  const saveProfile = (profile: Profile) => update((w) => ({ ...w, profile }));
  const saveJob = (job: Job) =>
    update((w) => ({
      ...w,
      jobs: w.jobs.some((j) => j.id === job.id)
        ? w.jobs.map((j) => (j.id === job.id ? job : j))
        : [job, ...w.jobs],
    }));
  const removeJob = (id: string) =>
    update((w) => ({ ...w, jobs: w.jobs.filter((j) => j.id !== id) }));
  const replace = (next: Workspace) => {
    const parsed = workspaceSchema.parse(next);
    update(() => parsed);
  };
  const setTheme = (theme: 'Light' | 'Dark' | 'System') =>
    update((w) => ({ ...w, preferences: { theme } }));
  return {
    workspace,
    saveProfile,
    saveJob,
    removeJob,
    replace,
    setTheme,
    storageError,
    saveState,
    ready,
    conflict,
    saveNow,
    loadCloud,
    recoveryNeeded: false,
    recoveryRaw: () => raw.current || localStorage.getItem(key) || '',
    reset: () => replace(emptyWorkspace()),
  };
}
