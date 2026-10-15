import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router';
import { LogIn, Leaf, ShieldCheck } from 'lucide-react';
import { api, configureTokenProvider, errorText } from './api';
import { Button, Card, Field } from './components/ui';
import { resolveAccount } from './accountAccess.mjs';
import {
  clearAuthReturnPath,
  consumeAuthReturnPath,
  rememberAuthReturnPath,
} from './authReturn.mjs';
export type AppAccount = {
  user: { id: string; email: string };
  role: 'admin' | 'member';
  settings: {
    aiDailyLimit: number;
    globalAiDailyLimit: number;
    catalogEnabled: boolean;
    adzunaEnabled: boolean;
    signupEnabled: boolean;
  };
  providers: { catalog: boolean; adzuna: boolean };
};
type AuthState = {
  client: SupabaseClient | null;
  session: Session | null;
  account: AppAccount | null;
  configured: boolean;
  googleEnabled: boolean;
  signupEnabled: boolean;
  loading: boolean;
  error: string;
  invite: string;
  recheck: () => Promise<void>;
  signOut: () => Promise<void>;
};
export const AuthContext = createContext<AuthState | null>(null);
function tabStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
// Fragment links keep invitation secrets out of request URLs. Retain the token in
// this tab through OAuth, then consume it once membership is accepted.
function readInvite() {
  if (typeof window === 'undefined') return '';
  const token = new URLSearchParams(window.location.hash.slice(1)).get('invite');
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    try {
      tabStorage()?.setItem('applicator.invite', token);
    } catch {}
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
    return token;
  }
  try {
    return tabStorage()?.getItem('applicator.invite') || '';
  } catch {
    return '';
  }
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [account, setAccount] = useState<AppAccount | null>(null),
    [configured, setConfigured] = useState(false),
    [googleEnabled, setGoogleEnabled] = useState(false),
    [signupEnabled, setSignupEnabled] = useState(true),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [invite, setInvite] = useState(readInvite);
  const userId = useRef<string | undefined>(undefined);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    api<{
      configured: boolean;
      projectUrl: string;
      publicKey: string;
      googleEnabled: boolean;
      signupEnabled: boolean;
    }>('config')
      .then((config) => {
        if (!active) return;
        setConfigured(config.configured);
        setGoogleEnabled(config.googleEnabled);
        setSignupEnabled(config.signupEnabled);
        if (!config.configured) {
          setLoading(false);
          return;
        }
        const next = createClient(config.projectUrl, config.publicKey);
        setClient(next);
        configureTokenProvider(async () => {
          const { data } = await next.auth.getSession();
          return data.session?.access_token || null;
        });
        const { data } = next.auth.onAuthStateChange((_event, value) => {
          if (active) {
            if (userId.current !== value?.user.id) {
              setAccount(null);
              setLoading(Boolean(value));
              userId.current = value?.user.id;
            }
            setSession(value);
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
        next.auth.getSession().then(({ data }) => {
          if (active) {
            setSession(data.session);
            setLoading(Boolean(data.session));
          }
        });
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      unsubscribe?.();
      configureTokenProvider(async () => null);
    };
  }, []);
  async function recheck() {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      setAccount(
        await resolveAccount<AppAccount>({
          request: api,
          invitation: invite,
          clearInvitation,
        }),
      );
    } catch (e) {
      setAccount(null);
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  function clearInvitation() {
    try {
      tabStorage()?.removeItem('applicator.invite');
    } catch {}
    setInvite('');
  }
  useEffect(() => {
    let active = true;
    if (!session) {
      setAccount(null);
      return;
    }
    setLoading(true);
    setError('');
    (async () => {
      try {
        const next = await resolveAccount<AppAccount>({
          request: api,
          invitation: invite,
          clearInvitation: () => {
            if (active) clearInvitation();
          },
        });
        if (active) setAccount(next);
      } catch (e) {
        if (active) {
          setAccount(null);
          setError(errorText(e));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [session?.user.id]);
  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    setAccount(null);
    setSession(null);
  }
  return (
    <AuthContext.Provider
      value={{
        client,
        session,
        account,
        configured,
        googleEnabled,
        signupEnabled,
        loading,
        error,
        invite,
        recheck,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
// Workspace components mount only after the server verifies account membership.
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [messageIsError, setMessageIsError] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    if (!auth.account || auth.loading) return;
    const path = consumeAuthReturnPath(tabStorage());
    if (path) navigate(path, { replace: true });
  }, [auth.account?.user.id, auth.loading, navigate]);
  if (auth.account && !auth.loading) return <>{children}</>;
  async function submit() {
    if (!auth.client) return;
    setBusy(true);
    setMessage('');
    setMessageIsError(false);
    try {
      if (creating)
        rememberAuthReturnPath(tabStorage(), window.location.pathname, window.location.search);
      const result = creating
        ? await auth.client.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : await auth.client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (creating && !result.data.session)
        setMessage(
          'Check your inbox for an email confirmation link, then sign in. If no email arrives, contact the owner.',
        );
    } catch (e) {
      if (creating) clearAuthReturnPath(tabStorage());
      setMessageIsError(true);
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <div className="auth-brand">
        <Leaf size={26} />
        <span>applicator.</span>
      </div>
      <Card className="auth-panel">
        <div className="eyebrow">YOUR NEXT CHAPTER, TOGETHER</div>
        <h1>
          {auth.loading
            ? 'Getting your workspace ready…'
            : !auth.configured
              ? 'A little setup remains.'
              : auth.session
                ? 'We couldn’t open your workspace.'
                : creating
                  ? 'Make room for your next move.'
                  : 'Welcome back.'}
        </h1>
        {auth.loading ? (
          <p>Checking your account and private workspace.</p>
        ) : !auth.configured ? (
          <p>
            The owner needs to configure Supabase before accounts can be used. Existing device data
            is preserved.
          </p>
        ) : auth.session ? (
          <>
            <p>
              Signed in as {auth.session.user.email}. Check access again or sign out and retry. If
              access was revoked, the owner can restore it.
            </p>
            <div className="flex-row">
              <Button onClick={() => void auth.recheck()}>Check access again</Button>
              <Button variant="secondary" onClick={() => void auth.signOut()}>
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>
              {auth.invite
                ? 'An invitation is ready. Sign in or create an account with the email address the owner invited.'
                : auth.signupEnabled
                  ? 'Sign in or create an account with your email address. Your workspace stays private.'
                  : 'Sign in to your private workspace. New registrations are paused; an invitation is required.'}
            </p>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <Field label="Email">
                <input
                  required
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password">
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" busy={busy}>
                <LogIn size={16} />
                {creating ? 'Create account' : 'Sign in'}
              </Button>
            </form>
            {(auth.signupEnabled || auth.invite) && (
              <Button variant="ghost" onClick={() => setCreating((v) => !v)}>
                {creating ? 'Already have an account? Sign in' : 'New here? Create an account'}
              </Button>
            )}
            {auth.googleEnabled && (
              <Button
                variant="secondary"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  rememberAuthReturnPath(
                    tabStorage(),
                    window.location.pathname,
                    window.location.search,
                  );
                  try {
                    const { error } = await auth.client!.auth.signInWithOAuth({
                      provider: 'google',
                      options: { redirectTo: window.location.origin },
                    });
                    if (error) throw error;
                  } catch (e) {
                    clearAuthReturnPath(tabStorage());
                    setMessageIsError(true);
                    setMessage(errorText(e));
                    setBusy(false);
                  }
                }}
              >
                Continue with Google
              </Button>
            )}
          </>
        )}
        {(auth.error || message) && (
          <div
            className={auth.error || messageIsError ? 'error-banner' : 'auth-feedback'}
            role={auth.error || messageIsError ? 'alert' : 'status'}
          >
            {auth.error || message}
          </div>
        )}
        <div className="auth-note">
          <ShieldCheck size={16} />
          Your resumes and applications belong to your account.
        </div>
      </Card>
    </main>
  );
}
