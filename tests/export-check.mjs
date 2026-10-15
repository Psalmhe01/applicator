// Exercise the real client exporters with synthetic data. This authoring runner
// stays separate from npm test because it writes PDF/DOCX QA files.
import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { load } from 'cheerio';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(
  process.env.APPLICATOR_QA_OUTPUT || path.join(root, 'work', 'export-check'),
);
const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const originalFetch = globalThis.fetch;
const normalize = (value) => value.normalize('NFC').replace(/\s+/gu, ' ').trim();

function assertOrder(text, values, description) {
  let position = 0;
  for (const value of values) {
    const found = text.indexOf(value, position);
    assert.ok(found >= position, `${description}: missing or reordered ${value}`);
    position = found + value.length;
  }
}

function expectedHeadings(layout, long) {
  return [
    ...(layout === 'classic'
      ? ['EDUCATION', 'PROFILE', 'TECHNICAL SKILLS', 'RELEVANT EXPERIENCE']
      : ['PROFILE', 'EDUCATION', 'SKILLS', 'EXPERIENCE']),
    'PROJECTS',
    ...(long
      ? [layout === 'classic' ? 'LEADERSHIP AND VOLUNTEERING' : 'VOLUNTEERING', 'AWARDS']
      : []),
  ];
}

function assertResumeContent(text, resume, long, description) {
  const content = normalize(text);
  const upper = content.toUpperCase();
  const headings = expectedHeadings(resume.layout, long);
  assertOrder(upper, headings, `${description} sections`);
  assert.equal(
    (upper.match(/\bEDUCATION\b/g) || []).length,
    1,
    `${description}: one Education heading`,
  );
  for (const value of [
    resume.name,
    resume.email,
    resume.phone,
    resume.location,
    resume.website,
    resume.summary,
    resume.education,
  ]) {
    if (value.trim())
      assert.ok(content.includes(normalize(value)), `${description}: missing ${value}`);
  }
  const skillHeading = resume.layout === 'classic' ? 'TECHNICAL SKILLS' : 'SKILLS';
  const skillStart = upper.indexOf(skillHeading) + skillHeading.length;
  const skillEnd = upper.indexOf(headings[headings.indexOf(skillHeading) + 1], skillStart);
  assertOrder(
    content.slice(skillStart, skillEnd),
    resume.skills.map(normalize),
    `${description} skill relevance order`,
  );
  for (const entry of resume.entries) {
    for (const value of [
      entry.title,
      entry.organization,
      entry.dates,
      entry.url,
      ...entry.bullets,
    ]) {
      if (value.trim())
        assert.ok(
          content.includes(normalize(value)),
          `${description}: missing entry content ${value}`,
        );
    }
  }
  if (long) {
    assertOrder(
      content,
      ['Selected project B', 'Selected project A', 'Stress project 01', 'Stress project 02'],
      `${description} selected project order`,
    );
    assert.ok(
      content.includes('Community contribution award'),
      `${description}: preserve unknown entry kinds`,
    );
    assert.ok(
      content.includes('Database certificate'),
      `${description}: preserve Education entries and free text`,
    );
  }
  assert.doesNotMatch(content, /PRIVATE_QA_NOTE/, `${description}: exclude AI review notes`);
}

async function inspectPdf(bytes, resume, long) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pages = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const { width, height } = page.getViewport({ scale: 1 });
      assert.equal(width, 612, 'PDF uses US Letter width');
      assert.equal(height, 792, 'PDF uses US Letter height');
      const content = await page.getTextContent();
      const items = content.items.filter((item) => 'str' in item);
      const text = items.map((item) => item.str + (item.hasEOL ? '\n' : ' ')).join('');
      assert.ok(normalize(text), `PDF page ${number} is not blank`);
      for (const item of items.filter((item) => item.str.trim())) {
        const [x, y] = item.transform.slice(4);
        assert.ok(
          x >= -1 && y >= -1 && x + item.width <= width + 1 && y <= height + 1,
          `PDF text stays within page ${number}: ${item.str}`,
        );
      }
      pages.push(text);
    }
    if (long) assert.ok(pdf.numPages > 1, 'Stress fixture spans multiple pages');
    else assert.equal(pdf.numPages, 1, 'Short early-career fixture fits one page');
    assertResumeContent(pages.join('\n'), resume, long, `${resume.layout} PDF`);
    return { pages: pdf.numPages, characters: normalize(pages.join('\n')).length };
  } finally {
    await pdf.destroy();
  }
}

async function inspectDocx(blob, resume, long, extractResume) {
  assert.ok(blob instanceof Blob, 'DOCX export returns a Blob');
  assert.equal(blob.type, docxMime, 'DOCX export has the Word MIME type');
  const bytes = Buffer.from(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  const part = zip.file('word/document.xml');
  assert.ok(part, 'DOCX contains a native Word document');
  const xml = await part.async('string');
  const $ = load(xml, { xmlMode: true });
  const paragraphs = $('w\\:p')
    .map((_, element) => normalize($(element).find('w\\:t').text()))
    .get();
  assert.ok(paragraphs.length > 10, 'DOCX contains editable paragraphs');
  assert.ok($('w\\:t').length > 10, 'DOCX contains native text runs');
  assert.ok($('w\\:numPr').length > 0, 'DOCX bullets use native Word list numbering');
  assert.equal(
    paragraphs.filter((text) => text.toUpperCase() === 'EDUCATION').length,
    1,
    'DOCX combines free-text education and bank entries under one heading',
  );
  assert.match(xml, /&amp;/, 'DOCX escapes ampersands');
  assert.match(xml, /&lt;Tools&gt;/, 'DOCX escapes XML-sensitive text');
  assert.doesNotMatch(
    xml,
    /<w:altChunk\b/,
    'DOCX is native Word content rather than embedded HTML',
  );
  assert.equal(
    Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)
      .length,
    0,
    'DOCX text is not a flattened image',
  );
  const contentTypes = await zip.file('[Content_Types].xml').async('string');
  assert.match(contentTypes, /wordprocessingml\.document\.main\+xml/);
  const settings = await zip.file('word/settings.xml')?.async('string');
  assert.doesNotMatch(settings || '', /<w:documentProtection\b/, 'DOCX remains editable');
  const allXml = await Promise.all(
    Object.values(zip.files)
      .filter((file) => !file.dir && file.name.endsWith('.xml'))
      .map((file) => file.async('string')),
  );
  assert.doesNotMatch(
    allXml.join('\n'),
    /PRIVATE_QA_NOTE/,
    'AI review notes do not leak into OOXML',
  );
  const text = await extractResume(new File([blob], 'roundtrip.docx', { type: docxMime }));
  assertResumeContent(text, resume, long, `${resume.layout} DOCX roundtrip`);
  return { bytes, paragraphs: paragraphs.length, characters: normalize(text).length };
}

let server;
globalThis.fetch = async (input, options) =>
  typeof input === 'string' && input.startsWith('/fonts/')
    ? new Response(await readFile(path.join(root, 'public', input.slice(1))))
    : originalFetch(input, options);

try {
  server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, preTransformRequests: false, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const { resumePdf, resumeDocx, extractResume } = await server.ssrLoadModule('/src/export.ts');
  assert.equal(typeof resumeDocx, 'function', 'DOCX exporter is available');
  const { manualResume, newJob } = await server.ssrLoadModule('/src/model.ts');
  const profile = {
    name: 'Zoë Martínez',
    email: 'zoe@example.invalid',
    phone: '312-555-0100',
    location: 'Chicago, IL',
    website: 'https://example.invalid/zoe',
    summary: 'Computer science student building accessible tools with Python, React, and SQL.',
    skills: ['SQL', 'Python', 'React', 'R&D <Tools>'],
    education: 'BSc Computer Science — Example University\nExpected graduation: May 2027',
    resumeText: '',
    resumeName: '',
    experiences: [
      {
        id: 'project1',
        kind: 'Project',
        title: 'Campus event finder',
        organization: 'Personal project',
        dates: 'Jan 2026 – Mar 2026',
        details:
          'Built a React view for community events.\nAdded SQL filters and keyboard navigation.',
        skills: ['React', 'SQL'],
        url: 'https://example.invalid/events',
      },
      {
        id: 'work1',
        kind: 'Experience',
        title: 'Student developer',
        organization: 'Example R&D Lab',
        dates: 'Aug 2025 – Present',
        details: 'Cleaned R&D <Tools> data with Python.\nWrote setup notes for teammates.',
        skills: ['Python'],
        url: '',
      },
    ],
  };
  const job = newJob({ title: 'Software Engineering Intern', company: 'Example Company' });
  const sample = manualResume(profile);
  assert.equal(
    manualResume({
      ...profile,
      education: '',
      experiences: [{ ...profile.experiences[0], kind: 'Education' }],
    }).entries.length,
    1,
    'Education bank entries remain available when separate education is empty',
  );
  const project = sample.entries.find((entry) => entry.kind === 'Project');
  const work = sample.entries.find((entry) => entry.kind === 'Experience');
  const long = {
    ...sample,
    entries: [
      { ...project, sourceId: 'selected-b', title: 'Selected project B', dates: '2024' },
      work,
      { ...project, sourceId: 'selected-a', title: 'Selected project A', dates: '2026' },
      ...Array.from({ length: 2 }, (_, index) => ({
        ...project,
        sourceId: `stress-${index + 1}`,
        title: `Stress project ${String(index + 1).padStart(2, '0')}`,
        bullets: [
          'Implemented a documented React and SQL workflow for a fictional university team, including readable data validation and accessible labels for every input.',
          'Reviewed the "search & filter" interaction, checked <input> handling with keyboard navigation, and recorded the exact setup steps in the project notes.',
          'Added a Python data-cleaning script and documented assumptions, error cases, and small examples so another contributor could reproduce the workflow.',
        ],
      })),
      {
        sourceId: 'education-entry',
        kind: 'Education',
        title: 'Database certificate',
        organization: 'Example Academy',
        dates: 'May 2026',
        url: '',
        bullets: ['Completed coursework in relational data modeling.'],
        reason: '',
      },
      {
        sourceId: 'volunteer',
        kind: 'Volunteering',
        title: 'Peer mentor',
        organization: 'Example Community',
        dates: '2025 – 2026',
        url: '',
        bullets: ['Helped students read project setup notes.'],
        reason: '',
      },
      {
        sourceId: 'custom-kind',
        kind: 'Awards',
        title: 'Community contribution award',
        organization: 'Example Association',
        dates: '2026',
        url: '',
        bullets: ['Received recognition for documented mentoring work.'],
        reason: '',
      },
    ],
  };
  await mkdir(output, { recursive: true });
  const results = [];
  for (const layout of ['current', 'classic']) {
    for (const [label, source] of [
      ['sample', sample],
      ['long', long],
    ]) {
      const resume = {
        ...structuredClone(source),
        layout,
        origin: 'AI',
        matches: ['PRIVATE_QA_NOTE_MATCH'],
        gaps: ['PRIVATE_QA_NOTE_GAP'],
        changes: ['PRIVATE_QA_NOTE_CHANGE'],
      };
      resume.entries = resume.entries.map((entry) => ({
        ...entry,
        reason: 'PRIVATE_QA_NOTE_REASON',
      }));
      const before = structuredClone(resume),
        jobBefore = structuredClone(job);
      const pdf = await resumePdf(resume, job, false);
      const pdfBytes = Buffer.from(pdf.output('arraybuffer'));
      const pdfMetrics = await inspectPdf(pdfBytes, resume, label === 'long');
      assert.equal(pdf.getNumberOfPages(), pdfMetrics.pages);
      const docx = await resumeDocx(resume, job, false);
      const { bytes: docxBytes, ...docxMetrics } = await inspectDocx(
        docx,
        resume,
        label === 'long',
        extractResume,
      );
      assert.deepEqual(resume, before, 'Exports must not mutate the saved resume version');
      assert.deepEqual(job, jobBefore, 'Exports must not mutate the opportunity');
      const basename = `${label}-${layout}`;
      await writeFile(path.join(output, `${basename}.pdf`), pdfBytes);
      await writeFile(path.join(output, `${basename}.docx`), docxBytes);
      results.push({ fixture: basename, pdf: pdfMetrics, docx: docxMetrics });
    }
  }
  const textImport = await extractResume(
    new File(['Zoë Martínez\nSQL, Python, React'], 'resume.txt'),
  );
  assert.match(textImport, /Zoë Martínez/);
  await assert.rejects(extractResume(new File(['abc'], 'resume.exe')), /PDF, DOCX, or TXT/);
  const report = {
    fixtures: results,
    pdfFiles: 4,
    docxFiles: 4,
    contentAndOrder: 'passed',
    editableWord: 'passed',
    inputPreservation: 'passed',
    textImport: 'passed',
    unsupportedFile: 'rejected',
    output,
  };
  await writeFile(path.join(output, 'export-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  globalThis.fetch = originalFetch;
  await server?.close();
}
