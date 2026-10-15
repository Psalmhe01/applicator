import type { Job } from './model';
export type Opening = Job & {
  careerLevel: string;
  workArrangement: string;
  department: string;
};
export type OpeningFeed = {
  jobs: Opening[];
  total: number;
  available: number;
  page: number;
  pages: number;
  pageSize: number;
  companies: string[];
  sourceCount: number | null;
  sourceTotal: number | null;
  failed: string[];
  fetchedAt: string;
  nextRefreshAt?: string;
  provider: 'catalog' | 'adzuna';
};
