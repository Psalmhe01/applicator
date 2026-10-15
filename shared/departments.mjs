// Shared labels keep company-board filtering and the UI consistent across sources.
export const departmentOptions = [
  { value: 'software', label: 'Software Engineering' },
  { value: 'data', label: 'Data & AI' },
  { value: 'it-security', label: 'IT & Cybersecurity' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'product-design', label: 'Product & Design' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'science', label: 'Science & Research' },
  { value: 'business-finance', label: 'Business & Finance' },
  { value: 'marketing-sales', label: 'Marketing & Sales' },
  { value: 'operations', label: 'Operations' },
  { value: 'education', label: 'Education' },
  { value: 'hr', label: 'Human Resources' },
  { value: 'legal', label: 'Legal & Policy' },
  { value: 'other', label: 'Other / Not specified' },
];
const rules = [
  [
    'software',
    /\b(software|swe|front[ -]?end|back[ -]?end|full[ -]?stack|web developer|mobile (?:app|developer)|ios|android|programmer|application development)\b/i,
  ],
  [
    'data',
    /\b(data|analytics|machine learning|artificial intelligence|ai|business intelligence)\b/i,
    /\bdata entry\b/i,
  ],
  [
    'it-security',
    /\b(it|information technology|cyber ?security|security|infrastructure|network|system administrator|systems administration|help ?desk|devops|site reliability|sre|cloud)\b/i,
    /\b(physical security|security guard|loss prevention)\b/i,
  ],
  [
    'engineering',
    /\b(engineer(?:ing)?|civil|mechanical|electrical|aerospace|robotics|hardware|embedded)\b/i,
  ],
  ['product-design', /\b(product|design(?:er)?|ux|ui|creative)\b/i],
  [
    'healthcare',
    /\b(health(?:care)?|health care|medical|clinical|nurs(?:e|ing)|physician|pharma(?:cy|ceutical)?|patient|dental|therap(?:y|ist))\b/i,
  ],
  [
    'science',
    /\b(scien(?:ce|tific|tist)|research|laboratory|biology|biological|chemistry|physics)\b/i,
    /\b(market research|user research|ux research)\b/i,
  ],
  [
    'business-finance',
    /\b(finance|financial|accounting|accountant|business|banking|audit|economics|consulting|strategy|tax)\b/i,
  ],
  [
    'marketing-sales',
    /\b(marketing|sales|advertising|communications|public relations|business development|growth)\b/i,
  ],
  [
    'operations',
    /\b(operations|logistics|supply chain|manufacturing|production|administration|administrative|customer service|customer support|retail|warehouse|data entry|physical security|security guard)\b/i,
  ],
  ['education', /\b(education|teaching|teacher|tutor|academic)\b/i],
  ['hr', /\b(human resources|hr|people|talent|recruit(?:ing|er|ment))\b/i],
  ['legal', /\b(legal|law|attorney|policy|compliance|government affairs)\b/i],
];
export function departmentGroups(title = '', department = '') {
  // Use public department/title metadata, never company names or description boilerplate.
  // Multiple groups are intentional: a software engineer may also be in Engineering.
  const texts = [title, department].map((value) =>
    String(value).normalize('NFKC').replace(/[_/]+/g, ' '),
  );
  const groups = rules
    .filter(([_id, include, exclude]) =>
      texts.some((text) => include.test(text) && !exclude?.test(text)),
    )
    .map(([id]) => id);
  return groups.length ? groups : ['other'];
}
export function departmentLabels(groups = []) {
  return groups
    .map((group) => departmentOptions.find((option) => option.value === group)?.label)
    .filter(Boolean);
}
export function validateDepartment(selected) {
  if (selected && !departmentOptions.some((option) => option.value === selected))
    throw Object.assign(new Error('Choose one of the listed departments.'), { status: 400 });
}
export function matchesDepartment(job, selected) {
  if (!selected) return true;
  return departmentGroups(job.title, job.department).includes(selected);
}
