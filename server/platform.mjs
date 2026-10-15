import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { settingsSchema } from './workspace.mjs';
export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
// Persist invitation hashes rather than reusable invitation secrets.
export const tokenDigest = (token) => createHash('sha256').update(token).digest('hex');
export function platformConfig(env = process.env) {
  const url = env.SUPABASE_URL || '',
    publicKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '';
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  // Only a publishable/anon key may reach the browser. Fail closed if a secret key
  // was accidentally entered in the public-key variable during deployment setup.
  let publicKeyValid = publicKey.startsWith('sb_publishable_');
  if (!publicKeyValid) {
    try {
      publicKeyValid =
        JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role === 'anon';
    } catch {}
  }
  let urlValid = false;
  try {
    const parsed = new URL(url);
    urlValid =
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.supabase.co') &&
      !parsed.username &&
      !parsed.password;
  } catch {}
  const configured = Boolean(
    url &&
    urlValid &&
    publicKeyValid &&
    publicKey !== serviceKey &&
    serviceKey &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.ADMIN_USER_ID || ''),
  );
  return { url, publicKey, configured };
}
// The service-role client stays on the server. Its privileged operations are bound
// to a verified identity before any private workspace is read or written.
export function createPlatform({ env = process.env, client } = {}) {
  const config = platformConfig(env);
  const db =
    client ||
    (config.configured
      ? createClient(config.url, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            // A stalled database request must finish before the hosting request deadline.
            fetch: (url, options) =>
              fetch(url, {
                ...options,
                signal: options?.signal
                  ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
                  : AbortSignal.timeout(20000),
              }),
          },
        })
      : null);
  function ready() {
    if (!db)
      throw httpError(503, 'The owner needs to finish Supabase setup before accounts can be used.');
  }
  function check(error) {
    if (error) {
      // PT409 is the HTTP conflict code; retain support for the earlier migration.
      if (error.code === 'PT409' || error.code === '40001')
        throw httpError(
          409,
          'Another device changed this workspace. Export your current work, then load the cloud version before saving again.',
        );
      throw httpError(
        503,
        'Database operation failed. The owner should check the setup SQL and project status.',
      );
    }
  }
  // Ask Supabase to verify the token; decoding its claims alone would not establish identity.
  async function identify(req) {
    ready();
    const token = /^Bearer ([^\s]{20,8192})$/.exec(req.headers.authorization || '')?.[1];
    if (!token) throw httpError(401, 'Sign in to continue.');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user?.email) throw httpError(401, 'Your session expired. Sign in again.');
    return data.user;
  }
  // Bootstrap the fixed owner. Public signup enrolls new accounts without granting owner privileges.
  async function member(user) {
    ready();
    const owner = user.id === env.ADMIN_USER_ID;
    if (owner) {
      const { error } = await db.from('applicator_members').upsert(
        {
          email: user.email.toLowerCase(),
          user_id: user.id,
          role: 'admin',
          active: true,
        },
        { onConflict: 'user_id' },
      );
      check(error);
    }
    let { data, error } = await db
      .from('applicator_members')
      .select('email,user_id,role,active')
      .eq('user_id', user.id)
      .maybeSingle();
    check(error);
    if (!owner && !data && (await settings()).signupEnabled) {
      // Never upsert over an existing member: doing so could restore revoked access.
      const email = user.email.toLowerCase();
      const inserted = await db
        .from('applicator_members')
        .upsert(
          { email, user_id: user.id, role: 'member', active: true },
          { onConflict: 'email', ignoreDuplicates: true },
        );
      check(inserted.error);
      // An unused invitation may already hold this email. Claim it only while active
      // and public signup is enabled; the database filters protect concurrent changes.
      const claimed = await db
        .from('applicator_members')
        .update({ user_id: user.id, invite_digest: null, expires_at: null })
        .eq('email', email)
        .eq('active', true)
        .is('user_id', null);
      check(claimed.error);
      ({ data, error } = await db
        .from('applicator_members')
        .select('email,user_id,role,active')
        .eq('user_id', user.id)
        .maybeSingle());
      check(error);
    }
    if (data && !data.active)
      throw httpError(403, 'Your access has been revoked. Ask the owner to restore it.');
    if (!data)
      throw httpError(
        403,
        'Registration is paused. Ask the owner for an invitation or to restore access.',
      );
    // Only the deployment's fixed user ID can administer the platform; user metadata never grants roles.
    return { user, role: owner ? 'admin' : 'member' };
  }
  async function settings() {
    ready();
    const { data, error } = await db
      .from('applicator_settings')
      .select('settings')
      .eq('id', true)
      .maybeSingle();
    check(error);
    return settingsSchema.parse(data?.settings || {});
  }
  return {
    config,
    identify,
    member,
    settings,
    async authenticate(req) {
      return member(await identify(req));
    },
    async accept(user, token) {
      ready();
      const { error } = await db.rpc('applicator_accept_invitation', {
        p_digest: tokenDigest(token),
        p_user_id: user.id,
        p_email: user.email?.toLowerCase() || '',
      });
      if (error)
        throw httpError(
          403,
          'This invitation is invalid, expired, already used, or belongs to another email address.',
        );
      return member(user);
    },
    async load(userId) {
      const { data, error } = await db
        .from('applicator_workspaces')
        .select('data,revision,updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      check(error);
      return data
        ? { workspace: data.data, revision: Number(data.revision) }
        : { workspace: null, revision: 0 };
    },
    async save(userId, workspace, revision) {
      const { data, error } = await db.rpc('applicator_save_workspace', {
        p_user_id: userId,
        p_data: workspace,
        p_revision: revision,
      });
      check(error);
      return { revision: Number(data) };
    },
    // Reserve in Postgres before Gemini runs so limits survive concurrent Vercel instances.
    async reserveAi(userId) {
      const s = await settings();
      const { data, error } = await db.rpc('applicator_reserve_ai', {
        p_user_id: userId,
        p_user_limit: s.aiDailyLimit,
        p_global_limit: s.globalAiDailyLimit,
      });
      check(error);
      if (!data)
        throw httpError(
          429,
          'The daily AI allowance has been reached. Try again tomorrow (UTC), or use a manual resume.',
        );
    },
    async adminOverview() {
      const [{ data, error }, s] = await Promise.all([
        db
          .from('applicator_members')
          .select('email,user_id,role,active,created_at,expires_at')
          .order('created_at', { ascending: false }),
        settings(),
      ]);
      check(error);
      return {
        members: data,
        settings: s,
        providers: {
          gemini: Boolean(env.GEMINI_API_KEY),
          adzuna: Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
          model: env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        },
      };
    },
    async invite(email) {
      const { data: existing, error: readError } = await db
        .from('applicator_members')
        .select('user_id,role')
        .eq('email', email)
        .maybeSingle();
      check(readError);
      if (existing?.role === 'admin' || existing?.user_id === env.ADMIN_USER_ID)
        throw httpError(400, 'The owner account does not need an invitation.');
      if (existing?.user_id)
        throw httpError(
          409,
          'This account has already joined. Restore its access from the member list.',
        );
      const token = randomBytes(32).toString('base64url'),
        expires = new Date(Date.now() + 7 * 86400000).toISOString();
      const { error } = await db.from('applicator_members').upsert(
        {
          email,
          user_id: null,
          role: 'member',
          active: true,
          invite_digest: tokenDigest(token),
          expires_at: expires,
        },
        { onConflict: 'email' },
      );
      check(error);
      return { token, expiresAt: expires };
    },
    async access(email, active) {
      const { data, error } = await db
        .from('applicator_members')
        .select('user_id,role')
        .eq('email', email)
        .maybeSingle();
      check(error);
      if (!data) throw httpError(404, 'Member not found.');
      if (data.role === 'admin' || data.user_id === env.ADMIN_USER_ID)
        throw httpError(400, 'The owner cannot revoke their own access.');
      const result = await db.from('applicator_members').update({ active }).eq('email', email);
      check(result.error);
    },
    async saveSettings(s) {
      const { error } = await db
        .from('applicator_settings')
        .upsert({ id: true, settings: settingsSchema.parse(s) });
      check(error);
    },
    async cacheGet(key) {
      const { data, error } = await db
        .from('applicator_search_cache')
        .select('data')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      check(error);
      return data?.data || null;
    },
    async cacheSet(key, data) {
      const cleanup = await db
        .from('applicator_search_cache')
        .delete()
        .lt('expires_at', new Date().toISOString());
      check(cleanup.error);
      const { error } = await db.from('applicator_search_cache').upsert({
        cache_key: key,
        data,
        expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
      });
      check(error);
    },
    async cacheSetMany(entries) {
      const { error } = await db.from('applicator_search_cache').upsert(
        entries.map(({ key, data }) => ({
          cache_key: key,
          data,
          expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
        })),
      );
      check(error);
    },
    async reserveSearch() {
      const { data, error } = await db.rpc('applicator_reserve_search');
      check(error);
      if (!data)
        throw httpError(
          429,
          'The shared job-search allowance has been reached. Try a cached search or Company boards instead.',
        );
    },
  };
}
