import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  setLogLevel,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Suppress benign internal transport retry logs
try {
  setLogLevel('silent');
} catch {
  try {
    setLogLevel('error');
  } catch {}
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const rawDbId = firebaseConfig.firestoreDatabaseId;
const isDefaultOrEmpty = !rawDbId || rawDbId === '(default)' || rawDbId === 'default';

let db: ReturnType<typeof getFirestore>;

try {
  db = isDefaultOrEmpty
    ? initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      })
    : initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        rawDbId
      );
} catch {
  db = isDefaultOrEmpty ? getFirestore(app) : getFirestore(app, rawDbId);
}

const auth = getAuth(app);

export { app, db, auth };


