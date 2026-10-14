import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { fetchPublicPage } from './security.mjs';
import { cleanHtml, extractJob, profileSchema, parsedProfileSchema, generatedSchema, jobInputSchema, groundGenerated } from './domain.mjs';
import { generateJson } from './gemini.mjs';
import { createDiscovery } from './openings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root,'.env'), quiet: true });
export const app = express();
app.disable('x-powered-by');
app.use((req,res,next) => {
  // This personal server binds only to loopback. Block DNS rebinding and cross-site API calls.
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return res.status(403).json({ error: 'This server only accepts local requests.' });
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control','no-store');
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):(5173|8787)$/.test(origin)) return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
    if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: 'Use JSON requests.' });
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
const limits = new Map();
app.use('/api', (req,res,next) => {
  if (req.path === '/health') return next();
  const isSearch=req.path==='/openings';
  const minute = Math.floor(Date.now()/60000), key = `${req.socket.remoteAddress}:${isSearch?'search':'actions'}:${minute}`;
  const count = (limits.get(key) || 0) + 1; limits.set(key,count);
  for (const [k] of limits) if (!k.endsWith(`:${minute}`)) limits.delete(k);
  if (count > (isSearch?240:20)) return res.status(429).json({ error: 'Please wait a minute before making more requests.' });
  next();
});
app.get('/api/health', (_req,res) => res.json({ ok: true, aiConfigured: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' }));
app.post('/api/configure-ai', (req,res) => {
  const { key } = z.object({ key: z.string().min(20).max(250) }).parse(req.body);
  process.env.GEMINI_API_KEY = key.trim();
  res.json({ configured: true });
});
app.post('/api/import-job', async (req,res) => {
  const { url } = z.object({ url: z.string().max(3000) }).parse(req.body);
  const page = await fetchPublicPage(url);
  res.json(extractJob(page.html,page.url));
});
app.post('/api/parse-resume', async (req,res) => {
  const { text } = z.object({ text: z.string().min(30).max(50000) }).parse(req.body);
  res.json(await generateJson('Extract the factual resume into a profile. Use empty strings for missing fields. Never infer achievements, dates, skills, or credentials. Assign a unique short id to every experience. Separate experience/project/education/volunteering entries. Preserve original factual bullet content in details separated by newlines. education is a concise plain-text education section. Keep skills exactly as written.', { text }, parsedProfileSchema));
});
app.post('/api/tailor', async (req,res) => {
  const { profile, job } = z.object({ profile: profileSchema, job: jobInputSchema }).parse(req.body);
  if (!profile.name.trim() || !profile.experiences.length || job.description.trim().length < 30) return res.status(400).json({ error: 'Add your name, at least one experience/project, and the job requirements first.' });
  const generated = await generateJson('You are a resume editor. Select and reorder up to 6 relevant entries by sourceId from the supplied profile. Tailor concise bullets for this job using ONLY facts in those source entries. NEVER invent metrics, tools, credentials, dates, employers, or responsibilities. Select skills only from the supplied skills lists, with the exact spelling. Write a short factual summary. matches explains supported requirements, gaps explains missing or unverified requirements without adding them to the resume. changes explains actual editorial choices. Each entry needs a reason. If a requirement is not evidenced, list it in gaps. Do not claim ATS scores or hiring probabilities. Keep the resume concise for an internship/early-career application.', { profile: { ...profile, resumeText: '' }, job }, generatedSchema);
  res.json(groundGenerated(profile,generated));
});

const discovery = createDiscovery();
app.get('/api/openings', async (req,res) => {
  res.json(await discovery.search(req.query));
});
app.get('/api/openings/:id', async (req,res) => {
  res.json(await discovery.detail(req.params.id));
});
app.use('/api', (_req,res) => res.status(404).json({ error: 'API route not found.' }));
if (existsSync(path.join(root,'dist','index.html'))) {
  app.use(express.static(path.join(root,'dist')));
  app.get('/{*path}', (_req,res) => res.sendFile(path.join(root,'dist','index.html')));
}
app.use((error,_req,res,_next) => {
  const status = error instanceof z.ZodError ? 400 : error.status || (error.type === 'entity.too.large' ? 413 : 500);
  res.status(status).json({ error: error instanceof z.ZodError ? 'Please check the input; a required field is missing or too long.' : error.name === 'TimeoutError' ? 'The request timed out. Your work is saved; try again.' : error.message || 'Something went wrong.' });
});
if (process.env.NODE_ENV !== 'test') app.listen(Number(process.env.PORT || 8787),'127.0.0.1', () => console.log(`Applicator local server: http://127.0.0.1:${process.env.PORT || 8787}`));
