import { FirebaseError } from 'firebase/app';

/** True for a refused Firestore read or write, however the SDK and the emulator word it. */
export function isPermissionDenied(err: unknown): boolean {
  const text = /permission[_ -]denied|insufficient permissions/i;
  if (err instanceof FirebaseError) {
    return !err.code.startsWith('functions/') && (text.test(err.code) || text.test(err.message));
  }
  return err instanceof Error && text.test(err.message);
}

/** A message safe to show a person: the server's own wording, or a plain fallback. Never a raw Firestore error. */
export function errorMessage(err: unknown): string {
  if (isPermissionDenied(err)) {
    return "You don't have permission to do that.";
  }
  if (err instanceof FirebaseError) {
    if (err.code === 'functions/internal' || err.code === 'functions/unavailable') {
      return 'Something went wrong on our side. Try again in a moment.';
    }
    if (!err.code.startsWith('functions/') && !err.code.startsWith('auth/')) {
      return 'Something went wrong. Try again.';
    }
    return err.message.replace(/^Firebase: /, '');
  }
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}
