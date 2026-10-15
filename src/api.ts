let tokenProvider: () => Promise<string | null> = async () => null;
export function configureTokenProvider(provider: () => Promise<string | null>) {
  tokenProvider = provider;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function authorizedFetch(path: string, options: RequestInit = {}) {
  const token = await tokenProvider();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`/api/${path}`, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(70000),
  });
}
export async function api<T>(path: string, body?: unknown, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await authorizedFetch(path, {
    ...options,
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(result.error || 'Request failed. Please try again.', response.status);
  return result;
}
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.name === 'TimeoutError'
      ? 'The request timed out. Try again.'
      : error.message
    : 'Something went wrong.';
