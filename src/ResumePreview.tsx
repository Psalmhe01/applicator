import type { Resume } from './model';
import { resumeContact, resumeEntryHeading, resumeSections } from './resumePresentation';

export default function ResumePreview({ resume }: { resume: Resume }) {
  const classic = resume.layout === 'classic';
  return (
    <div className={`resume-paper resume-paper-${resume.layout}`} aria-label="Resume preview">
      <h2>{resume.name}</h2>
      <p className="resume-contact">{resumeContact(resume)}</p>
      {resumeSections(resume).map((section) => (
        <section className="paper-section" key={section.id}>
          <h4>{section.title.toUpperCase()}</h4>
          {section.text && <p className="pre-line">{section.text}</p>}
          {!!section.skills?.length &&
            (classic ? (
              <ul className="paper-skills">
                <li>{section.skills.join(', ')}</li>
              </ul>
            ) : (
              <p>{section.skills.join(' · ')}</p>
            ))}
          {section.entries?.map((entry) => {
            const { heading, subheading } = resumeEntryHeading(entry, resume.layout);
            return (
              <div className="paper-entry" key={entry.sourceId}>
                <div className="paper-entry-heading">
                  <strong>{heading}</strong>
                  {classic && entry.dates && <span>{entry.dates}</span>}
                </div>
                {subheading && <p className="paper-entry-subheading">{subheading}</p>}
                {!classic && entry.dates && <p className="small muted">{entry.dates}</p>}
                {entry.url && <p className="small paper-entry-url">{entry.url}</p>}
                {!!entry.bullets.length && (
                  <ul>
                    {entry.bullets.map((bullet, index) => (
                      <li key={index}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
