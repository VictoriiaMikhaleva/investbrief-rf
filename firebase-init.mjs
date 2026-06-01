/**
 * Firebase init (CDN ES modules) — production: https://victoriiamikhaleva.github.io/investbrief-rf/
 * Authorized domain in Firebase Console: victoriiamikhaleva.github.io, localhost
 * Exposes window.investBriefFirebase for classic scripts.
 */
const FIREBASE_VERSION = '11.6.0';
const CDN_BASES = [
  'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION,
  'https://cdn.jsdelivr.net/npm/firebase@' + FIREBASE_VERSION
];

const firebaseConfig = {
  apiKey: 'AIzaSyDjNbwf65MbmUjSmaynXEquSdatg2vIVLE',
  authDomain: 'investor-brief-rf.firebaseapp.com',
  projectId: 'investor-brief-rf',
  storageBucket: 'investor-brief-rf.firebasestorage.app',
  messagingSenderId: '321401712156',
  appId: '1:321401712156:web:91a388ff9875085af8b9d9',
  measurementId: 'G-PPEY527KWM'
};

window.investBriefFirebase = { ready: false, loading: true };

function failInit(err) {
  console.warn('Firebase init failed', err);
  window.investBriefFirebase = { ready: false, loading: false, error: err };
  window.dispatchEvent(new CustomEvent('ibrf-firebase-error', { detail: err }));
}

async function importFirebaseFromBase(base) {
  const appMod = await import(base + '/firebase-app.js');
  const authMod = await import(base + '/firebase-auth.js');
  const firestoreMod = await import(base + '/firebase-firestore.js');
  const analyticsMod = await import(base + '/firebase-analytics.js');
  return { appMod, authMod, firestoreMod, analyticsMod, base };
}

async function loadFirebaseModules() {
  let lastErr = null;
  for (let i = 0; i < CDN_BASES.length; i++) {
    try {
      return await importFirebaseFromBase(CDN_BASES[i]);
    } catch (err) {
      lastErr = err;
      console.warn('[ibrf] Firebase CDN failed:', CDN_BASES[i], err);
    }
  }
  throw lastErr || new Error('Firebase SDK недоступен');
}

(async function initInvestBriefFirebase() {
  if (location.protocol === 'file:') {
    failInit(Object.assign(new Error('file-protocol'), {
      userMessage:
        'Синхронизация не работает при открытии HTML с диска. Запустите npm start и откройте http://localhost:8787'
    }));
    return;
  }

  try {
    const { appMod, authMod, firestoreMod, analyticsMod, base } = await loadFirebaseModules();
    const { initializeApp } = appMod;
    const { getAnalytics, isSupported: analyticsSupported } = analyticsMod;
    const {
      getAuth,
      GoogleAuthProvider,
      signInWithPopup,
      signInWithEmailAndPassword,
      createUserWithEmailAndPassword,
      signOut,
      onAuthStateChanged
    } = authMod;
    const { getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp } = firestoreMod;

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    auth.languageCode = 'ru';
    const db = getFirestore(app);
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });

    let analytics = null;
    analyticsSupported().then(function (ok) {
      if (ok) analytics = getAnalytics(app);
    }).catch(function () { /* optional */ });

    window.investBriefFirebase = {
      ready: true,
      loading: false,
      cdnBase: base,
      app: app,
      analytics: analytics,
      auth: auth,
      db: db,
      googleProvider: googleProvider,
      doc: doc,
      getDoc: getDoc,
      setDoc: setDoc,
      onSnapshot: onSnapshot,
      serverTimestamp: serverTimestamp,
      signInWithPopup: signInWithPopup,
      signInWithEmailAndPassword: signInWithEmailAndPassword,
      createUserWithEmailAndPassword: createUserWithEmailAndPassword,
      signOut: signOut,
      onAuthStateChanged: onAuthStateChanged,
      currentUser: null
    };

    window.dispatchEvent(new CustomEvent('ibrf-firebase-ready'));
  } catch (err) {
    failInit(Object.assign(err instanceof Error ? err : new Error(String(err)), {
      userMessage:
        'Не удалось загрузить Firebase. Проверьте интернет и доступ к gstatic.com / googleapis.com (иногда блокируется провайдером).'
    }));
  }
})();
