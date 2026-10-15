import { createHash } from 'node:crypto';
import { cleanHtml } from './domain.mjs';
import { careerLevel, workArrangement } from './openings.mjs';
import { httpError } from './platform.mjs';
export function createAdzuna({
  env = process.env,
  fetcher = fetch,
  cache,
  reserve = async () => {},
} = {}) {
  const configured = Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
    flight = new Map();
  function ready() {
    if (!configured)
      throw httpError(
        503,
        'The owner has not configured US job search yet. Company boards are available.',
      );
  }
  function normalize(raw) {
    let url;
    try {
      url = new URL(raw.redirect_url);
      if (!/(^|\.)adzuna\.(com|co\.uk)$/.test(url.hostname)) return null;
      url.protocol = 'https:';
    } catch {
      return null;
    }
    const title = cleanHtml(raw.title).slice(0, 300),
      location = String(raw.location?.display_name || '').slice(0, 300);
    return {
      id: `adzuna-${raw.id}`,
      title,
      company: String(raw.company?.display_name || 'Company not specified').slice(0, 300),
      location,
      url: url.href,
      description: cleanHtml(raw.description).slice(0, 40000),
      source: 'Adzuna',
      updatedAt: raw.created || '',
      status: 'Saved',
      createdAt: new Date().toISOString(),
      deadline: '',
      appliedAt: '',
      followUp: '',
      notes: '',
      resumes: [],
      requirementsComplete: false,
      careerLevel: careerLevel(title),
      workArrangement: workArrangement(location),
      department: raw.category?.label || '',
    };
  }
  return {
    configured,
    async search(params = {}) {
      ready();
      const page = Math.max(1, Math.min(1000, Math.floor(Number(params.page) || 1))),
        level = params.level || 'Early career';
      const q = String(params.q || '')
        .trim()
        .slice(0, 300);
      const query = new URLSearchParams({
        results_per_page: '24',
        what: q,
        where: String(params.location || '')
          .trim()
          .slice(0, 300),
        sort_by: params.sort === 'relevance' ? 'relevance' : 'date',
      });
      // Adzuna's published OpenAPI spec supports OR keywords alongside the user's search.
      // This includes several early-career terms instead of requiring "graduate AND junior".
      const careerKeywords = {
        Internship: 'intern internship',
        'Entry level': 'graduate junior apprentice entry',
        'Early career': 'intern internship graduate junior apprentice entry',
      }[level];
      if (careerKeywords) query.set('what_or', careerKeywords);
      if (params.company) query.set('company', String(params.company).slice(0, 300));
      if (params.work === 'Remote') query.set('what', `${q} remote`.trim());
      else if (params.work === 'Hybrid') query.set('what', `${q} hybrid`.trim());
      else if (params.work === 'On site') query.set('what', `${q} onsite`.trim());
      const key = `adzuna-search-${createHash('sha256').update(`${page}:${query}`).digest('hex')}`;
      const cached = await cache.cacheGet(key);
      if (cached) return cached;
      if (flight.has(key)) return flight.get(key);
      const task = (async () => {
        await reserve();
        query.set('app_id', env.ADZUNA_APP_ID);
        query.set('app_key', env.ADZUNA_APP_KEY);
        query.set('content-type', 'application/json');
        let response;
        try {
          response = await fetcher(
            `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${query}`,
            {
              headers: { Accept: 'application/json' },
              signal: AbortSignal.timeout(20000),
            },
          );
        } catch {
          throw httpError(
            502,
            'US job search could not be reached. Try again or use Company boards.',
          );
        }
        if (!response.ok)
          throw httpError(
            response.status === 429 ? 429 : 502,
            'US job search is temporarily unavailable. The owner can check its provider credentials and quota.',
          );
        let raw;
        try {
          raw = await response.json();
        } catch {
          throw httpError(502, 'US job search returned an unreadable response.');
        }
        if (!Array.isArray(raw.results))
          throw httpError(502, 'US job search returned an unexpected response.');
        const jobs = raw.results.map(normalize).filter(Boolean),
          total = Number(raw.count) || 0;
        // Provider filters use keyword matching; do not claim the inferred tags are guaranteed classifications.
        const data = {
          jobs,
          total,
          page,
          pages: Math.min(1000, Math.max(1, Math.ceil(total / 24))),
          pageSize: 24,
          available: total,
          companies: [],
          sourceCount: null,
          sourceTotal: null,
          failed: [],
          fetchedAt: new Date().toISOString(),
          provider: 'adzuna',
        };
        if (cache.cacheSetMany)
          await cache.cacheSetMany(jobs.map((job) => ({ key: `adzuna-job-${job.id}`, data: job })));
        else await Promise.all(jobs.map((job) => cache.cacheSet(`adzuna-job-${job.id}`, job)));
        await cache.cacheSet(key, data);
        return data;
      })();
      flight.set(key, task);
      try {
        return await task;
      } finally {
        flight.delete(key);
      }
    },
    async detail(id) {
      ready();
      const job = await cache.cacheGet(`adzuna-job-${id}`);
      if (!job) throw httpError(404, 'This search result expired. Search again before saving it.');
      return job;
    },
  };
}
