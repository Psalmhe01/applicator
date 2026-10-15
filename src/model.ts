import { z } from 'zod';

export const statuses = [
  'Saved',
  'Preparing',
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
  'Withdrawn',
] as const;
const short = z.string().max(3000);
const long = z.string().max(50000);
export const experienceSchema = z.object({
  id: short,
  kind: z.enum(['Experience', 'Project', 'Education', 'Volunteering']),
  title: short,
  organization: short,
  dates: short,
  details: long,
  skills: z.array(short).max(100),
  url: short,
});
export const profileSchema = z.object({
  name: short,
  email: short,
  phone: short,
  location: short,
  website: short,
  summary: long,
  skills: z.array(short).max(100),
  education: long,
  resumeText: long,
  resumeName: short,
  experiences: z.array(experienceSchema).max(100),
});
const resumeEntrySchema = z.object({
  sourceId: short,
  title: short,
  organization: short,
  dates: short,
  kind: short,
  url: short,
  bullets: z.array(short).max(20),
  reason: short,
});
export const resumeSchema = z.object({
  id: short,
  layout: z.enum(['current', 'classic']).default('current'),
  name: short,
  email: short,
  phone: short,
  location: short,
  website: short,
  education: long,
  summary: long,
  skills: z.array(short).max(100),
  entries: z.array(resumeEntrySchema).max(100),
  matches: z.array(short).max(100),
  gaps: z.array(short).max(100),
  changes: z.array(short).max(100),
  origin: z.enum(['AI', 'Manual']),
  createdAt: short,
  reviewed: z.boolean(),
  downloadedAt: short,
});
export const jobSchema = z.object({
  id: short,
  title: short,
  company: short,
  department: short.default(''),
  departmentGroups: z.array(short).max(20).default([]),
  location: short,
  url: short,
  description: long,
  source: short,
  updatedAt: short,
  status: z.enum(statuses),
  createdAt: short,
  deadline: short,
  appliedAt: short,
  followUp: short,
  notes: long,
  resumes: z.array(resumeSchema).max(50),
  appliedResumeId: short.optional(),
  requirementsComplete: z.boolean().default(true),
});
export const workspaceSchema = z.object({
  version: z.literal(1),
  profile: profileSchema,
  jobs: z.array(jobSchema).max(1000),
  updatedAt: short,
  preferences: z
    .object({ theme: z.enum(['Light', 'Dark', 'System']).default('System') })
    .default({ theme: 'System' }),
});
export type Experience = z.infer<typeof experienceSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Resume = z.infer<typeof resumeSchema>;
export type ResumeLayout = Resume['layout'];
export type Job = z.infer<typeof jobSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export type Status = (typeof statuses)[number];
export const emptyProfile: Profile = {
  name: '',
  email: '',
  phone: '',
  location: '',
  website: '',
  summary: '',
  skills: [],
  education: '',
  resumeText: '',
  resumeName: '',
  experiences: [],
};
export const emptyWorkspace = (): Workspace => ({
  version: 1,
  profile: structuredClone(emptyProfile),
  jobs: [],
  updatedAt: new Date().toISOString(),
  preferences: { theme: 'System' },
});
export const id = () => crypto.randomUUID();
export const splitList = (value: string) => [
  ...new Set(
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function formatDate(value: string) {
  if (!value) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}
export const safeLink = (value: string) => {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
export function manualResume(profile: Profile): Resume {
  return {
    id: id(),
    layout: 'current',
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    website: profile.website,
    education: profile.education,
    summary: profile.summary,
    skills: [...profile.skills],
    entries: profile.experiences
      .filter((e) => e.kind !== 'Education' || !profile.education.trim())
      .map((e) => ({
        sourceId: e.id,
        title: e.title,
        organization: e.organization,
        dates: e.dates,
        kind: e.kind,
        url: e.url,
        bullets: e.details
          .split('\n')
          .map((s) => s.replace(/^\s*[-•]\s*/, '').trim())
          .filter(Boolean),
        reason: 'Selected from your experience bank.',
      })),
    matches: [],
    gaps: [],
    changes: [],
    origin: 'Manual',
    createdAt: new Date().toISOString(),
    reviewed: false,
    downloadedAt: '',
  };
}
export function newJob(input: Partial<Job>): Job {
  return {
    id: id(),
    title: '',
    company: '',
    department: '',
    departmentGroups: [],
    location: '',
    url: '',
    description: '',
    source: 'Added by you',
    updatedAt: '',
    status: 'Saved',
    createdAt: new Date().toISOString(),
    deadline: '',
    appliedAt: '',
    followUp: '',
    notes: '',
    resumes: [],
    requirementsComplete: true,
    ...input,
  };
}
