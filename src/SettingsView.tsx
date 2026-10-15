import { useState } from 'react';
import { Download, Upload, LogOut, Moon, Sun, Monitor, Cloud } from 'lucide-react';
import { Button, Card, Modal } from './components/ui';
import { type Workspace, workspaceSchema } from './model';
import { exportBackup } from './export';
import { errorText } from './api';
import { useAuth } from './Auth';
export default function SettingsView({
  workspace,
  replace,
  setTheme,
  saveNow,
  loadCloud,
  notify,
}: {
  workspace: Workspace;
  replace: (w: Workspace) => void;
  setTheme: (v: 'Light' | 'Dark' | 'System') => void;
  saveNow: () => Promise<void>;
  loadCloud: (discard?: boolean) => Promise<void>;
  notify: (s: string) => void;
}) {
  const auth = useAuth();
  const [incoming, setIncoming] = useState<Workspace | null>(null),
    [busy, setBusy] = useState(false);
  async function readBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 3500000) throw new Error('Use a backup smaller than 3.5 MB.');
      setIncoming(workspaceSchema.parse(JSON.parse(await file.text())));
    } catch (e) {
      notify(errorText(e));
    }
  }
  function importLegacy() {
    try {
      const raw = localStorage.getItem('applicator.workspace.v1');
      if (!raw) {
        notify(
          'No previous personal workspace was found in this browser. Import an exported backup instead.',
        );
        return;
      }
      setIncoming(workspaceSchema.parse(JSON.parse(raw)));
    } catch (e) {
      notify(errorText(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE YOURSELF AT HOME</div>
          <h1>Your account, your workspace.</h1>
          <p>Appearance, recovery copies, and a place to keep your progress.</p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="stack">
          <Card>
            <h3>Appearance</h3>
            <p className="muted">Your preference follows your account across devices.</p>
            <div className="theme-choices" role="group" aria-label="Color theme">
              {(
                [
                  { value: 'Light', icon: Sun },
                  { value: 'Dark', icon: Moon },
                  { value: 'System', icon: Monitor },
                ] as const
              ).map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  aria-pressed={workspace.preferences.theme === value}
                  className={workspace.preferences.theme === value ? 'selected' : ''}
                  onClick={() => setTheme(value)}
                >
                  <Icon size={20} />
                  {value}
                </button>
              ))}
            </div>
          </Card>
          <Card>
            <h3>Account</h3>
            <p>{auth.account?.user.email}</p>
            <p className="muted">
              {auth.account?.role === 'admin' ? 'Owner account' : 'Private member workspace'}
            </p>
            <Button
              variant="secondary"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await saveNow();
                  await auth.signOut();
                } catch (e) {
                  notify(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={16} />
              Sign out
            </Button>
          </Card>
        </div>
        <div className="stack">
          <Card>
            <div className="section-heading">
              <h3>Automatically saved to Supabase</h3>
              <Cloud size={20} />
            </div>
            <p className="muted">
              Profile changes, applications, and resume versions save to your account. This browser
              keeps a recovery copy for interrupted connections.
            </p>
            <div className="flex-row">
              <Button variant="secondary" onClick={() => void saveNow()}>
                Save now
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (
                    window.confirm(
                      'Load the cloud version and replace unsaved changes here? Export a backup first if you want to keep them.',
                    )
                  )
                    void loadCloud(true);
                }}
              >
                Load cloud version
              </Button>
            </div>
          </Card>
          <Card>
            <h3>Keep a copy</h3>
            <p className="muted">
              Export your profile, jobs, and resume versions together, or bring a previous backup
              into this account.
            </p>
            <Button variant="secondary" onClick={() => exportBackup(workspace)}>
              <Download size={16} />
              Export backup
            </Button>
            <label className="button ghost file-button">
              <Upload size={16} />
              Import backup
              <input
                type="file"
                hidden
                accept=".json"
                onChange={(e) => {
                  void readBackup(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {auth.account?.role === 'admin' && (
              <Button variant="ghost" onClick={importLegacy}>
                Import previous personal workspace
              </Button>
            )}
          </Card>
        </div>
      </div>
      <Modal
        open={!!incoming}
        onClose={() => setIncoming(null)}
        title="Import this workspace?"
        description="This replaces the workspace in your signed-in account and saves it to Supabase. Export your current backup first."
      >
        {incoming && (
          <>
            <div className="review-summary">
              <h3>{incoming.profile.name || 'Unnamed profile'}</h3>
              <p>
                {incoming.jobs.length} saved jobs · {incoming.profile.experiences.length}{' '}
                experiences
              </p>
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => exportBackup(workspace)}>
                Export current backup
              </Button>
              <Button
                onClick={() => {
                  replace(incoming);
                  setIncoming(null);
                  notify('Backup imported. Cloud saving will begin automatically.');
                }}
              >
                Import into my account
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
