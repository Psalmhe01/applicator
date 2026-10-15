export const departmentOptions: { value: string; label: string }[];
export function departmentGroups(title?: string, department?: string): string[];
export function departmentLabels(groups?: string[]): string[];
export function validateDepartment(selected?: string): void;
export function matchesDepartment(
  job: { title?: string; department?: string },
  selected?: string,
): boolean;
