import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Download,
  FileText,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Copy,
  MapPin,
  CalendarDays,
  History,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button, Field, Modal, Pill } from './components/ui';
import {
  type Job,
  type Profile,
  type Resume,
  type Status,
  statuses,
  manualResume,
  resumeSchema,
  id,
  splitList,
  safeLink,
  localDate,
  formatDate,
} from './model';
import { api, errorText } from './api';
import { resumePdf } from './export';

export default function RoleDetail({
  job,
  profile,
  save,
  remove,
  close,
  aiConfigured,
  notify,
  onProfile,
}: {
  job: Job;
  profile: Profile;
  save: (j: Job) => void;
  remove: () => void;
  close: () => void;
  aiConfigured: boolean;
  notify: (s: string) => void;
  onProfile: () => void;
}) {
  const [draft, setDraft] = useState(job),
    [tab, setTab] = useState<'job' | 'resume' | 'tracking'>('job'),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(job.resumes.at(-1)?.id || ''),
    [editResume, setEditResume] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [applyModal, setApplyModal] = useState(false),
    [selectedApplied, setSelectedApplied] = useState(
      job.appliedResumeId || job.resumes.at(-1)?.id || '',
    ),
    [editJob, setEditJob] = useState(false),
    [jobFields, setJobFields] = useState(job);
  const resume = draft.resumes.find((r) => r.id === version),
    locked = !!resume && draft.appliedResumeId === resume.id;
  function commit(next: Job) {
    setDraft(next);
    save(next);
  }
  function patchResume(patch: Partial<Resume>) {
    if (!resume || locked) return;
    const next = { ...resume, ...patch, reviewed: patch.reviewed ?? false };
    commit({
      ...draft,
      resumes: draft.resumes.map((r) => (r.id === resume.id ? next : r)),
    });
  }
  function addResume(next: Resume) {
    if (draft.resumes.length >= 50) {
      notify('This job has 50 resume versions. Export a backup before removing old versions.');
      return;
    }
    commit({
      ...draft,
      status: draft.status === 'Saved' ? 'Preparing' : draft.status,
      resumes: [...draft.resumes, next],
    });
    setVersion(next.id);
    setTab('resume');
    setEditResume(true);
  }
  async function tailor() {
    if (!draft.requirementsComplete) {
      notify(
        'Paste the full requirements with Edit details and confirm they are complete before using AI.',
      );
      setTab('job');
      return;
    }
    if (!profile.name || !profile.experiences.length) {
      notify('Add your name and an experience/project in the experience bank first.');
      return;
    }
    if (draft.description.trim().length < 30) {
      notify('Add the job description before tailoring.');
      return;
    }
    setBusy(true);
    try {
      const result = await api<Partial<Resume>>('tailor', {
        profile: { ...profile, resumeText: '' },
        job: {
          title: draft.title,
          company: draft.company,
          description: draft.description,
          location: draft.location,
          url: draft.url,
          requirementsComplete: draft.requirementsComplete,
        },
      });
      addResume(
        resumeSchema.parse({
          ...result,
          id: id(),
          origin: 'AI',
          createdAt: new Date().toISOString(),
          reviewed: false,
          downloadedAt: '',
        }),
      );
      notify('Draft created. Review the changes and check every fact before downloading.');
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    if (!resume) return;
    setBusy(true);
    try {
      await resumePdf(resume, draft);
      commit({
        ...draft,
        resumes: draft.resumes.map((r) =>
          r.id === resume.id ? { ...r, downloadedAt: new Date().toISOString() } : r,
        ),
      });
      notify('PDF downloaded. This version is saved with the job.');
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function status(value: Status) {
    if (value === 'Applied') {
      setSelectedApplied(version || '');
      setApplyModal(true);
      return;
    }
    commit({ ...draft, status: value });
  }
  const move = (index: number, direction: number) => {
    if (!resume) return;
    const entries = [...resume.entries];
    [entries[index], entries[index + direction]] = [entries[index + direction], entries[index]];
    patchResume({ entries });
  };
  return (
    <>
      <Dialog.Root open onOpenChange={(value) => !value && close()}>
        <Dialog.Portal>
          <Dialog.Overlay className="detail-backdrop" />
          <Dialog.Content className="detail-panel" aria-describedby={undefined}>
            <div className="detail-header">
              <div className="company-avatar large">{draft.company.slice(0, 2).toUpperCase()}</div>
              <div className="grow">
                <div className="eyebrow">{draft.company}</div>
                <Dialog.Title asChild>
                  <h2>{draft.title}</h2>
                </Dialog.Title>
                <div className="flex-row small muted">
                  <MapPin size={13} />
                  {draft.location || 'Location not specified'}
                  <Pill status={draft.status} />
                </div>
              </div>
              <button className="icon-button" onClick={close} aria-label="Close job details">
                <X size={22} />
              </button>
            </div>
            <div className="detail-actionbar">
              <Button
                onClick={tailor}
                busy={busy}
                disabled={!aiConfigured || !draft.requirementsComplete}
              >
                <Sparkles size={16} />
                Tailor my resume
              </Button>
              {safeLink(draft.url) && (
                <a
                  className="button secondary"
                  href={safeLink(draft.url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open application
                  <ArrowUpRight size={16} />
                </a>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  setTab('tracking');
                  setSelectedApplied(version || '');
                  setApplyModal(true);
                }}
              >
                Mark applied
              </Button>
            </div>
            {!aiConfigured && (
              <div className="detail-notice">
                <Sparkles size={15} />
                AI is unavailable. The owner can check its connection. Manual resumes are available
                now.
              </div>
            )}
            <div className="tabs" role="tablist" aria-label="Job detail sections">
              {(
                [
                  ['job', 'Job details'],
                  [
                    'resume',
                    `Resume studio${draft.resumes.length ? ` (${draft.resumes.length})` : ''}`,
                  ],
                  ['tracking', 'Application log'],
                ] as const
              ).map(([key, label]) => (
                <button
                  role="tab"
                  aria-selected={tab === key}
                  key={key}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="detail-body">
              {!draft.requirementsComplete && (
                <div className="detail-notice">
                  This source provides a description snippet. Open the application page, then use
                  Edit details to paste and confirm the full requirements.
                </div>
              )}
              {tab === 'job' && (
                <>
                  <div className="section-heading">
                    <h3>The opportunity</h3>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setJobFields(draft);
                        setEditJob(true);
                      }}
                    >
                      <Pencil size={15} />
                      Edit details
                    </Button>
                  </div>
                  <p className="pre-line job-description">
                    {draft.description ||
                      'No job description yet. Add the requirements with Edit details before using AI tailoring.'}
                  </p>
                  <div className="source-note">
                    Source: {draft.source}
                    {draft.updatedAt && ` · Listing updated ${formatDate(draft.updatedAt)}`}
                    <br />
                    Confirm availability and requirements on the company’s application page.
                  </div>
                  <div className="small-footer">
                    <span>Saved {formatDate(draft.createdAt)}</span>
                    <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={14} />
                      Remove job
                    </Button>
                  </div>
                </>
              )}
              {tab === 'resume' &&
                (!resume ? (
                  <div className="resume-start">
                    <div className="empty-icon">
                      <FileText size={28} />
                    </div>
                    <h3>A resume for this opportunity.</h3>
                    <p>
                      Bring forward the parts of your experience that matter here. Your original
                      profile stays intact.
                    </p>
                    <div className="flex-row">
                      <Button
                        onClick={tailor}
                        disabled={!aiConfigured || !draft.requirementsComplete}
                        busy={busy}
                      >
                        <Sparkles size={16} />
                        Create AI draft
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          if (!profile.name || !profile.experiences.length) {
                            notify('Add your name and an experience/project first.');
                            onProfile();
                            return;
                          }
                          addResume(manualResume(profile));
                        }}
                      >
                        Build manually
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="resume-toolbar">
                      <Field label="Saved version">
                        <select
                          value={version}
                          onChange={(e) => {
                            setVersion(e.target.value);
                            setEditResume(false);
                          }}
                        >
                          {draft.resumes.map((r, i) => (
                            <option value={r.id} key={r.id}>
                              Version {i + 1} · {r.origin} · {formatDate(r.createdAt)}
                              {r.id === draft.appliedResumeId ? ' · Submitted' : ''}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="flex-row">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            locked
                              ? addResume({
                                  ...structuredClone(resume),
                                  id: id(),
                                  createdAt: new Date().toISOString(),
                                  reviewed: false,
                                  downloadedAt: '',
                                })
                              : setEditResume(!editResume)
                          }
                        >
                          {locked ? <Copy size={15} /> : <Pencil size={15} />}{' '}
                          {locked ? 'Duplicate to edit' : editResume ? 'Preview' : 'Edit draft'}
                        </Button>
                        <Button onClick={download} disabled={!resume.reviewed} busy={busy}>
                          <Download size={16} />
                          Download PDF
                        </Button>
                      </div>
                    </div>
                    {locked && (
                      <div className="inline-note">
                        <History size={16} />
                        This is the version recorded for your application. Duplicate it to make
                        further edits.
                      </div>
                    )}
                    {resume.origin === 'AI' && (
                      <details className="ai-review" open>
                        <summary>
                          <Sparkles size={16} />
                          What changed, and what to check
                        </summary>
                        <div className="analysis-grid">
                          <div>
                            <h4>Editorial choices</h4>
                            <ul>
                              {resume.changes.map((v, i) => (
                                <li key={i}>{v}</li>
                              ))}
                            </ul>
                            <h4>Supported requirements</h4>
                            <ul>
                              {resume.matches.map((v, i) => (
                                <li key={i}>{v}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4>Gaps to be aware of</h4>
                            {resume.gaps.length ? (
                              <ul>
                                {resume.gaps.map((v, i) => (
                                  <li key={i}>{v}</li>
                                ))}
                              </ul>
                            ) : (
                              <p>No gaps were identified by the AI. Verify this yourself.</p>
                            )}
                            <p className="small muted">
                              No match percentage or hiring probability is implied.
                            </p>
                          </div>
                        </div>
                      </details>
                    )}
                    {editResume && !locked ? (
                      <div className="resume-editor stack">
                        <Field label="Summary">
                          <textarea
                            rows={3}
                            value={resume.summary}
                            onChange={(e) => patchResume({ summary: e.target.value })}
                          />
                        </Field>
                        <Field label="Skills (comma-separated)">
                          <input
                            defaultValue={resume.skills.join(', ')}
                            key={resume.id + 'skills'}
                            onChange={(e) => patchResume({ skills: splitList(e.target.value) })}
                          />
                        </Field>
                        {resume.entries.map((entry, index) => (
                          <div className="editor-entry" key={entry.sourceId}>
                            <div className="section-heading">
                              <div>
                                <h4>{entry.title}</h4>
                                <span className="muted small">
                                  {entry.organization} · {entry.dates}
                                </span>
                              </div>
                              <div className="flex-row">
                                <button
                                  className="icon-button"
                                  aria-label={`Move ${entry.title} up`}
                                  disabled={!index}
                                  onClick={() => move(index, -1)}
                                >
                                  <ArrowUp size={16} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Move ${entry.title} down`}
                                  disabled={index === resume.entries.length - 1}
                                  onClick={() => move(index, 1)}
                                >
                                  <ArrowDown size={16} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Remove ${entry.title} from draft`}
                                  onClick={() =>
                                    patchResume({
                                      entries: resume.entries.filter(
                                        (e) => e.sourceId !== entry.sourceId,
                                      ),
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                            <Field label="Bullets (one per line)">
                              <textarea
                                rows={Math.max(3, entry.bullets.length + 1)}
                                defaultValue={entry.bullets.join('\n')}
                                key={resume.id + entry.sourceId}
                                onChange={(e) =>
                                  patchResume({
                                    entries: resume.entries.map((item) =>
                                      item.sourceId === entry.sourceId
                                        ? {
                                            ...item,
                                            bullets: e.target.value
                                              .split('\n')
                                              .filter((v) => v.trim()),
                                          }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </Field>
                            {entry.reason && (
                              <p className="small muted">Why included: {entry.reason}</p>
                            )}
                          </div>
                        ))}
                        <Field label="Add from your experience bank">
                          <select
                            value=""
                            onChange={(e) => {
                              const exp = profile.experiences.find((v) => v.id === e.target.value);
                              if (!exp) return;
                              patchResume({
                                entries: [
                                  ...resume.entries,
                                  {
                                    sourceId: exp.id,
                                    title: exp.title,
                                    organization: exp.organization,
                                    dates: exp.dates,
                                    kind: exp.kind,
                                    url: exp.url,
                                    bullets: exp.details.split('\n').filter(Boolean),
                                    reason: 'Added by you from your experience bank.',
                                  },
                                ],
                              });
                            }}
                          >
                            <option value="">Choose an experience…</option>
                            {profile.experiences
                              .filter((exp) => !resume.entries.some((v) => v.sourceId === exp.id))
                              .map((exp) => (
                                <option value={exp.id} key={exp.id}>
                                  {exp.title}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="Education">
                          <textarea
                            rows={3}
                            value={resume.education}
                            onChange={(e) => patchResume({ education: e.target.value })}
                          />
                        </Field>
                      </div>
                    ) : (
                      <div className="resume-paper">
                        <h2>{resume.name}</h2>
                        <p className="resume-contact">
                          {[resume.email, resume.phone, resume.location, resume.website]
                            .filter(Boolean)
                            .join(' | ')}
                        </p>
                        {resume.summary && (
                          <>
                            <h4>PROFILE</h4>
                            <p>{resume.summary}</p>
                          </>
                        )}
                        {!!resume.skills.length && (
                          <>
                            <h4>SKILLS</h4>
                            <p>{resume.skills.join(' · ')}</p>
                          </>
                        )}
                        {['Experience', 'Project', 'Volunteering', 'Education'].map(
                          (kind) =>
                            resume.entries.some((e) => e.kind === kind) && (
                              <div key={kind}>
                                <h4>{kind === 'Project' ? 'PROJECTS' : kind.toUpperCase()}</h4>
                                {resume.entries
                                  .filter((e) => e.kind === kind)
                                  .map((entry) => (
                                    <div className="paper-entry" key={entry.sourceId}>
                                      <strong>
                                        {entry.title}
                                        {entry.organization && ` — ${entry.organization}`}
                                      </strong>
                                      <p className="small muted">{entry.dates}</p>
                                      {entry.url && <p className="small">{entry.url}</p>}
                                      <ul>
                                        {entry.bullets.map((bullet, i) => (
                                          <li key={i}>{bullet}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                              </div>
                            ),
                        )}
                        {resume.education && (
                          <>
                            <h4>EDUCATION</h4>
                            <p className="pre-line">{resume.education}</p>
                          </>
                        )}
                      </div>
                    )}
                    <label className="review-check">
                      <input
                        type="checkbox"
                        checked={resume.reviewed}
                        disabled={locked}
                        onChange={(e) => patchResume({ reviewed: e.target.checked })}
                      />
                      <span>
                        <strong>I’ve reviewed this resume for accuracy.</strong>
                        <small>
                          Check facts, dates, skills, and wording. Edits require a new review.
                        </small>
                      </span>
                      <ShieldCheck size={20} />
                    </label>
                    <div className="flex-row">
                      <Button
                        variant="ghost"
                        disabled={busy || !aiConfigured || !draft.requirementsComplete}
                        onClick={tailor}
                      >
                        <Plus size={16} />
                        New AI version
                      </Button>
                      <Button variant="ghost" onClick={() => addResume(manualResume(profile))}>
                        New manual version
                      </Button>
                    </div>
                  </>
                ))}
              {tab === 'tracking' && (
                <div className="stack">
                  <div className="section-heading">
                    <h3>Your application log</h3>
                    <CalendarDays size={20} />
                  </div>
                  <Field label="Status">
                    <select value={draft.status} onChange={(e) => status(e.target.value as Status)}>
                      {statuses.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="form-grid">
                    <Field label="Applied on">
                      <input
                        type="date"
                        value={draft.appliedAt}
                        onChange={(e) => commit({ ...draft, appliedAt: e.target.value })}
                      />
                    </Field>
                    <Field label="Follow up on">
                      <input
                        type="date"
                        value={draft.followUp}
                        onChange={(e) => commit({ ...draft, followUp: e.target.value })}
                      />
                    </Field>
                    <Field label="Application deadline">
                      <input
                        type="date"
                        value={draft.deadline}
                        onChange={(e) => commit({ ...draft, deadline: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Notes">
                    <textarea
                      rows={7}
                      value={draft.notes}
                      onChange={(e) => commit({ ...draft, notes: e.target.value })}
                      placeholder="Recruiter details, interview notes, next steps…"
                    />
                  </Field>
                  <div className="tracking-history">
                    <History size={17} />
                    <div>
                      <strong>
                        {draft.appliedResumeId
                          ? `Submitted: version ${draft.resumes.findIndex((r) => r.id === draft.appliedResumeId) + 1}`
                          : 'No submitted resume version recorded'}
                      </strong>
                      <p className="muted">
                        {draft.appliedAt
                          ? `Applied ${formatDate(draft.appliedAt)}`
                          : 'Mark the job applied after submitting on the company website.'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedApplied(draft.appliedResumeId || version);
                      setApplyModal(true);
                    }}
                  >
                    Record submitted version
                  </Button>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Remove this opportunity?"
        description="This removes its application log and saved resume versions. Export a backup from Settings if you want to keep them."
      >
        <div className="modal-footer">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove}>
            Remove job
          </Button>
        </div>
      </Modal>
      <Modal
        open={applyModal}
        onClose={() => setApplyModal(false)}
        title="Record your application"
        description="Use this after submitting your application on the company website."
      >
        <div className="stack">
          <Field label="Resume used">
            <select value={selectedApplied} onChange={(e) => setSelectedApplied(e.target.value)}>
              <option value="">No saved version / another resume</option>
              {draft.resumes.map((r, i) => (
                <option value={r.id} key={r.id}>
                  Version {i + 1} · {r.origin}
                  {r.reviewed ? ' · Reviewed' : ' · Not reviewed'}
                </option>
              ))}
            </select>
          </Field>
          <p className="small muted">
            The selected version will be kept as the submitted copy. To edit it later, make a
            duplicate.
          </p>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setApplyModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                commit({
                  ...draft,
                  status: 'Applied',
                  appliedAt: draft.appliedAt || localDate(),
                  appliedResumeId: selectedApplied,
                });
                setApplyModal(false);
                notify('Application recorded. Good luck!');
              }}
            >
              <Check size={16} />
              Mark applied
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={editJob} onClose={() => setEditJob(false)} title="Edit opportunity">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            commit({
              ...draft,
              title: jobFields.title,
              company: jobFields.company,
              location: jobFields.location,
              url: jobFields.url,
              description: jobFields.description,
              requirementsComplete: jobFields.requirementsComplete,
            });
            setEditJob(false);
          }}
        >
          <div className="form-grid">
            <Field label="Role">
              <input
                required
                value={jobFields.title}
                onChange={(e) => setJobFields({ ...jobFields, title: e.target.value })}
              />
            </Field>
            <Field label="Company">
              <input
                required
                value={jobFields.company}
                onChange={(e) => setJobFields({ ...jobFields, company: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Location">
            <input
              value={jobFields.location}
              onChange={(e) => setJobFields({ ...jobFields, location: e.target.value })}
            />
          </Field>
          <Field label="Application URL">
            <input
              type="url"
              value={jobFields.url}
              onChange={(e) => setJobFields({ ...jobFields, url: e.target.value })}
            />
          </Field>
          <Field label="Description and requirements">
            <textarea
              rows={9}
              value={jobFields.description}
              onChange={(e) => setJobFields({ ...jobFields, description: e.target.value })}
            />
          </Field>
          {draft.source === 'Adzuna' && (
            <label className="simple-check">
              <input
                type="checkbox"
                checked={jobFields.requirementsComplete}
                onChange={(e) =>
                  setJobFields({
                    ...jobFields,
                    requirementsComplete: e.target.checked,
                  })
                }
              />
              I have added the full job requirements from the application page.
            </label>
          )}
          <div className="modal-footer">
            <Button type="submit">Save details</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
