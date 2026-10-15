import type { Job } from './model';
export function findSavedOpening(job: Job, jobs: Job[]): Job | undefined;
export function selectOpening(
  job: Job,
  jobs: Job[],
  intent: 'view' | 'save',
  actions: {
    load: (id: string) => Promise<Job>;
    preview: (job: Job) => void;
    open: (job: Job) => void;
    save: (job: Job) => void;
  },
): Promise<'opened' | 'already-saved' | 'previewed' | 'saved'>;
