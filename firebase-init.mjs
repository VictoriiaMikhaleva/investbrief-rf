/**
 * Firebase init (CDN ES modules) — production: https://victoriiamikhaleva.github.io/investbrief-rf/
 * Authorized domain in Firebase Console: victoriiamikhaleva.github.io
 * Exposes window.investBriefFirebase for classic scripts.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import { getAnalytics, isSupported as analyticsSupported } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDjNbwf65MbmUjSmaynXEquSdatg2vIVLE',
  authDomain: 'investor-brief-rf.firebaseapp.com',
  projectId: 'investor-brief-rf',
  storageBucket: 'investor-brief-rf.firebasestorage.app',
  messagingSenderId: '321401712156',
  appId: '1:321401712156:web:91a388ff9875085af8b9d9',
  measurementId: 'G-PPEY527KWM'
};

try {
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
  console.warn('Firebase init failed', err);
  window.investBriefFirebase = { ready: false, error: err };
  window.dispatchEvent(new CustomEvent('ibrf-firebase-error', { detail: err }));
}
