type ReturnPathStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function rememberAuthReturnPath(
  storage: ReturnPathStorage | undefined,
  pathname: string,
  search?: string,
): void;
export function consumeAuthReturnPath(storage: ReturnPathStorage | undefined): string | null;
export function clearAuthReturnPath(storage: ReturnPathStorage | undefined): void;
