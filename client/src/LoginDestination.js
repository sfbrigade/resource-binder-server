// Email links may be opened in another tab, so carry the destination in the
// link while restricting navigation to paths within this application.
export function loginDestination (value) {
  const path = typeof value === 'string' ? value : value?.pathname && `${value.pathname}${value.search || ''}${value.hash || ''}`;
  if (!path?.startsWith('/')) return '/';
  try {
    const origin = 'https://app.invalid';
    const url = new URL(path, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}
