export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Hosting failures can return HTML or plain text. Never expose that body as a
// parser exception or render provider pages in the app's error messages.
export async function readApiResponse(response) {
  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') throw error;
    const message =
      response.status === 404
        ? 'The app could not reach this API route. Refresh and try again; if it continues, the owner needs to check the deployment.'
        : response.status === 504
          ? 'The server took too long to respond. Please try again.'
          : 'The server returned an unreadable response. Please try again.';
    throw new ApiError(message, response.status);
  }
  if (!response.ok)
    throw new ApiError(
      typeof result?.error === 'string' ? result.error : 'Request failed. Please try again.',
      response.status,
    );
  return result;
}
