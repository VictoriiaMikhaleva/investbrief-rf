/**
 * Firebase init (CDN ES modules).
 * Exposes window.investBriefFirebase for classic scripts (storage.js, app.js, firebase-sync.js).
 * Deploy Firestore rules from ../firestore.rules in Firebase Console → Firestore → Rules.
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let analytics = null;
analyticsSupported().then(function (ok) {
  if (ok) analytics = getAnalytics(app);
}).catch(function () { /* analytics optional */ });

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
  serverTimestamp: serverTimestamp,
  signInWithPopup: signInWithPopup,
  signInWithEmailAndPassword: signInWithEmailAndPassword,
  createUserWithEmailAndPassword: createUserWithEmailAndPassword,
  signOut: signOut,
  onAuthStateChanged: onAuthStateChanged,
  currentUser: null
};

window.dispatchEvent(new CustomEvent('ibrf-firebase-ready'));
