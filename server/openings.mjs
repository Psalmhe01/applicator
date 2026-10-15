import { cleanHtml } from './domain.mjs';

// Public employer boards, maintained here so applicants never need to enter slugs.
export const sources = [
  ['cloudflare', 'Cloudflare'],
  ['databricks', 'Databricks'],
  ['figma', 'Figma'],
  ['stripe', 'Stripe'],
  ['airbnb', 'Airbnb'],
  ['discord', 'Discord'],
  ['reddit', 'Reddit'],
  ['duolingo', 'Duolingo'],
  ['roblox', 'Roblox'],
  ['coinbase', 'Coinbase'],
  ['verkada', 'Verkada'],
  ['andurilindustries', 'Anduril'],
  ['spacex', 'SpaceX'],
  ['lucidmotors', 'Lucid Motors'],
  ['mongodb', 'MongoDB'],
  ['datadog', 'Datadog'],
  ['asana', 'Asana'],
  ['dropbox', 'Dropbox'],
  ['lyft', 'Lyft'],
  ['pinterest', 'Pinterest'],
  ['affirm', 'Affirm'],
  ['chime', 'Chime'],
  ['brex', 'Brex'],
  ['robinhood', 'Robinhood'],
  ['sofi', 'SoFi'],
  ['toast', 'Toast'],
  ['samsara', 'Samsara'],
  ['okta', 'Okta'],
  ['twilio', 'Twilio'],
  ['elastic', 'Elastic'],
  ['cockroachlabs', 'Cockroach Labs'],
  ['gusto', 'Gusto'],
  ['scaleai', 'Scale AI'],
  ['doordashusa', 'DoorDash'],
]
  .map(([slug, company]) => ({ provider: 'greenhouse', slug, company }))
  .concat(
    [
      ['palantir', 'Palantir'],
      ['spotify', 'Spotify'],
      ['zoox', 'Zoox'],
      ['veeva', 'Veeva'],
      ['wealthsimple', 'Wealthsimple'],
    ].map(([slug, company]) => ({ provider: 'lever', slug, company })),
  );

export function careerLevel(title) {
  if (/\b(intern(?:ship)?|co[ -]?op|working student|werkstudent|student assistant)\b/i.test(title))
    return 'Internship';
  if (
    /\b(new grad(?:uate)?|university grad(?:uate)?|graduate|early career|junior|entry[ -]level|apprentice(?:ship)?)\b/i.test(
      title,
    )
  )
    return 'Entry level';
  return 'Other roles';
}
export function workArrangement(location, explicit = '') {
  const value = `${explicit} ${location}`;
  if (/\bhybrid\b/i.test(value)) return 'Hybrid';
  if (/\bremote\b/i.test(value)) return 'Remote';
  if (/\bon[ -]?site\b|\bin[ -]office\b/i.test(value)) return 'On site';
  return 'Not specified';
}
function text(value, limit = 300) {
  return String(value || '').slice(0, limit);
}
function description(html) {
  if (!html) return '';
  // Greenhouse content is sometimes HTML-encoded twice.
  const decoded = /&lt;\/?(?:p|div|h[1-6]|ul|li|br)\b/i.test(html || '') ? cleanHtml(html) : html;
  return cleanHtml(decoded).slice(0, 40000);
}
export function normalizeOpening(raw, source) {
  if (source.provider === 'greenhouse' && raw.internal_job_id === null) return null; // Talent pools are not vacancies.
  const greenhouse = source.provider === 'greenhouse';
  const title = text(greenhouse ? raw.title : raw.text),
    location = text(
      greenhouse
        ? raw.location?.name
        : raw.categories?.allLocations?.join('; ') || raw.categories?.location,
    );
  const url = text(greenhouse ? raw.absolute_url : raw.applyUrl || raw.hostedUrl, 3000);
  try {
    if (new URL(url).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  if (!title || !raw.id) return null;
  const fullDescription = greenhouse
    ? description(raw.content)
    : [
        raw.descriptionPlain || description(raw.description),
        ...(raw.lists || []).map((list) => `${list.text || ''}\n${description(list.content)}`),
        raw.additionalPlain || description(raw.additional),
        raw.salaryDescriptionPlain || description(raw.salaryDescription),
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 40000);
  // Lever's public API does not promise a posting timestamp. Do not invent one.
  const updatedAt = greenhouse && Number.isFinite(Date.parse(raw.updated_at)) ? raw.updated_at : '';
  return {
    id: `${source.provider}-${source.slug}-${raw.id}`,
    title,
    company: source.company,
    location,
    url,
    description: fullDescription,
    source: `${greenhouse ? 'Greenhouse' : 'Lever'} · ${source.company}`,
    updatedAt,
    status: 'Saved',
    createdAt: new Date().toISOString(),
    deadline: '',
    appliedAt: '',
    followUp: '',
    notes: '',
    resumes: [],
    requirementsComplete: true,
    careerLevel: careerLevel(title),
    workArrangement: workArrangement(location, greenhouse ? '' : raw.workplaceType),
    department: text(
      greenhouse
        ? raw.departments?.map((d) => d.name).join(', ')
        : raw.categories?.department || raw.categories?.team,
    ),
    sourceKey: `${source.provider}:${source.slug}`,
    postingId: String(raw.id),
  };
}
function endpoint(source, id) {
  return source.provider === 'greenhouse'
    ? `https://boards-api.greenhouse.io/v1/boards/${source.slug}/jobs${id ? `/${encodeURIComponent(id)}?content=true` : ''}`
    : `https://api.lever.co/v0/postings/${source.slug}${id ? `/${encodeURIComponent(id)}` : ''}?mode=json`;
}
async function readBoard(source, fetcher, id, deadline) {
  const signal = deadline
    ? AbortSignal.any([deadline, AbortSignal.timeout(15000)])
    : AbortSignal.timeout(15000);
  const response = await fetcher(endpoint(source, id), { signal });
  if (!response.ok) {
    const error = new Error(
      response.status === 404
        ? 'This opening is no longer listed by the employer.'
        : 'The company board is temporarily unavailable.',
    );
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return response.json();
}
export function selectOpenings(jobs, params = {}) {
  const q = text(params.q, 300).trim().toLowerCase().split(/\s+/).filter(Boolean),
    location = text(params.location).trim().toLowerCase();
  const level = ['All', 'Early career', 'Internship', 'Entry level', 'Other roles'].includes(
    params.level,
  )
    ? params.level
    : 'Early career';
  const filtered = jobs.filter((job) => {
    const haystack = `${job.title} ${job.company} ${job.location} ${job.department}`.toLowerCase();
    return (
      q.every((term) => haystack.includes(term)) &&
      (!location || job.location.toLowerCase().includes(location)) &&
      (!params.company || job.company === params.company) &&
      (!params.work || job.workArrangement === params.work) &&
      (level === 'All' ||
        (level === 'Early career' && job.careerLevel !== 'Other roles') ||
        job.careerLevel === level)
    );
  });
  filtered.sort((a, b) => {
    if (params.sort === 'company')
      return a.company.localeCompare(b.company) || a.title.localeCompare(b.title);
    if (params.sort === 'title')
      return a.title.localeCompare(b.title) || a.company.localeCompare(b.company);
    return (
      (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) ||
      a.company.localeCompare(b.company) ||
      a.title.localeCompare(b.title)
    );
  });
  const pageSize = 24,
    pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.page) || 1)));
  return {
    jobs: filtered
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ sourceKey, postingId, ...job }) => ({
        ...job,
        description: job.description.slice(0, 1000),
      })),
    total: filtered.length,
    page,
    pages,
    pageSize,
  };
}
export function createDiscovery({ catalog = sources, fetcher = fetch, now = Date.now } = {}) {
  let cache = null,
    flight = null;
  async function load(force = false) {
    if (flight) return flight;
    // Ordinary queries share one snapshot; explicit refresh is limited to once a minute.
    if (cache && now() - cache.time < (force ? 60000 : 15 * 60000)) return cache;
    flight = (async () => {
      let cursor = 0;
      const results = new Array(catalog.length),
        deadline = AbortSignal.timeout(55000);
      await Promise.all(
        Array.from({ length: Math.min(6, catalog.length) }, async () => {
          while (cursor < catalog.length) {
            const i = cursor++,
              source = catalog[i];
            try {
              const data = await readBoard(source, fetcher, undefined, deadline);
              const raw = source.provider === 'greenhouse' ? data.jobs : data;
              if (!Array.isArray(raw)) throw new Error('Invalid board response');
              results[i] = {
                jobs: raw.map((j) => normalizeOpening(j, source)).filter(Boolean),
              };
            } catch {
              results[i] = { failed: source.company };
            }
          }
        }),
      );
      const successful = results.filter((r) => !r.failed);
      if (!successful.length) {
        const error = new Error('Could not reach job boards. Check your connection and try again.');
        error.status = 502;
        throw error;
      }
      const seen = new Set(),
        jobs = successful
          .flatMap((r) => r.jobs)
          .filter((j) => {
            if (seen.has(j.url)) return false;
            seen.add(j.url);
            return true;
          });
      // Do not retain failed boards' old vacancies: closed listings should disappear on refresh.
      cache = {
        time: now(),
        jobs,
        failed: results.filter((r) => r.failed).map((r) => r.failed),
        sourceCount: successful.length,
      };
      return cache;
    })();
    try {
      return await flight;
    } finally {
      flight = null;
    }
  }
  return {
    async search(params = {}) {
      const snapshot = await load(params.refresh === '1');
      return {
        ...selectOpenings(snapshot.jobs, params),
        companies: [...new Set(snapshot.jobs.map((j) => j.company))].sort(),
        available: snapshot.jobs.length,
        sourceCount: snapshot.sourceCount,
        sourceTotal: catalog.length,
        failed: snapshot.failed,
        fetchedAt: new Date(snapshot.time).toISOString(),
        nextRefreshAt: new Date(snapshot.time + 15 * 60000).toISOString(),
      };
    },
    async detail(id) {
      const snapshot = await load();
      const job = snapshot.jobs.find((j) => j.id === id);
      if (!job) {
        const error = new Error(
          'This opening is no longer in the discovery feed. Refresh and try another opening.',
        );
        error.status = 404;
        throw error;
      }
      const source = catalog.find((s) => `${s.provider}:${s.slug}` === job.sourceKey);
      const raw = await readBoard(source, fetcher, job.postingId),
        full = normalizeOpening(raw, source);
      if (!full) {
        const error = new Error('This opening is no longer listed by the employer.');
        error.status = 404;
        throw error;
      }
      const { sourceKey, postingId, ...result } = full;
      return result;
    },
  };
}
