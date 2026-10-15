import { load } from 'cheerio';
import { z } from 'zod';

const text = z.string().max(50000);
export const experienceSchema = z.object({
  id: z.string(),
  kind: z.enum(['Experience', 'Project', 'Education', 'Volunteering']),
  title: text,
  organization: text,
  dates: text,
  details: text,
  skills: z.array(z.string()).max(100),
  url: z.string(),
});
export const profileSchema = z.object({
  name: text,
  email: text,
  phone: text,
  location: text,
  website: text,
  summary: text,
  skills: z.array(z.string()).max(100),
  education: text,
  resumeText: text,
  resumeName: text,
  experiences: z.array(experienceSchema).max(100),
});
export const jobInputSchema = z.object({
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(300),
  description: text,
  location: z.string().max(300).default(''),
  url: z.string().max(3000).default(''),
});
// Structured AI output still needs local validation before it can become a resume.
export const generatedSchema = z.object({
  summary: z.string().max(1800),
  skills: z.array(z.string()).max(30),
  entries: z
    .array(
      z.object({
        sourceId: z.string(),
        bullets: z.array(z.string().max(1000)).max(5),
        reason: z.string().max(800),
      }),
    )
    .max(8),
  matches: z.array(z.string().max(400)).max(15),
  gaps: z.array(z.string().max(400)).max(15),
  changes: z.array(z.string().max(800)).max(15),
});
export const parsedProfileSchema = profileSchema.omit({
  resumeText: true,
  resumeName: true,
});

export function cleanHtml(html) {
  const $ = load(html || '');
  $('script,style,nav,footer,header,svg,noscript,form').remove();
  $('br').replaceWith('\n');
  $('p,li,h1,h2,h3,h4,div,section').each((_i, el) => {
    $(el).append('\n');
  });
  return $.text()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

// Prefer JobPosting structured data, then fall back to readable page content.
export function extractJob(html, url) {
  const $ = load(html);
  let posting;
  function walk(data) {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data)) {
      data.forEach(walk);
      return;
    }
    if ([data['@type']].flat().includes('JobPosting')) posting = data;
    if (data['@graph']) walk(data['@graph']);
  }
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {}
  });
  if (posting)
    return {
      title: String(posting.title || ''),
      company: String(posting.hiringOrganization?.name || ''),
      location: String(
        posting.jobLocation?.address?.addressLocality ||
          (posting.jobLocationType === 'TELECOMMUTE' ? 'Remote' : ''),
      ),
      description: cleanHtml(posting.description).slice(0, 40000),
      url,
    };
  const main = $('main,article,[role="main"]').first().html();
  return {
    title: ($('h1').first().text() || $('title').text()).trim().slice(0, 300),
    company: ($('meta[property="og:site_name"]').attr('content') || '').slice(0, 300),
    location: '',
    description: cleanHtml(main || html).slice(0, 40000),
    url,
  };
}

// Restore titles, employers and dates from the bank. Reject invented or repeated
// source IDs, and flag suggested skills that the user has not supplied.
export function groundGenerated(profile, generated) {
  const source = new Map(profile.experiences.map((e) => [e.id, e]));
  const seen = new Set();
  const entries = generated.entries.map((entry) => {
    const exp = source.get(entry.sourceId);
    if (!exp || seen.has(entry.sourceId))
      throw new Error('The AI returned an unrecognized experience. Please try again.');
    seen.add(entry.sourceId);
    return {
      ...entry,
      title: exp.title,
      organization: exp.organization,
      dates: exp.dates,
      kind: exp.kind,
      url: exp.url,
    };
  });
  const knownSkills = new Set(
    [...profile.skills, ...profile.experiences.flatMap((e) => e.skills)].map((s) =>
      s.toLowerCase(),
    ),
  );
  const unsupported = generated.skills.filter((s) => !knownSkills.has(s.toLowerCase()));
  return {
    ...generated,
    skills: generated.skills.filter((s) => knownSkills.has(s.toLowerCase())),
    entries,
    gaps: [
      ...generated.gaps,
      ...unsupported.map((s) => `AI suggested an unverified skill (${s}); it was excluded.`),
    ],
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    website: profile.website,
    education: profile.education,
  };
}
