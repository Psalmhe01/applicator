import type { Job, Resume, ResumeLayout, Workspace } from './model';
import {
  resumeContact,
  resumeEntryHeading,
  resumeFilename,
  resumeSections,
} from './resumePresentation';
export function downloadFile(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function exportBackup(workspace: Workspace) {
  downloadFile(
    `applicator-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(workspace, null, 2),
    'application/json',
  );
}
export function exportCsv(jobs: Job[]) {
  const cell = (s: string) => `"${(/^[\s]*[=+@-]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  const rows = [
    [
      'Company',
      'Role',
      'Status',
      'Application URL',
      'Applied',
      'Deadline',
      'Follow up',
      'Notes',
      'Submitted resume version',
    ],
    ...jobs.map((j) => [
      j.company,
      j.title,
      j.status,
      j.url,
      j.appliedAt,
      j.deadline,
      j.followUp,
      j.notes,
      j.resumes.find((r) => r.id === j.appliedResumeId)?.createdAt || '',
    ]),
  ];
  downloadFile(
    'applicator-applications.csv',
    '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n'),
    'text/csv;charset=utf-8',
  );
}
const fontPromises = new Map<ResumeLayout, Promise<string[]>>();
async function fonts(layout: ResumeLayout) {
  if (fontPromises.has(layout)) return fontPromises.get(layout)!;
  const names =
    layout === 'classic'
      ? ['Tinos-Regular.ttf', 'Tinos-Bold.ttf', 'Tinos-Italic.ttf']
      : ['NotoSans-Regular.ttf', 'NotoSans-Bold.ttf'];
  const promise = Promise.all(
    names.map(async (name) => {
      const url = `/fonts/${name}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('PDF fonts could not load. Restart the app and try again.');
      const bytes = new Uint8Array(await res.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 8192)
        s += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(s);
    }),
  ).catch((e) => {
    fontPromises.delete(layout);
    throw e;
  });
  fontPromises.set(layout, promise);
  return promise;
}
export async function resumePdf(resume: Resume, job: Job, save = true) {
  const classic = resume.layout === 'classic';
  const layout = classic ? 'classic' : 'current';
  const [{ jsPDF }, font] = await Promise.all([import('jspdf'), fonts(layout)]);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const family = classic ? 'Tinos' : 'NotoSans';
  for (const [index, style] of ['normal', 'bold', ...(classic ? ['italic'] : [])].entries()) {
    const filename = `${family}-${style}.ttf`;
    doc.addFileToVFS(filename, font[index]);
    doc.addFont(filename, family, style);
  }
  doc.setProperties({
    title: `${resume.name} — ${job.company} — ${job.title}`,
    author: resume.name,
    subject: 'Resume',
  });
  const margin = classic ? 30 : 44,
    width = 612 - margin * 2,
    bottom = 792 - margin,
    bodySize = classic ? 11 : 10,
    leading = classic ? 1.16 : 1.45,
    gap = classic ? 1.5 : 3;
  let y = 48;
  const ensure = (height: number) => {
    if (y + height > bottom) {
      doc.addPage();
      y = margin;
    }
  };
  type TextOptions = {
    size?: number;
    bold?: boolean;
    italic?: boolean;
    indent?: number;
    availableWidth?: number;
    center?: boolean;
    lineHeight?: number;
    after?: number;
  };
  const setFont = ({ size = bodySize, bold = false, italic = false }: TextOptions) => {
    doc.setFont(family, bold ? 'bold' : italic && classic ? 'italic' : 'normal');
    doc.setFontSize(size);
    if (classic) doc.setTextColor(0, 0, 0);
    else doc.setTextColor(25, 30, 29);
  };
  const lines = (value: string, options: TextOptions = {}) => {
    setFont(options);
    return doc.splitTextToSize(
      value,
      options.availableWidth ?? width - (options.indent || 0),
    ) as string[];
  };
  const measure = (value: string, options: TextOptions = {}) => {
    if (!value.trim()) return 0;
    return (
      lines(value, options).length * (options.lineHeight ?? (options.size || bodySize) * leading) +
      (options.after ?? gap)
    );
  };
  const write = (value: string, options: TextOptions = {}) => {
    if (!value.trim()) return;
    ensure(Math.min(measure(value, options), bottom - margin));
    const wrapped = lines(value, options);
    const lineHeight = options.lineHeight ?? (options.size || bodySize) * leading;
    for (const line of wrapped) {
      ensure(lineHeight);
      setFont(options);
      if (options.center) doc.text(line, 306, y, { align: 'center' });
      else doc.text(line, margin + (options.indent || 0), y);
      y += lineHeight;
    }
    y += options.after ?? gap;
  };
  const section = (title: string, after = 0) => {
    ensure(Math.min((classic ? 24 : 36) + after, bottom - margin));
    y += classic ? 4 : 10;
    write(title.toUpperCase(), {
      size: classic ? 12 : 10,
      bold: true,
      ...(classic ? { lineHeight: 12, after: 0 } : {}),
    });
    doc.setDrawColor(classic ? 0 : 170);
    doc.setLineWidth(0.5);
    doc.line(margin, y - (classic ? 8 : 4), margin + width, y - (classic ? 8 : 4));
    y += classic ? 3 : 8;
  };
  write(resume.name, {
    size: classic ? 24 : 21,
    bold: true,
    center: classic,
    ...(classic ? { lineHeight: 23, after: 0 } : {}),
  });
  write(resumeContact(resume), { size: classic ? 10 : 9, center: classic });
  const header = (entry: Resume['entries'][number]) => {
    const { heading, subheading } = resumeEntryHeading(entry, layout);
    if (!classic) {
      write(heading, { bold: true });
      write(entry.dates, { size: 9 });
    } else {
      setFont({});
      const dateWidth = entry.dates ? Math.min(doc.getTextWidth(entry.dates), width * 0.38) : 0;
      const left = lines(heading, {
        bold: true,
        availableWidth: width - (dateWidth ? dateWidth + 14 : 0),
      });
      const right = entry.dates ? lines(entry.dates, { availableWidth: dateWidth + 0.5 }) : [];
      for (let i = 0; i < Math.max(left.length, right.length); i++) {
        ensure(bodySize * leading);
        if (left[i]) {
          setFont({ bold: true });
          doc.text(left[i], margin, y);
        }
        if (right[i]) {
          setFont({});
          doc.text(right[i], margin + width, y, { align: 'right' });
        }
        y += bodySize * leading;
      }
      y += gap;
      write(subheading, { italic: true });
    }
    write(entry.url, { size: classic ? 10 : 9 });
  };
  const firstLines = (entry: Resume['entries'][number]) => {
    const { heading, subheading } = resumeEntryHeading(entry, layout);
    return (
      measure(heading, {
        bold: true,
        availableWidth: classic && entry.dates ? width * 0.6 : width,
      }) +
      measure(classic ? subheading : entry.dates, { size: classic ? bodySize : 9 }) +
      measure(entry.url, { size: 9 }) +
      measure(entry.bullets[0] || '', { indent: 12 })
    );
  };
  const bullet = (value: string) => {
    if (!value.trim()) return;
    ensure(Math.min(measure(value, { indent: 12 }), bottom - margin));
    setFont({});
    doc.text('•', margin + 2, y);
    write(value, { indent: 12 });
  };
  for (const part of resumeSections(resume)) {
    const firstHeight = part.text?.trim()
      ? measure(part.text)
      : part.skills?.length
        ? measure(part.skills.join(classic ? ', ' : ' · '), { indent: classic ? 12 : 0 })
        : part.entries?.length
          ? firstLines(part.entries[0])
          : 0;
    section(part.title, firstHeight);
    if (part.text) write(part.text);
    if (part.skills?.length) {
      if (classic) bullet(part.skills.join(', '));
      else write(part.skills.join(' · '));
    }
    for (const entry of part.entries || []) {
      ensure(Math.min(firstLines(entry), bottom - margin));
      header(entry);
      for (const value of entry.bullets) {
        bullet(value);
      }
      y += classic ? 3 : 6;
    }
  }
  if (save) doc.save(resumeFilename(resume, job, 'pdf'));
  return doc;
}
export async function resumeDocx(resume: Resume, job: Job, save = true) {
  const { createResumeDocx } = await import('./resumeDocx');
  const blob = await createResumeDocx(resume, job);
  if (save)
    downloadFile(
      resumeFilename(resume, job, 'docx'),
      blob,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  return blob;
}
export async function extractResume(file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a resume smaller than 10 MB.');
  if (/\.txt$/i.test(file.name)) return (await file.text()).slice(0, 50000);
  if (/\.docx$/i.test(file.name)) {
    const mammoth = await import('mammoth/mammoth.browser');
    return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value.slice(
      0,
      50000,
    );
  }
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    if (pdf.numPages > 15) {
      await pdf.destroy();
      throw new Error('Upload a resume of 15 pages or fewer.');
    }
    const pages = [];
    try {
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        pages.push(
          content.items
            .map((item) =>
              'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '',
            )
            .join(''),
        );
      }
    } finally {
      await pdf.destroy();
    }
    const result = pages.join('\n\n').slice(0, 50000);
    if (result.trim().length < 30)
      throw new Error(
        'This PDF appears to be scanned. Paste the resume text or upload a DOCX/text PDF.',
      );
    return result;
  }
  throw new Error('Upload a PDF, DOCX, or TXT resume.');
}
