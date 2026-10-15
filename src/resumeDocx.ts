import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  type IRunOptions,
} from 'docx';
import { type Job, type Resume, safeLink } from './model';
import { resumeContact, resumeEntryHeading, resumeSections } from './resumePresentation';

// Word exports use real paragraphs, runs, tab stops and lists, so every line is editable.
export async function createResumeDocx(resume: Resume, job: Job): Promise<Blob> {
  const classic = resume.layout === 'classic';
  const font = classic ? 'Times New Roman' : 'Arial';
  const bodySize = classic ? 22 : 20;
  const margin = classic ? 600 : 880;
  const insideWidth = 12240 - margin * 2;
  const children: Paragraph[] = [];
  const runs = (value: string, options: IRunOptions = {}) =>
    value.split(/\r?\n/).map(
      (text, index, lines) =>
        new TextRun({
          ...options,
          // Text-only readers may discard soft breaks; retain a word separator.
          text: index < lines.length - 1 ? `${text} ` : text,
          ...(index ? { break: 1 } : {}),
        }),
    );
  const text = (
    value: string,
    options: { italic?: boolean; size?: number; keepNext?: boolean } = {},
  ) =>
    new Paragraph({
      children: runs(value, { italics: options.italic, size: options.size }),
      keepNext: options.keepNext,
      widowControl: true,
    });
  const bullet = (value: string) =>
    new Paragraph({
      children: runs(value),
      numbering: { reference: 'resume-bullets', level: 0 },
      widowControl: true,
    });

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: runs(resume.name),
    }),
  );
  if (resumeContact(resume))
    children.push(
      new Paragraph({
        children: runs(resumeContact(resume), { size: classic ? 20 : 18 }),
        alignment: classic ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: classic ? 80 : 100 },
        keepNext: true,
      }),
    );

  for (const section of resumeSections(resume)) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        text: section.title.toUpperCase(),
      }),
    );
    if (section.text?.trim()) children.push(text(section.text));
    if (section.skills?.length)
      children.push(classic ? bullet(section.skills.join(', ')) : text(section.skills.join(' · ')));
    for (const entry of section.entries || []) {
      const { heading, subheading } = resumeEntryHeading(entry, resume.layout);
      const hasBody = !!(subheading || entry.url || entry.bullets.length);
      children.push(
        new Paragraph({
          children: [
            ...runs(heading, { bold: true }),
            ...(classic && entry.dates
              ? [new TextRun({ children: [new Tab()], bold: false }), ...runs(entry.dates)]
              : []),
          ],
          tabStops: classic ? [{ type: TabStopType.RIGHT, position: insideWidth }] : [],
          keepNext: hasBody || (!classic && !!entry.dates),
          widowControl: true,
          spacing: { before: classic ? 35 : 80, after: classic ? 15 : 40 },
        }),
      );
      if (classic && subheading)
        children.push(
          text(subheading, { italic: true, keepNext: !!(entry.url || entry.bullets.length) }),
        );
      if (!classic && entry.dates)
        children.push(
          text(entry.dates, { size: 18, keepNext: !!(entry.url || entry.bullets.length) }),
        );
      if (entry.url) {
        const url = safeLink(entry.url);
        children.push(
          new Paragraph({
            children: url
              ? [
                  new ExternalHyperlink({
                    link: url,
                    children: runs(entry.url, { size: classic ? 20 : 18, color: '000000' }),
                  }),
                ]
              : runs(entry.url, { size: classic ? 20 : 18 }),
            keepNext: !!entry.bullets.length,
          }),
        );
      }
      for (const value of entry.bullets) if (value.trim()) children.push(bullet(value));
    }
  }

  const document = new Document({
    creator: resume.name,
    title: `${resume.name} — ${job.company} — ${job.title}`,
    subject: 'Resume',
    description: 'Editable resume',
    styles: {
      default: {
        document: {
          run: { font, size: bodySize, color: '000000' },
          paragraph: {
            spacing: { line: classic ? 255 : 290, after: classic ? 30 : 60 },
          },
        },
        title: {
          run: { font, size: classic ? 48 : 42, bold: true, color: '000000' },
          paragraph: {
            alignment: classic ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: { before: 0, after: classic ? 65 : 120 },
            keepNext: true,
          },
        },
        heading1: {
          run: { font, size: classic ? 24 : 20, bold: true, color: '000000' },
          paragraph: {
            spacing: { before: classic ? 80 : 200, after: classic ? 45 : 160 },
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 4,
                color: classic ? '000000' : 'AAAAAA',
                space: classic ? 1 : 4,
              },
            },
            keepNext: true,
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'resume-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                run: { font, size: bodySize, color: '000000' },
                paragraph: { indent: { left: 300, hanging: 180 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: classic ? 640 : 880, right: margin, bottom: margin, left: margin },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(document);
}
