import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BriefcaseBusiness,
  FileText,
  GraduationCap,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Pencil,
  FolderGit2,
  Check,
  Save,
} from 'lucide-react';
import { Button, Card, Field, Modal, Empty } from './components/ui';
import { type Profile, type Experience, id, splitList } from './model';
import { extractResume } from './export';
import { api, errorText } from './api';

export default function ProfileView({
  profile,
  save,
  aiConfigured,
  notify,
}: {
  profile: Profile;
  save: (p: Profile) => void;
  aiConfigured: boolean;
  notify: (text: string) => void;
}) {
  const [draft, setDraft] = useState<Profile>(profile),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [parsed, setParsed] = useState<Profile | null>(null),
    [editing, setEditing] = useState<Experience | null>(null),
    [adding, setAdding] = useState(false),
    [remove, setRemove] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = useRef({ draft, dirty, save });
  current.current = { draft, dirty, save };
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      current.current.save(current.current.draft);
      setDirty(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, dirty]);
  useEffect(
    () => () => {
      if (current.current.dirty) current.current.save(current.current.draft);
    },
    [],
  );
  function change<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }
  function commit(p = draft) {
    save(p);
    setDraft(p);
    setDirty(false);
    notify('Profile saved. Existing application resumes stay as they were.');
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await extractResume(file);
      setDraft((p) => ({ ...p, resumeText: text, resumeName: file.name }));
      setDirty(true);
      notify('Resume text loaded. Review it below, then organize your experience bank.');
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function parse() {
    setBusy(true);
    try {
      const result = await api<Omit<Profile, 'resumeText' | 'resumeName'>>('parse-resume', {
        text: draft.resumeText,
      });
      setParsed({
        ...result,
        resumeText: draft.resumeText,
        resumeName: draft.resumeName,
      });
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function saveEntry() {
    if (!editing) return;
    const p = {
      ...draft,
      experiences: adding
        ? [...draft.experiences, editing]
        : draft.experiences.map((e) => (e.id === editing.id ? editing : e)),
    };
    commit(p);
    setEditing(null);
  }
  const completeness = [
    !!draft.name,
    !!draft.email,
    !!draft.education,
    !!draft.skills.length,
    !!draft.experiences.length,
  ].filter(Boolean).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE WORK BEHIND YOUR WORK</div>
          <h1>
            Your experience bank<span className="serif-dot">.</span>
          </h1>
          <p>Keep the whole story here. Choose the right parts for each opportunity.</p>
        </div>
        <Button onClick={() => commit()} disabled={!dirty}>
          <Save size={16} />
          Save profile
        </Button>
      </div>
      <div className="profile-grid">
        <div className="stack">
          <Card className="profile-card">
            <div className="section-heading">
              <h3>The essentials</h3>
              <span className="muted">{completeness}/5 complete</span>
            </div>
            <div className="progress">
              <i style={{ width: `${completeness * 20}%` }} />
            </div>
            <div className="form-grid">
              <Field label="Full name">
                <input
                  value={draft.name}
                  onChange={(e) => change('name', e.target.value)}
                  placeholder="Your name"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) => change('email', e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={draft.phone}
                  onChange={(e) => change('phone', e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Location">
                <input
                  value={draft.location}
                  onChange={(e) => change('location', e.target.value)}
                  placeholder="City, country"
                />
              </Field>
            </div>
            <Field label="Portfolio / LinkedIn URL">
              <input
                value={draft.website}
                onChange={(e) => change('website', e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field
              label="About you"
              hint="A factual summary, not a list of requirements you hope to meet."
            >
              <textarea
                rows={3}
                value={draft.summary}
                onChange={(e) => change('summary', e.target.value)}
                placeholder="What you study, what you build, and the work you want to do."
              />
            </Field>
            <Field label="Skills" hint="Separate with commas. Only list skills you actually have.">
              <input
                defaultValue={draft.skills.join(', ')}
                key={parsed ? 'parsed' : 'profile'}
                onChange={(e) => change('skills', splitList(e.target.value))}
                placeholder="Python, React, SQL, Figma…"
              />
            </Field>
            <Field label="Education">
              <textarea
                rows={3}
                value={draft.education}
                onChange={(e) => change('education', e.target.value)}
                placeholder="Degree, university, graduation date, and relevant coursework"
              />
            </Field>
          </Card>
          <Card>
            <div className="section-heading">
              <div>
                <h3>Everything you bring</h3>
                <p className="muted">
                  Projects, part-time work, coursework, and the things that didn’t fit.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setAdding(true);
                  setEditing({
                    id: id(),
                    kind: 'Project',
                    title: '',
                    organization: '',
                    dates: '',
                    details: '',
                    skills: [],
                    url: '',
                  });
                }}
              >
                <Plus size={16} />
                Add experience
              </Button>
            </div>
            {!draft.experiences.length ? (
              <Empty
                icon={<FolderGit2 size={24} />}
                title="There’s more to your story"
                description="Add one experience or project to start. Include real details, tools, and outcomes."
              />
            ) : (
              <div className="experience-list">
                {draft.experiences.map((exp, index) => (
                  <div className="experience-row" key={exp.id}>
                    <div className={`exp-icon ${exp.kind === 'Project' ? 'peach' : 'sage'}`}>
                      {exp.kind === 'Project' ? (
                        <FolderGit2 size={20} />
                      ) : exp.kind === 'Education' ? (
                        <GraduationCap size={20} />
                      ) : (
                        <BriefcaseBusiness size={20} />
                      )}
                    </div>
                    <div className="grow">
                      <span className="eyebrow">{exp.kind}</span>
                      <h4>{exp.title}</h4>
                      <p className="muted">
                        {[exp.organization, exp.dates].filter(Boolean).join(' · ')}
                      </p>
                      <p className="clamp-2">{exp.details}</p>
                      <div className="tags">
                        {exp.skills.map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        title="Move up"
                        aria-label={`Move ${exp.title} up`}
                        disabled={index === 0}
                        onClick={() => {
                          const entries = [...draft.experiences];
                          [entries[index - 1], entries[index]] = [
                            entries[index],
                            entries[index - 1],
                          ];
                          change('experiences', entries);
                        }}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        title="Move down"
                        aria-label={`Move ${exp.title} down`}
                        disabled={index === draft.experiences.length - 1}
                        onClick={() => {
                          const entries = [...draft.experiences];
                          [entries[index + 1], entries[index]] = [
                            entries[index],
                            entries[index + 1],
                          ];
                          change('experiences', entries);
                        }}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Edit ${exp.title}`}
                        onClick={() => {
                          setAdding(false);
                          setEditing(structuredClone(exp));
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${exp.title}`}
                        onClick={() => setRemove(exp.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        <div className="stack">
          <Card className="resume-upload">
            <div className="eyebrow">START WITH WHAT YOU HAVE</div>
            <div className="upload-illustration">
              <FileText size={42} strokeWidth={1.3} />
              <span>
                <Check size={13} />
              </span>
            </div>
            <h3>Your current resume</h3>
            <p className="muted">
              Upload a resume to extract its text. Original files stay on your device.
            </p>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} busy={busy}>
              <Upload size={16} />
              {draft.resumeName ? 'Replace resume' : 'Upload resume'}
            </Button>
            <small>PDF, DOCX, or TXT · up to 10 MB</small>
            {draft.resumeName && (
              <div className="filename">
                <FileText size={15} />
                {draft.resumeName}
              </div>
            )}
            <input
              type="file"
              ref={fileRef}
              accept=".pdf,.docx,.txt"
              hidden
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </Card>
          <Card className="sage-note">
            <Sparkles size={22} />
            <h3>A little help, your actual story.</h3>
            <p>
              Gemini can organize your uploaded resume into profile fields. You review every entry
              before it’s added.
            </p>
            <Button
              variant="secondary"
              onClick={parse}
              disabled={!aiConfigured || draft.resumeText.trim().length < 30}
              busy={busy}
            >
              <Sparkles size={16} />
              Organize with AI
            </Button>
            {!aiConfigured && <small>Connect Gemini in Settings to enable this.</small>}
          </Card>
          <Card>
            <Field
              label="Original resume text"
              hint="Paste text here if your PDF is scanned. AI only receives this when you choose Organize with AI."
            >
              <textarea
                rows={12}
                value={draft.resumeText}
                onChange={(e) => change('resumeText', e.target.value)}
                placeholder="Your extracted or pasted resume text…"
              />
            </Field>
          </Card>
          {dirty && (
            <div className="inline-note">
              <Save size={16} />
              Saving profile changes on this device…
            </div>
          )}
        </div>
      </div>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={adding ? 'Add to your experience bank' : 'Edit experience'}
        description="Write factual details. These become the source for tailored resumes."
      >
        {editing && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              saveEntry();
            }}
          >
            <Field label="Type">
              <select
                value={editing.kind}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    kind: e.target.value as Experience['kind'],
                  })
                }
              >
                {['Experience', 'Project', 'Education', 'Volunteering'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </Field>
            <Field label="Role / project name">
              <input
                required
                maxLength={300}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="e.g. Campus event finder"
              />
            </Field>
            <div className="form-grid">
              <Field label="Organization">
                <input
                  value={editing.organization}
                  onChange={(e) => setEditing({ ...editing, organization: e.target.value })}
                />
              </Field>
              <Field label="Dates">
                <input
                  value={editing.dates}
                  onChange={(e) => setEditing({ ...editing, dates: e.target.value })}
                  placeholder="Jun 2025 – Aug 2025"
                />
              </Field>
            </div>
            <Field
              label="What you did"
              hint="One bullet per line. Include verified outcomes or numbers when you have them."
            >
              <textarea
                required
                rows={5}
                value={editing.details}
                onChange={(e) => setEditing({ ...editing, details: e.target.value })}
              />
            </Field>
            <Field label="Skills used">
              <input
                defaultValue={editing.skills.join(', ')}
                key={editing.id}
                onChange={(e) => setEditing({ ...editing, skills: splitList(e.target.value) })}
              />
            </Field>
            <Field label="Project URL (optional)">
              <input
                type="url"
                value={editing.url}
                onChange={(e) => setEditing({ ...editing, url: e.target.value })}
              />
            </Field>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit">Save experience</Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={!!parsed}
        onClose={() => setParsed(null)}
        title="Review the extracted profile"
        description="This replaces your profile fields and experience bank. Existing job resumes are preserved."
      >
        {parsed && (
          <>
            <div className="review-summary">
              <h3>{parsed.name || 'No name found'}</h3>
              <p>{[parsed.email, parsed.location].filter(Boolean).join(' · ')}</p>
              <p>{parsed.education}</p>
              <div className="tags">
                {parsed.skills.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            </div>
            <div className="review-list">
              {parsed.experiences.map((exp) => (
                <div key={exp.id}>
                  <strong>
                    {exp.title} · {exp.organization}
                  </strong>
                  <small>
                    {exp.kind} · {exp.dates}
                  </small>
                  <p className="pre-line">{exp.details}</p>
                </div>
              ))}
            </div>
            <p className="inline-note">
              Review the facts after importing. Add any projects that weren’t in the original
              resume.
            </p>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setParsed(null)}>
                Keep current profile
              </Button>
              <Button
                onClick={() => {
                  commit(parsed);
                  setParsed(null);
                }}
              >
                Use extracted profile
              </Button>
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={!!remove}
        onClose={() => setRemove(null)}
        title="Remove this experience?"
        description="Saved resumes keep their original content."
      >
        <div className="modal-footer">
          <Button variant="secondary" onClick={() => setRemove(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              commit({
                ...draft,
                experiences: draft.experiences.filter((e) => e.id !== remove),
              });
              setRemove(null);
            }}
          >
            Remove experience
          </Button>
        </div>
      </Modal>
    </>
  );
}
