import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createPlatform, httpError } from './platform.mjs';
import { workspaceSchema, settingsSchema } from './workspace.mjs';
import { createAdzuna } from './adzuna.mjs';
import { z } from 'zod';
import { fetchPublicPage } from './security.mjs';
import {
  cleanHtml,
  extractJob,
  profileSchema,
  parsedProfileSchema,
  generatedSchema,
  jobInputSchema,
  groundGenerated,
} from './domain.mjs';
import { generateJson } from './gemini.mjs';
import { createDiscovery } from './openings.mjs';
import { rankOpenings } from './relevance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
export function createApp({
  platform = createPlatform(),
  discovery = createDiscovery(),
  adzuna = createAdzuna({
    cache: platform,
    reserve: () => platform.reserveSearch(),
  }),
  ai = generateJson,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const deployed = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const origins = new Set([
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:8787',
      'http://localhost:8787',
    ]);
    for (const value of [
      process.env.APP_URL,
      process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
      process.env.VERCEL_PROJECT_PRODUCTION_URL &&
        `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    ]) {
      if (value) {
        try {
          origins.add(new URL(value).origin);
        } catch {}
      }
    }
    if (!deployed && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ''))
      return res.status(403).json({ error: 'This server only accepts configured hosts.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
      const origin = req.headers.origin;
      if (origin && !origins.has(origin))
        return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
      if (req.headers['sec-fetch-site'] === 'cross-site')
        return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
      if (req.method === 'POST' && !req.is('application/json'))
        return res.status(415).json({ error: 'Use JSON requests.' });
    }
    next();
  });
  app.use(express.json({ limit: '3500kb' }));
  app.get('/api/config', async (_req, res) => {
    const signupEnabled = platform.config.configured
      ? (await platform.settings()).signupEnabled !== false
      : true;
    res.json({
      configured: platform.config.configured,
      projectUrl: platform.config.configured ? platform.config.url : '',
      publicKey: platform.config.configured ? platform.config.publicKey : '',
      googleEnabled: process.env.GOOGLE_AUTH_ENABLED === 'true',
      signupEnabled,
    });
  });
  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    }),
  );
  app.use('/api', async (req, _res, next) => {
    try {
      const user = await platform.identify(req);
      req.identity = user;
      if (req.path !== '/invitations/accept') req.account = await platform.member(user);
      next();
    } catch (e) {
      next(e);
    }
  });
  const limits = new Map();
  app.use('/api', (req, res, next) => {
    const group = req.path.startsWith('/workspace')
      ? 'workspace'
      : req.path === '/openings'
        ? 'search'
        : 'actions';
    const minute = Math.floor(Date.now() / 60000),
      key = `${req.identity.id}:${group}:${minute}`;
    const count = (limits.get(key) || 0) + 1;
    limits.set(key, count);
    for (const [k] of limits) if (!k.endsWith(`:${minute}`)) limits.delete(k);
    if (count > (group === 'workspace' ? 120 : group === 'search' ? 60 : 20))
      return res.status(429).json({ error: 'Please wait a minute before making more requests.' });
    next();
  });
  app.get('/api/session', async (req, res) =>
    res.json({
      user: { id: req.identity.id, email: req.identity.email },
      role: req.account.role,
      settings: await platform.settings(),
      providers: { catalog: true, adzuna: adzuna.configured },
    }),
  );
  app.post('/api/invitations/accept', async (req, res) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(req.body);
    await platform.accept(req.identity, token);
    res.json({ accepted: true });
  });
  app.get('/api/workspace', async (req, res) => res.json(await platform.load(req.identity.id)));
  app.post('/api/workspace', async (req, res) => {
    if (req.headers['x-workspace-owner'] !== req.identity.id)
      throw httpError(409, 'The signed-in account changed. Reload before saving this workspace.');
    const { workspace, revision } = z
      .object({
        workspace: workspaceSchema,
        revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      })
      .parse(req.body);
    res.json(await platform.save(req.identity.id, workspace, revision));
  });
  app.use('/api/admin', (req, res, next) => {
    if (req.account.role !== 'admin')
      return res.status(403).json({ error: 'Only the owner can manage this platform.' });
    next();
  });
  app.get('/api/admin', async (_req, res) => res.json(await platform.adminOverview()));
  app.get('/api/admin/schema', async (_req, res) =>
    res
      .type('text/plain')
      .send(await readFile(path.join(root, 'supabase', 'multi-user.sql'), 'utf8')),
  );
  app.post('/api/admin/invitations', async (req, res) => {
    const { email } = z.object({ email: z.email().max(300) }).parse(req.body);
    res.json(await platform.invite(email.trim().toLowerCase()));
  });
  app.post('/api/admin/access', async (req, res) => {
    const { email, active } = z
      .object({ email: z.email().max(300), active: z.boolean() })
      .parse(req.body);
    await platform.access(email.toLowerCase(), active);
    res.json({ updated: true });
  });
  app.post('/api/admin/settings', async (req, res) => {
    await platform.saveSettings(settingsSchema.parse(req.body));
    res.json({ updated: true });
  });
  app.post('/api/import-job', async (req, res) => {
    const { url } = z.object({ url: z.string().max(3000) }).parse(req.body);
    const page = await fetchPublicPage(url);
    res.json(extractJob(page.html, page.url));
  });
  app.post('/api/parse-resume', async (req, res) => {
    const { text } = z.object({ text: z.string().min(30).max(50000) }).parse(req.body);
    await platform.reserveAi(req.identity.id);
    res.json(
      await ai(
        'Extract the factual resume into a profile. Use empty strings for missing fields. Never infer achievements, dates, skills, or credentials. Assign a unique short id to every experience. Separate experience/project/education/volunteering entries. Preserve original factual bullet content in details separated by newlines. education is a concise plain-text education section. Keep skills exactly as written.',
        { text },
        parsedProfileSchema,
      ),
    );
  });
  app.post('/api/tailor', async (req, res) => {
    const { profile, job } = z
      .object({ profile: profileSchema, job: jobInputSchema })
      .parse(req.body);
    if (!profile.name.trim() || !profile.experiences.length || job.description.trim().length < 30)
      return res.status(400).json({
        error: 'Add your name, at least one experience/project, and the job requirements first.',
      });
    if (req.body.job?.requirementsComplete === false)
      return res.status(400).json({
        error: 'Add and confirm the full job requirements before tailoring a resume.',
      });
    await platform.reserveAi(req.identity.id);
    const generated = await ai(
      'You are a resume editor. Select and reorder up to 6 relevant entries by sourceId from the supplied profile. Tailor concise bullets for this job using ONLY facts in those source entries. NEVER invent metrics, tools, credentials, dates, employers, or responsibilities. Select skills only from the supplied skills lists, with the exact spelling. Order the selected skills by relevance to the job requirements, placing the strongest supported matches first. Write a short factual summary. matches explains supported requirements, gaps explains missing or unverified requirements without adding them to the resume. changes explains actual editorial choices. Each entry needs a reason. If a requirement is not evidenced, list it in gaps. Do not claim ATS scores or hiring probabilities. Keep the resume concise for an internship/early-career application.',
      { profile: { ...profile, resumeText: '' }, job },
      generatedSchema,
    );
    res.json(groundGenerated(profile, generated));
  });

  app.get('/api/openings', async (req, res) => {
    const settings = await platform.settings(),
      provider = req.query.provider === 'adzuna' ? 'adzuna' : 'catalog';
    if (!settings[provider === 'adzuna' ? 'adzunaEnabled' : 'catalogEnabled'])
      throw httpError(403, 'The owner has paused this job source.');
    // Bind ranking to this verified account; do not accept another user's profile ID.
    const profile =
      req.query.sort === 'profile'
        ? (await platform.load(req.identity.id)).workspace?.profile
        : undefined;
    if (provider === 'catalog') {
      res.json({ ...(await discovery.search(req.query, profile)), provider: 'catalog' });
      return;
    }
    // Adzuna exposes provider pages, not its entire index. Personalize only the returned page.
    // The provider query and shared cache contain no profile or personalized match data.
    const feed = await adzuna.search(
      req.query.sort === 'profile' ? { ...req.query, sort: 'relevance' } : req.query,
    );
    if (req.query.sort !== 'profile') {
      res.json(feed);
      return;
    }
    const ranking = rankOpenings(feed.jobs, profile);
    res.json({
      ...feed,
      jobs: ranking.jobs,
      rankingScope: 'page',
      profileRankingAvailable: ranking.available,
    });
  });
  app.get('/api/openings/:id', async (req, res) => {
    const provider = req.params.id.startsWith('adzuna-') ? 'adzuna' : 'catalog',
      settings = await platform.settings();
    if (!settings[provider === 'adzuna' ? 'adzunaEnabled' : 'catalogEnabled'])
      throw httpError(403, 'The owner has paused this job source.');
    res.json(
      provider === 'adzuna'
        ? await adzuna.detail(req.params.id)
        : await discovery.detail(req.params.id),
    );
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  if (!process.env.VERCEL && existsSync(path.join(root, 'dist', 'index.html'))) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    const status =
      error instanceof z.ZodError
        ? 400
        : error.status || (error.type === 'entity.too.large' ? 413 : 500);
    res.status(status).json({
      error:
        error instanceof z.ZodError
          ? 'Please check the input; a required field is missing or too long.'
          : error.name === 'TimeoutError'
            ? 'The request timed out. Please try again.'
            : error.message || 'Something went wrong.',
    });
  });
  return app;
}
export const app = createApp();
export default app;
