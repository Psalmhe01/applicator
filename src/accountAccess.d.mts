export function resolveAccount<T>(options: {
  request: <R>(path: string, body?: unknown) => Promise<R>;
  invitation: string;
  clearInvitation: () => void;
}): Promise<T>;
