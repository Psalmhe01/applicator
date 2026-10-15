import { useEffect, useState } from 'react';
import { Copy, Download, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { Button, Card, Field } from './components/ui';
import { api, authorizedFetch, errorText } from './api';
import { downloadFile } from './export';
type PlatformSettings = {
  signupEnabled: boolean;
  aiDailyLimit: number;
  globalAiDailyLimit: number;
  catalogEnabled: boolean;
  adzunaEnabled: boolean;
};
type AdminData = {
  members: {
    email: string;
    user_id: string | null;
    role: string;
    active: boolean;
    expires_at: string | null;
  }[];
  settings: PlatformSettings;
  providers: { gemini: boolean; adzuna: boolean; model: string };
};
export default function AdminView({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<AdminData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(''),
    [invitation, setInvitation] = useState('');
  async function load() {
    setError('');
    try {
      setData(await api<AdminData>('admin'));
    } catch (e) {
      setError(errorText(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">OWNER CONTROLS</div>
          <h1>A place for your people.</h1>
          <p>Manage registration, members, shared AI allowances, and job sources.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <Card>
          <p>Loading owner controls…</p>
        </Card>
      ) : (
        <div className="admin-grid">
          <div className="stack">
            <Card>
              <h3>Invite a friend</h3>
              <p className="muted">
                Email signup is available while registration is open. For private access when
                registration is paused, create a link and share it yourself. This does not send an
                email. Links expire after seven days and can be accepted once.
              </p>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const result = await api<{ token: string }>('admin/invitations', { email });
                    setInvitation(`${window.location.origin}/#invite=${result.token}`);
                    setEmail('');
                    notify('Invitation created. Share the link directly with your friend.');
                  });
                }}
              >
                <Field label="Friend’s email">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Button type="submit" busy={busy}>
                  <UserPlus size={16} />
                  Create invitation
                </Button>
              </form>
              {invitation && (
                <div className="invitation-result">
                  <Field label="Private invitation link">
                    <input readOnly value={invitation} onFocus={(e) => e.target.select()} />
                  </Field>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(invitation);
                        notify('Invitation link copied.');
                      } catch {
                        notify('Select the link and copy it manually.');
                      }
                    }}
                  >
                    <Copy size={16} />
                    Copy link
                  </Button>
                </div>
              )}
            </Card>
            <Card>
              <h3>Members</h3>
              <div className="member-list">
                {data.members.map((member) => (
                  <div className="member-row" key={member.email}>
                    <div>
                      <strong>{member.email}</strong>
                      <small>
                        {member.role === 'admin'
                          ? 'Owner'
                          : !member.active
                            ? 'Access revoked'
                            : member.user_id
                              ? 'Member'
                              : 'Invitation pending'}
                      </small>
                    </div>
                    {member.role !== 'admin' && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await api('admin/access', {
                              email: member.email,
                              active: !member.active,
                            });
                            notify(member.active ? 'Access revoked.' : 'Access restored.');
                          })
                        }
                      >
                        {member.active ? 'Revoke access' : 'Restore access'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <div className="stack">
            <Card>
              <h3>Shared usage and sources</h3>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api('admin/settings', data.settings);
                    notify('Platform preferences saved.');
                  });
                }}
              >
                <label className="simple-check">
                  <input
                    type="checkbox"
                    checked={data.settings.signupEnabled}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          signupEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  Allow new users to sign up with email
                </label>
                <div className="form-grid">
                  <Field label="AI requests per member / day">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={data.settings.aiDailyLimit}
                      onChange={(e) =>
                        setData({
                          ...data,
                          settings: {
                            ...data.settings,
                            aiDailyLimit: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="AI requests across all members / day">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      required
                      value={data.settings.globalAiDailyLimit}
                      onChange={(e) =>
                        setData({
                          ...data,
                          settings: {
                            ...data.settings,
                            globalAiDailyLimit: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                </div>
                <small className="muted">
                  Requests count when submitted, including provider failures. Allowances reset at
                  midnight UTC. Google’s own quota can be lower.
                </small>
                <label className="simple-check">
                  <input
                    type="checkbox"
                    checked={data.settings.catalogEnabled}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          catalogEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  Company-board discovery
                </label>
                <label className="simple-check">
                  <input
                    type="checkbox"
                    checked={data.settings.adzunaEnabled}
                    onChange={(e) =>
                      setData({
                        ...data,
                        settings: {
                          ...data.settings,
                          adzunaEnabled: e.target.checked,
                        },
                      })
                    }
                  />
                  Broader US search through Adzuna
                </label>
                <Button type="submit" busy={busy}>
                  Save platform preferences
                </Button>
              </form>
            </Card>
            <Card>
              <div className="section-heading">
                <h3>Provider connections</h3>
                <ShieldCheck size={20} />
              </div>
              <ul className="stack-list">
                <li>
                  <span>Gemini</span>
                  <strong>{data.providers.gemini ? 'Configured' : 'Needs setup'}</strong>
                </li>
                <li>
                  <span>Model</span>
                  <strong>{data.providers.model}</strong>
                </li>
                <li>
                  <span>Adzuna US search</span>
                  <strong>{data.providers.adzuna ? 'Configured' : 'Needs setup'}</strong>
                </li>
              </ul>
              <p className="small muted">
                Configure credentials once in the server’s .env file or Vercel environment settings.
                Use GEMINI_API_KEY, ADZUNA_APP_ID, and ADZUNA_APP_KEY. Credentials stay on the
                server and are never shown to members.
              </p>
            </Card>
            <Card>
              <h3>Database setup</h3>
              <p className="muted">
                The migration preserves existing workspaces and adds membership, conflict
                protection, quotas, and a shared search cache.
              </p>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    const response = await authorizedFetch('admin/schema');
                    if (!response.ok) throw new Error('Only the owner can download setup SQL.');
                    downloadFile('applicator-multi-user.sql', await response.text(), 'text/plain');
                  } catch (e) {
                    notify(errorText(e));
                  }
                }}
              >
                <Download size={16} />
                Download setup SQL
              </Button>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
