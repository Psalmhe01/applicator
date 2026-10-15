import { ArrowUpRight, Bookmark } from 'lucide-react';
import { Button, Modal } from './components/ui';
import { type Job, safeLink, formatDate } from './model';

// This view has no editing or persistence effects. Saving is a separate user action.
export default function OpeningPreview({
  job,
  saved,
  save,
  close,
}: {
  job: Job | null;
  saved: boolean;
  save: () => void;
  close: () => void;
}) {
  if (!job) return null;
  const applicationUrl = safeLink(job.url);
  return (
    <Modal
      open
      onClose={close}
      title={job.title}
      description={`${job.company} · ${job.location || 'Location not specified'}`}
      wide
    >
      <p className="muted">Save this opportunity to prepare a resume or track your application.</p>
      {job.department && <p className="small muted">Department: {job.department}</p>}
      <div className="detail-actionbar">
        <Button onClick={save}>
          <Bookmark size={16} />
          {saved ? 'Open saved opportunity' : 'Save opportunity'}
        </Button>
        {applicationUrl && (
          <a className="button secondary" href={applicationUrl} target="_blank" rel="noreferrer">
            Open application <ArrowUpRight size={16} />
          </a>
        )}
      </div>
      {!job.requirementsComplete && (
        <div className="detail-notice">
          This source provides a description snippet. Read the full requirements on the application
          page. If you save this opportunity, paste the full requirements before tailoring a resume.
        </div>
      )}
      <h3>The opportunity</h3>
      <div className="job-description">
        {job.description || 'Read the requirements on the application page.'}
      </div>
      <p className="small muted">
        {job.source}
        {job.updatedAt &&
          ` · ${job.source === 'Adzuna' ? 'Posted' : 'Updated'} ${formatDate(job.updatedAt)}`}
      </p>
      {job.source === 'Adzuna' && (
        <a
          className="adzuna-attribution"
          href="https://www.adzuna.com"
          target="_blank"
          rel="noreferrer"
        >
          Adzuna
        </a>
      )}
      <div className="modal-footer">
        <Button variant="secondary" onClick={close}>
          Close preview
        </Button>
        <Button onClick={save}>{saved ? 'Open saved opportunity' : 'Save opportunity'}</Button>
      </div>
    </Modal>
  );
}
