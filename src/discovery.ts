import type { Job } from './model';
export type Opening = Job & {
  careerLevel: string;
  workArrangement: string;
  department: string;
  profileMatch?: { skills: string[]; keywords: string[] };
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
  rankingScope?: 'catalog' | 'page';
  profileRankingAvailable?: boolean;
  departments?: { value: string; label: string }[];
  departmentError?: string;
};
