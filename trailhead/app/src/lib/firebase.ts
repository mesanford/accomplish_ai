import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

// Local development talks to the Firebase emulators (demo project, no real credentials).
export const usingEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS !== 'false';

const config = usingEmulators
  ? {
      apiKey: 'demo-key',
      authDomain: 'localhost',
      projectId: 'demo-trailhead',
      appId: 'demo-app',
      storageBucket: 'demo-trailhead.appspot.com',
    }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    };

export const app = initializeApp(config);
export const auth = getAuth(app);
// The local cache keeps recent data readable without a signal, such as at camp.
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
export const functions = getFunctions(app, 'us-central1');
// Troop website images: leaders upload drafts; the server publishes copies.
export const storage = getStorage(app);

if (usingEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
