import type { Job, Resume, ResumeLayout } from './model';

export type ResumeSection = {
  id: string;
  title: string;
  text?: string;
  skills?: string[];
  entries?: Resume['entries'];
};

// One section model keeps the preview and both document exports in agreement.
export function resumeSections(resume: Resume): ResumeSection[] {
  const classic = resume.layout === 'classic';
  const sections: ResumeSection[] = [];
  const education = resume.entries.filter((entry) => entry.kind === 'Education');
  const addEducation = () => {
    if (resume.education.trim() || education.length)
      sections.push({
        id: 'education',
        title: 'Education',
        text: resume.education,
        entries: education,
      });
  };
  if (classic) addEducation();
  if (resume.summary.trim())
    sections.push({ id: 'profile', title: 'Profile', text: resume.summary });
  if (!classic) addEducation();
  if (resume.skills.length)
    sections.push({
      id: 'skills',
      title: classic ? 'Technical Skills' : 'Skills',
      skills: resume.skills,
    });
  const kinds = [...new Set(resume.entries.map((entry) => entry.kind))];
  for (const kind of [
    'Experience',
    'Project',
    'Volunteering',
    ...kinds.filter(
      (kind) => !['Education', 'Experience', 'Project', 'Volunteering'].includes(kind),
    ),
  ]) {
    const entries = resume.entries.filter((entry) => entry.kind === kind);
    if (!entries.length) continue;
    sections.push({
      id: `entries-${kind}`,
      title:
        kind === 'Project'
          ? 'Projects'
          : classic && kind === 'Experience'
            ? 'Relevant Experience'
            : classic && kind === 'Volunteering'
              ? 'Leadership and Volunteering'
              : kind.trim() || 'Additional Experience',
      entries,
    });
  }
  return sections;
}

export function resumeEntryHeading(entry: Resume['entries'][number], layout: ResumeLayout) {
  return layout === 'classic'
    ? {
        heading: entry.organization || entry.title,
        subheading: entry.organization && entry.organization !== entry.title ? entry.title : '',
      }
    : { heading: [entry.title, entry.organization].filter(Boolean).join(' — '), subheading: '' };
}

export function resumeContact(resume: Resume) {
  return [resume.email, resume.phone, resume.location, resume.website]
    .filter(Boolean)
    .join(resume.layout === 'classic' ? ' • ' : ' | ');
}

export function resumeFilename(resume: Resume, job: Job, extension: 'pdf' | 'docx') {
  return (
    `${resume.name || 'Resume'}-${job.company}-${job.title}`
      .replace(/[^\p{L}\p{N}_. -]/gu, '')
      .slice(0, 140) + `.${extension}`
  );
}
