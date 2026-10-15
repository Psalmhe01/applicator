// Validate complete workspace snapshots at the API boundary; legacy backups gain safe defaults.
import { z } from 'zod';
const short = z.string().max(3000),
  long = z.string().max(50000);
// Source facts in the experience bank are referenced by ID when generating resumes.
const experience = z.object({
  id: short,
  kind: z.enum(['Experience', 'Project', 'Education', 'Volunteering']),
  title: short,
  organization: short,
  dates: short,
  details: long,
  skills: z.array(short).max(100),
  url: short,
});
const profile = z.object({
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
  experiences: z.array(experience).max(100),
});
const entry = z.object({
  sourceId: short,
  title: short,
  organization: short,
  dates: short,
  kind: short,
  url: short,
  bullets: z.array(short).max(20),
  reason: short,
});
// Resume snapshots retain the version used for each submitted application.
const resume = z.object({
  id: short,
  name: short,
  email: short,
  phone: short,
  location: short,
  website: short,
  education: long,
  summary: long,
  skills: z.array(short).max(100),
  entries: z.array(entry).max(100),
  matches: z.array(short).max(100),
  gaps: z.array(short).max(100),
  changes: z.array(short).max(100),
  origin: z.enum(['AI', 'Manual']),
  createdAt: short,
  reviewed: z.boolean(),
  downloadedAt: short,
});
const job = z.object({
  id: short,
  title: short,
  company: short,
  location: short,
  url: short,
  description: long,
  source: short,
  updatedAt: short,
  status: z.enum([
    'Saved',
    'Preparing',
    'Applied',
    'Interviewing',
    'Offer',
    'Rejected',
    'Withdrawn',
  ]),
  createdAt: short,
  deadline: short,
  appliedAt: short,
  followUp: short,
  notes: long,
  resumes: z.array(resume).max(50),
  appliedResumeId: short.optional(),
  requirementsComplete: z.boolean().default(true),
});
// Preserve version-one backup compatibility while adding account preferences.
export const workspaceSchema = z.object({
  version: z.literal(1),
  profile,
  jobs: z.array(job).max(1000),
  updatedAt: short,
  preferences: z
    .object({ theme: z.enum(['Light', 'Dark', 'System']).default('System') })
    .default({ theme: 'System' }),
});
// These shared limits and source switches can be changed only by the owner.
export const settingsSchema = z.object({
  signupEnabled: z.boolean().default(true),
  aiDailyLimit: z.number().int().min(1).max(100).default(10),
  globalAiDailyLimit: z.number().int().min(1).max(1000).default(100),
  catalogEnabled: z.boolean().default(true),
  adzunaEnabled: z.boolean().default(true),
});
