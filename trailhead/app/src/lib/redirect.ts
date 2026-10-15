/** Where to go after signing in: a path inside this app, else home. Never another site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return '/';
  }
  // The sign-in pages themselves would only bounce the person back here.
  return next === '/signin' || next.startsWith('/signin?') || next.startsWith('/signin/') ? '/' : next;
}
