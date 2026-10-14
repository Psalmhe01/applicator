export async function api<T>(path:string, body?:unknown):Promise<T> {
  const response = await fetch(`/api/${path}`,{ method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(70000) });
  const result = await response.json();
  if(!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
  return result;
}
export const errorText = (error:unknown) => error instanceof Error ? error.name==='TimeoutError' ? 'The request timed out. Try again.' : error.message : 'Something went wrong.';
