export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number);
}
export function readApiResponse<T>(response: Response): Promise<T>;
