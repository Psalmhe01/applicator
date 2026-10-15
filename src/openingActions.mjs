export function findSavedOpening(job, jobs) {
  return jobs.find((saved) => saved.id === job.id || (job.url && saved.url === job.url));
}

// Discovery previews never touch persistence. Only an explicit Save action adds a job.
export async function selectOpening(job, jobs, intent, actions) {
  const existing = findSavedOpening(job, jobs);
  if (existing) {
    if (intent === 'view') {
      actions.open(existing);
      return 'opened';
    }
    return 'already-saved';
  }
  const full = await actions.load(job.id);
  if (intent === 'view') {
    actions.preview(full);
    return 'previewed';
  }
  actions.save({ ...full, createdAt: new Date().toISOString() });
  return 'saved';
}
