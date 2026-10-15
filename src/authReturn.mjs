const returnPathKey = 'applicator.authReturnPath';

function localPath(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\#\u0000-\u0020\u007f]/.test(value)
  )
    return null;
  try {
    const base = 'https://applicator.invalid';
    const url = new URL(value, base);
    const path = url.pathname + url.search;
    return url.origin === base && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}

// Keep the public auth callback at the configured origin while retaining the
// page requested in this tab. Never persist OAuth fragments or credentials.
export function rememberAuthReturnPath(storage, pathname, search = '') {
  try {
    const path = localPath(pathname + search);
    if (path && path !== '/') storage.setItem(returnPathKey, path);
    else storage.removeItem(returnPathKey);
  } catch {}
}

export function consumeAuthReturnPath(storage) {
  try {
    const path = storage.getItem(returnPathKey);
    storage.removeItem(returnPathKey);
    return localPath(path);
  } catch {
    return null;
  }
}

export function clearAuthReturnPath(storage) {
  try {
    storage.removeItem(returnPathKey);
  } catch {}
}
