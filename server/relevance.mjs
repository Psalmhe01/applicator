// Explainable keyword ranking only: a mention is not proof of eligibility or hiring odds.
const stopwords = new Set(
  `a an and are as at be been being by can com could do for from has have how i in into is it its me my of on or our that the their them then there these they this those to us was we were what when where which who will with you your built build created create developed develop designed design implemented implement using used use work worked working project projects team teams experience experiences skills skill university college bachelor bachelors degree year years student students intern internship`.split(
    /\s+/,
  ),
);
const aliasGroups = [
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['node.js', 'nodejs'],
  ['react', 'react.js', 'reactjs'],
  ['postgresql', 'postgres'],
  ['c#', 'c sharp'],
  ['c++', 'cpp'],
  ['.net', 'dotnet'],
];
const normalize = (value) =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function matcher(term) {
  const aliases = aliasGroups.find((group) => group.includes(term)) || [term];
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])(?:${aliases.map(escape).join('|')})(?=$|[^\\p{L}\\p{N}_])`,
    'u',
  );
}
function terms(profile = {}) {
  const experiences = Array.isArray(profile.experiences) ? profile.experiences : [];
  const known = [...(profile.skills || []), ...experiences.flatMap((entry) => entry.skills || [])];
  const skills = [],
    seen = new Set(),
    skillWords = new Set();
  for (const label of known) {
    const term = normalize(label);
    const aliases = aliasGroups.find((group) => group.includes(term)) || [term];
    if (!term || seen.has(aliases[0])) continue;
    seen.add(aliases[0]);
    aliases.forEach((alias) => alias.split(' ').forEach((word) => skillWords.add(word)));
    skills.push({ label, match: matcher(term) });
    if (skills.length === 150) break;
  }
  // Contact fields, employer-name fields, dates and raw resume text are not ranking signals.
  const text = [
    profile.summary,
    profile.education,
    ...experiences.flatMap((entry) => [entry.title, String(entry.details || '').slice(0, 2000)]),
  ]
    .map((value) => String(value || '').slice(0, 5000))
    .join(' ');
  const counts = new Map();
  for (const word of normalize(text).split(' ')) {
    if (word.length < 3 || /^\d+$/.test(word) || stopwords.has(word) || skillWords.has(word))
      continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  const keywords = [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 24)
    .map(([label]) => ({ label, match: matcher(label) }));
  return { skills, keywords };
}
export function rankOpenings(jobs, profile) {
  const { skills, keywords } = terms(profile);
  const available = Boolean(skills.length || keywords.length);
  const ranked = jobs.map((job, index) => {
    const title = normalize(job.title),
      department = normalize(job.department),
      description = normalize(job.description);
    const matchedSkills = [],
      matchedKeywords = [];
    let score = 0;
    for (const term of skills) {
      const points =
        (term.match.test(title) ? 8 : 0) +
        (term.match.test(department) ? 4 : 0) +
        (term.match.test(description) ? 3 : 0);
      if (points) {
        score += points;
        matchedSkills.push(term.label);
      }
    }
    for (const term of keywords) {
      const points =
        (term.match.test(title) ? 2 : 0) +
        (term.match.test(department) ? 1 : 0) +
        (term.match.test(description) ? 0.5 : 0);
      if (points) {
        score += points;
        matchedKeywords.push(term.label);
      }
    }
    return {
      job,
      index,
      score,
      profileMatch: { skills: matchedSkills, keywords: matchedKeywords },
    };
  });
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  // Return fresh objects; personalized matches must never enter a shared provider cache.
  return { available, jobs: ranked.map(({ job, profileMatch }) => ({ ...job, profileMatch })) };
}
