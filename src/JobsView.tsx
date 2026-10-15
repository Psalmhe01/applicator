import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import type { Opening, OpeningFeed } from './discovery';
import {
  ArrowUpRight,
  Bookmark,
  BriefcaseBusiness,
  Check,
  Download,
  FileText,
  Globe2,
  Link,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button, Card, Empty, Field, Modal, Pill } from './components/ui';
import { type Job, type Status, newJob, statuses, formatDate, localDate } from './model';
import { api, authorizedFetch, errorText } from './api';
import { readApiResponse } from './apiResponse.mjs';
import { findSavedOpening, selectOpening } from './openingActions.mjs';
import { useAuth } from './Auth';
import { exportCsv } from './export';
import OpeningPreview from './OpeningPreview';
import { departmentOptions, departmentLabels } from '../shared/departments.mjs';

export function JobCard({
  job,
  open,
  discover = false,
  onSave,
  saved = false,
}: {
  job: Job & Partial<Opening>;
  open: () => void;
  discover?: boolean;
  onSave?: () => void;
  saved?: boolean;
}) {
  const departments =
    departmentLabels(job.departmentGroups).slice(0, 2).join(' · ') || job.department;
  return (
    <Card className="job-card">
      <div className="flex-row">
        <div className={`company-avatar color-${job.company.charCodeAt(0) % 4}`}>
          {job.company.slice(0, 2).toUpperCase()}
        </div>
        <div className="grow">
          <strong>{job.company}</strong>
          <small className="muted">
            {discover ? job.source : `Saved ${formatDate(job.createdAt)}`}
          </small>
        </div>
        {discover ? (
          <Button
            variant="ghost"
            disabled={saved}
            onClick={onSave}
            aria-label={saved ? 'Already saved' : `Save ${job.title}`}
            className="bookmark-button"
          >
            {saved ? <Check size={18} /> : <Bookmark size={18} />}
          </Button>
        ) : (
          <Pill status={job.status} />
        )}
      </div>
      <button className="job-title" onClick={open}>
        {job.title}
        <ArrowUpRight size={18} />
      </button>
      <div className="job-meta">
        <MapPin size={14} />
        <span>{job.location || 'Location not specified'}</span>
      </div>
      {discover && (
        <div className="opening-tags">
          <span>{job.careerLevel}</span>
          <span>{job.workArrangement}</span>
          {departments && <span title={job.department || undefined}>{departments}</span>}
          {job.updatedAt && (
            <span>
              {job.source === 'Adzuna' ? 'Posted' : 'Updated'} {formatDate(job.updatedAt)}
            </span>
          )}
        </div>
      )}
      {discover && job.source === 'Adzuna' && (
        <a
          className="adzuna-attribution"
          href="https://www.adzuna.com"
          target="_blank"
          rel="noreferrer"
        >
          Adzuna
        </a>
      )}
      <p className="job-excerpt clamp-2">
        {job.description ||
          (discover
            ? 'Open this listing to read the employer?s full requirements.'
            : 'Add the job requirements to prepare a tailored resume.')}
      </p>
      {discover && job.profileMatch && (
        <p className="small muted">
          {job.profileMatch.skills.length || job.profileMatch.keywords.length
            ? `Profile terms found: ${[...job.profileMatch.skills, ...job.profileMatch.keywords].slice(0, 4).join(', ')}`
            : 'No profile terms found in this listing text.'}
        </p>
      )}
      <div className="job-card-footer">
        <span>
          {discover ? (
            'Company job board'
          ) : job.resumes.length ? (
            <>
              <FileText size={14} />
              {job.resumes.length} resume {job.resumes.length === 1 ? 'version' : 'versions'}
            </>
          ) : (
            <>
              <FileText size={14} />
              Resume not prepared
            </>
          )}
        </span>
        <Button variant="ghost" onClick={open}>
          {discover ? 'View opening' : 'Open workspace'}
          <ArrowUpRight size={14} />
        </Button>
      </div>
    </Card>
  );
}

export default function JobsView({
  jobs,
  save,
  open,
  notify,
  discover = false,
  tracker = false,
}: {
  jobs: Job[];
  save: (j: Job) => void;
  open: (j: Job) => void;
  notify: (s: string) => void;
  discover?: boolean;
  tracker?: boolean;
}) {
  const { account } = useAuth();
  const [provider, setProvider] = useState<'catalog' | 'adzuna'>(
    account?.providers.adzuna && account.settings.adzunaEnabled ? 'adzuna' : 'catalog',
  );
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('All'),
    [adding, setAdding] = useState(false),
    [draft, setDraft] = useState(newJob({})),
    [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<OpeningFeed | null>(null),
    [feedError, setFeedError] = useState(''),
    [loading, setLoading] = useState(false),
    [level, setLevel] = useState('Early career'),
    [company, setCompany] = useState(''),
    [department, setDepartment] = useState(''),
    [location, setLocation] = useState(''),
    [work, setWork] = useState(''),
    [sort, setSort] = useState('updated'),
    [page, setPage] = useState(1),
    [refreshToken, setRefreshToken] = useState(0),
    [openingId, setOpeningId] = useState(''),
    [previewJob, setPreviewJob] = useState<Job | null>(null);
  const handledRefresh = useRef(0),
    openingInFlight = useRef(false);
  const discovery = discover && !tracker;
  useEffect(() => {
    if (!discovery) return;
    const timer = setInterval(() => setRefreshToken((t) => t + 1), 15 * 60000);
    return () => clearInterval(timer);
  }, [discovery]);
  useEffect(() => {
    if (!discovery) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setFeedError('');
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({
        provider,
        q: query,
        level,
        company,
        department,
        location,
        work,
        sort,
        page: String(page),
      });
      if (handledRefresh.current !== refreshToken) {
        params.set('refresh', '1');
        handledRefresh.current = refreshToken;
      }
      try {
        const response = await authorizedFetch(`openings?${params}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(70000)]),
        });
        const result = await readApiResponse<OpeningFeed>(response);
        if (active) setFeed(result);
      } catch (e) {
        if (active) setFeedError(errorText(e));
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    discovery,
    provider,
    query,
    level,
    company,
    department,
    location,
    work,
    sort,
    page,
    refreshToken,
  ]);
  function refresh() {
    setRefreshToken((t) => t + 1);
  }
  function clearFilters() {
    setQuery('');
    setLevel('Early career');
    setCompany('');
    setDepartment('');
    setLocation('');
    setWork('');
    setSort('updated');
    setPage(1);
  }
  async function useOpening(job: Job, view: boolean) {
    if (openingInFlight.current) return;
    openingInFlight.current = true;
    setOpeningId(job.id);
    try {
      const result = await selectOpening(job, jobs, view ? 'view' : 'save', {
        load: (id) => api<Job>(`openings/${encodeURIComponent(id)}`),
        preview: setPreviewJob,
        open,
        save,
      });
      if (result === 'saved') notify('Opportunity saved to your workspace.');
      if (result === 'already-saved') notify('This opening is already in your workspace.');
    } catch (e) {
      notify(errorText(e));
    } finally {
      openingInFlight.current = false;
      setOpeningId('');
    }
  }
  function savePreview() {
    if (!previewJob) return;
    // Prefer the saved copy if it was added while this preview was open.
    const existing = findSavedOpening(previewJob, jobs);
    const saved = existing || { ...previewJob, createdAt: new Date().toISOString() };
    if (!existing) save(saved);
    setPreviewJob(null);
    open(saved);
    if (!existing) notify('Opportunity saved to your workspace.');
  }
  function add() {
    setDraft(newJob({}));
    setAdding(true);
  }
  function alreadySaved(job: Job) {
    return jobs.some((j) => j.id === job.id || (job.url && j.url === job.url));
  }
  async function importLink() {
    setBusy(true);
    try {
      if (!draft.url.startsWith('https://'))
        throw new Error('Use a public HTTPS advertisement link.');
      const result = await api<Partial<Job>>('import-job', { url: draft.url });
      setDraft((d) => ({ ...d, ...result, source: 'Imported from a link' }));
      notify('Page imported. Review the company, title, and requirements before saving.');
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const source = discovery ? feed?.jobs || [] : jobs;
  const filtered = discovery
    ? source
    : source.filter(
        (j) =>
          (filter === 'All' || j.status === filter) &&
          `${j.title} ${j.company} ${j.location} ${j.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {tracker ? 'LESS SPREADSHEET, MORE MOMENTUM' : 'MAKE ROOM FOR POSSIBILITY'}
          </div>
          <h1>
            {tracker ? 'Your application tracker' : 'Find your next chapter'}
            <span className="serif-dot">.</span>
          </h1>
          <p>
            {tracker
              ? 'Every application, next step, and resume version in one place.'
              : 'Save good opportunities. Prepare with purpose. Apply when you’re ready.'}
          </p>
        </div>
        <div className="flex-row">
          {tracker && (
            <Button variant="secondary" disabled={!jobs.length} onClick={() => exportCsv(jobs)}>
              <Download size={16} />
              Export CSV
            </Button>
          )}
          <Button onClick={add}>
            <Plus size={17} />
            Add opportunity
          </Button>
        </div>
      </div>
      {!tracker && (
        <nav className="tabs" aria-label="Opportunity sources">
          <RouterLink
            to="/opportunities"
            aria-current={!discovery ? 'page' : undefined}
            onClick={() => setFilter('All')}
          >
            Saved opportunities <span>{jobs.length}</span>
          </RouterLink>
          <RouterLink
            to="/opportunities?tab=discover"
            aria-current={discovery ? 'page' : undefined}
            onClick={() => setFilter('All')}
          >
            <Globe2 size={15} />
            Discover openings
          </RouterLink>
        </nav>
      )}
      {discovery && (
        <>
          <div className="discovery-controls" aria-busy={loading}>
            <div className="discovery-heading">
              <div>
                <h3>Open opportunities, all in one place.</h3>
                <p>
                  {provider === 'catalog'
                    ? 'Company boards load automatically. Start with internships and early-career roles, or explore all roles.'
                    : 'Search employers across Adzuna’s US listings. Filters use search keywords; results can include related roles.'}
                </p>
              </div>
              <Button variant="secondary" busy={loading} onClick={refresh}>
                <RefreshCw size={16} />
                Refresh openings
              </Button>
            </div>
            {feed && (
              <small>
                {feed.available.toLocaleString()}{' '}
                {provider === 'catalog'
                  ? `listings across ${feed.sourceCount} reachable company boards`
                  : 'matching US listings'}
                . Checked {new Date(feed.fetchedAt).toLocaleString()}.{' '}
                {provider === 'catalog'
                  ? 'Refresh checks at most once a minute.'
                  : 'Shared search results are cached for 15 minutes to conserve the free allowance.'}
              </small>
            )}
            <small>
              {provider === 'catalog'
                ? 'Coverage focuses on the companies in our catalog. Greenhouse and Lever feeds are checked every 15 minutes while you browse. Dates shown are employer updates when provided.'
                : 'US search covers employers in the provider’s index. It supplies description snippets; paste the full requirements before AI tailoring. Work arrangements use keywords and may need checking on the application page.'}
            </small>
            {feed?.failed.length ? (
              <details className="source-issues">
                <summary>
                  {feed.failed.length} company{' '}
                  {feed.failed.length === 1 ? 'board was' : 'boards were'} unavailable; other
                  results loaded.
                </summary>
                <p>{feed.failed.join(', ')}</p>
              </details>
            ) : null}
            {feedError && (
              <div className="error-banner" role="alert">
                {feedError}
                {feed && ' Showing the previous results until a new check succeeds.'}
              </div>
            )}
          </div>
          <div className="discovery-filters">
            <Field label="Job source">
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as 'catalog' | 'adzuna');
                  setFeed(null);
                  setPage(1);
                  setCompany('');
                  setDepartment('');
                  setSort('updated');
                  setWork('');
                }}
              >
                <option value="catalog" disabled={!account?.settings.catalogEnabled}>
                  Company boards
                </option>
                <option
                  value="adzuna"
                  disabled={!account?.providers.adzuna || !account.settings.adzunaEnabled}
                >
                  Broader US search
                  {!account?.providers.adzuna ? ' · owner setup needed' : ''}
                </option>
              </select>
            </Field>
            <Field label="Career level">
              <select
                value={level}
                onChange={(e) => {
                  setLevel(e.target.value);
                  setPage(1);
                }}
              >
                <option>Early career</option>
                <option>Internship</option>
                <option>Entry level</option>
                <option value="All">All roles</option>
                {provider === 'catalog' && <option>Other roles</option>}
              </select>
            </Field>
            <Field
              label="Department"
              hint={
                provider === 'catalog'
                  ? 'Grouped from employer departments and job titles; a role can belong to several groups.'
                  : 'Uses the provider’s US job categories.'
              }
            >
              <select
                value={department}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All departments</option>
                {(provider === 'catalog' ? departmentOptions : feed?.departments || []).map(
                  (option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ),
                )}
              </select>
              {provider === 'adzuna' && feed?.departmentError && (
                <small>{feed.departmentError}</small>
              )}
            </Field>
            <Field label={provider === 'adzuna' ? 'Company keyword' : 'Company'}>
              {provider === 'adzuna' ? (
                <input
                  value={company}
                  placeholder="Any employer"
                  onChange={(e) => {
                    setCompany(e.target.value);
                    setPage(1);
                  }}
                />
              ) : (
                <select
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All companies</option>
                  {feed?.companies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Location">
              <input
                value={location}
                placeholder="City or country"
                onChange={(e) => {
                  setLocation(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field label="Work arrangement">
              <select
                value={work}
                onChange={(e) => {
                  setWork(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any arrangement</option>
                {(provider === 'catalog'
                  ? ['Remote', 'Hybrid', 'On site', 'Not specified']
                  : ['Remote', 'Hybrid', 'On site']
                ).map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </Field>
            <Field label="Sort by">
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                <option value="updated">
                  {provider === 'catalog' ? 'Recently updated' : 'Newest posted'}
                </option>
                <option value="profile">Relevant to my profile</option>
                {provider === 'catalog' ? (
                  <>
                    <option value="company">Company A–Z</option>
                    <option value="title">Title A–Z</option>
                  </>
                ) : (
                  <option value="relevance">Most relevant</option>
                )}
              </select>
            </Field>
            <Button variant="ghost" onClick={clearFilters}>
              Reset filters
            </Button>
          </div>
          {sort === 'profile' && (
            <p className="small muted">
              Uses your saved skills, experience/project text and education. Matches use available
              listing text; they do not predict eligibility or hiring outcomes.{' '}
              {provider === 'catalog'
                ? 'Ranks all filtered company-board listings before pagination.'
                : 'Ranks this returned page only, not the entire US index.'}
              {feed?.profileRankingAvailable === false &&
                ' Add skills or experience to your bank to personalize this sort.'}
            </p>
          )}
        </>
      )}
      <div className="filterbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search opportunities"
            placeholder="Search roles, companies, or keywords…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {!discovery && (
          <div className="status-filter">
            <SlidersHorizontal size={15} />
            <select
              aria-label="Filter by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="All">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <span className="result-count" role="status" aria-live="polite">
          {discovery && loading
            ? 'Checking openings…'
            : `${discovery ? (feed?.total ?? 0) : filtered.length} ${(discovery ? (feed?.total ?? 0) : filtered.length) === 1 ? 'opportunity' : 'opportunities'}`}
        </span>
      </div>
      {discovery && openingId && (
        <div className="inline-note" role="status">
          Loading the opening and its available requirements…
        </div>
      )}
      {tracker && !!jobs.length && (
        <div className="pipeline-strip">
          {statuses.slice(0, 6).map((s) => (
            <button
              key={s}
              className={filter === s ? 'active' : ''}
              onClick={() => setFilter(filter === s ? 'All' : s)}
            >
              <i className={s.toLowerCase()} />
              <span>{s}</span>
              <strong>{jobs.filter((j) => j.status === s).length}</strong>
            </button>
          ))}
        </div>
      )}
      {!filtered.length ? (
        <Card className="large-empty">
          <Empty
            icon={discovery ? <Globe2 size={28} /> : <BriefcaseBusiness size={28} />}
            title={
              discovery
                ? loading
                  ? 'Checking company boards…'
                  : feedError
                    ? 'Openings could not load'
                    : 'No openings match these filters'
                : query || filter !== 'All'
                  ? 'No opportunities match this view'
                  : 'Your next opportunity belongs here.'
            }
            description={
              discovery
                ? loading
                  ? 'The first check may take a little longer. Results will appear automatically.'
                  : 'Try a different keyword, location, or career level.'
                : query || filter !== 'All'
                  ? 'Try another search or status filter.'
                  : 'Paste a job link or description to start preparing your first application.'
            }
            action={
              discovery ? (
                <Button
                  variant="secondary"
                  busy={loading}
                  onClick={feedError ? refresh : clearFilters}
                >
                  {feedError ? 'Try again' : 'Reset filters'}
                </Button>
              ) : (
                <Button onClick={add}>
                  <Plus size={16} />
                  Add your first opportunity
                </Button>
              )
            }
          />
        </Card>
      ) : tracker ? (
        <div className="application-table-wrap">
          <table className="application-table">
            <thead>
              <tr>
                <th>Opportunity</th>
                <th>Status</th>
                <th>Applied</th>
                <th>Next follow-up</th>
                <th>Resume</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr key={j.id} onClick={() => open(j)}>
                  <td>
                    <strong>{j.company}</strong>
                    <span>{j.title}</span>
                  </td>
                  <td>
                    <Pill status={j.status} />
                  </td>
                  <td>{formatDate(j.appliedAt)}</td>
                  <td>
                    <span
                      className={
                        j.followUp &&
                        j.followUp <= localDate() &&
                        !['Rejected', 'Withdrawn', 'Offer'].includes(j.status)
                          ? 'due'
                          : ''
                      }
                    >
                      {formatDate(j.followUp)}
                    </span>
                  </td>
                  <td>
                    {j.appliedResumeId
                      ? `Submitted v${j.resumes.findIndex((r) => r.id === j.appliedResumeId) + 1}`
                      : j.resumes.length
                        ? `${j.resumes.length} saved`
                        : '—'}
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Open ${j.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        open(j);
                      }}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="jobs-grid" aria-busy={discovery && loading}>
          {filtered.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              open={() => {
                if (discovery) {
                  void useOpening(j, true);
                } else open(j);
              }}
              discover={discovery}
              onSave={() => {
                void useOpening(j, false);
              }}
              saved={alreadySaved(j)}
            />
          ))}
        </div>
      )}
      {discovery && feed && feed.pages > 1 && (
        <div className="discovery-pagination">
          <Button
            variant="secondary"
            disabled={loading || feed.page <= 1}
            onClick={() => setPage(feed.page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {feed.page} of {feed.pages} · {feed.total.toLocaleString()} results
          </span>
          <Button
            variant="secondary"
            disabled={loading || feed.page >= feed.pages}
            onClick={() => setPage(feed.page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <OpeningPreview
        job={previewJob}
        saved={!!previewJob && !!findSavedOpening(previewJob, jobs)}
        save={savePreview}
        close={() => setPreviewJob(null)}
      />
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add an opportunity"
        description="Paste a job advertisement link, its description, or both."
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.url && alreadySaved(draft)) {
              notify('This application link is already saved.');
              return;
            }
            save(draft);
            setAdding(false);
            notify('Opportunity added. Open it to prepare your resume.');
          }}
        >
          <Field label="Advertisement / application link">
            <div className="input-action">
              <input
                type="url"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://company.com/careers/…"
              />
              <Button variant="secondary" busy={busy} disabled={!draft.url} onClick={importLink}>
                <Link size={15} />
                Read link
              </Button>
            </div>
          </Field>
          <p className="small muted">
            Some websites block link reading. You can always paste the description instead.
          </p>
          <div className="form-grid">
            <Field label="Job title">
              <input
                required
                maxLength={300}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Software engineering intern"
              />
            </Field>
            <Field label="Company">
              <input
                required
                maxLength={300}
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                placeholder="Company name"
              />
            </Field>
            <Field label="Location">
              <input
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="Remote / city"
              />
            </Field>
            <Field label="Deadline (optional)">
              <input
                type="date"
                value={draft.deadline}
                onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
              />
            </Field>
          </div>
          <Field
            label="Description and requirements"
            hint="Include responsibilities, qualifications, and required skills for useful tailoring."
          >
            <textarea
              rows={7}
              maxLength={50000}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Paste the job advertisement here…"
            />
          </Field>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              <Plus size={16} />
              Save opportunity
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
