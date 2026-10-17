import { clearIndexedDbPersistence, doc, terminate } from 'firebase/firestore';
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { clearBadge } from './badge';
import { auth, db } from './firebase';
import { useDoc } from './hooks';
import { dropDeviceOnSignOut } from './push';
import { safeNext } from './redirect';
import { storage } from './storage';
import type { UserDoc } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  profile: UserDoc | null;
}

const AuthContext = createContext<AuthState>({ user: null, ready: false, profile: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );
  const profileRef = useMemo(() => (user ? doc(db, 'users', user.uid) : null), [user]);
  const profile = useDoc<UserDoc>(profileRef);
  const value = useMemo(() => ({ user, ready, profile: profile.data }), [user, ready, profile.data]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

const EMAIL_KEY = 'trailhead.signInEmail';
const NEXT_KEY = 'trailhead.afterSignIn';

/** Email a one-time sign-in link. `next` is where to go once signed in (for invite links). */
export async function emailSignInLink(email: string, next: string): Promise<void> {
  await sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}/signin/finish`,
    handleCodeInApp: true,
  });
  storage.set(EMAIL_KEY, email);
  storage.set(NEXT_KEY, next);
}

export function isSignInLink(href: string): boolean {
  return isSignInWithEmailLink(auth, href);
}

export function rememberedEmail(): string {
  return storage.get(EMAIL_KEY) ?? '';
}

/** Finish signing in from the emailed link. Returns where to go next. */
export async function finishSignIn(email: string, href: string): Promise<string> {
  await signInWithEmailLink(auth, email, href);
  const next = safeNext(storage.get(NEXT_KEY));
  storage.remove(EMAIL_KEY);
  storage.remove(NEXT_KEY);
  return next;
}

/** Sign in with a Google account in a popup window. */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

/** Signs out and removes the offline copy of troop data from this browser, so the next person on a shared
 * computer can't read it. The page reloads because the database can't be used after its cache is cleared. */
export async function signOutUser(): Promise<void> {
  await dropDeviceOnSignOut(); // while still signed in: this device stops getting this person's notifications
  clearBadge();
  await signOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // Another open tab can hold the cache; the privacy policy tells people to close it on shared computers.
  }
  window.location.assign('/');
}
