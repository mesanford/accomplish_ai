import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import { errorMessage, isPermissionDenied } from '../errors';

describe('errorMessage', () => {
  it('never shows a raw Firestore error', () => {
    const raw = new FirebaseError('permission-denied', '7 PERMISSION_DENIED: Missing or insufficient permissions.');
    expect(isPermissionDenied(raw)).toBe(true);
    expect(errorMessage(raw)).toBe("You don't have permission to do that.");
    expect(errorMessage(new FirebaseError('unavailable', 'The service is currently unavailable.'))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('recognises a permission error in any case', () => {
    expect(isPermissionDenied(new Error('Permission denied for this document'))).toBe(true);
    expect(isPermissionDenied(new Error('Network down'))).toBe(false);
  });

  it('keeps the wording of a Cloud Function error', () => {
    expect(errorMessage(new FirebaseError('functions/invalid-argument', 'Choose a Scout.'))).toBe('Choose a Scout.');
    expect(errorMessage(new FirebaseError('functions/internal', 'internal'))).toMatch(/our side/);
  });
});
