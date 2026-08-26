import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as fbSignOut,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export const auth = getAuth(app);

// Enforce tab-isolated sessions
setPersistence(auth, browserSessionPersistence).catch((err) => {
  console.error('Session persistence failed:', err);
});

const ALLOWED_EMAILS = [
  'andesnow1604@gmail.com',
  'ceo@andes.co.in',
];

export function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signOut() {
  return fbSignOut(auth);
}

export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function isAllowedUser(user) {
  return user && ALLOWED_EMAILS.includes(user.email);
}

/* ---- collection refs ---- */
const b2bCol = collection(db, 'b2bBatches');
const b2cCol = collection(db, 'b2cOrders');

/* ---- queries (newest first) ---- */
const b2bQuery = query(b2bCol, orderBy('createdAt', 'desc'));
const b2cQuery = query(b2cCol, orderBy('createdAt', 'desc'));

/* ---- CRUD helpers ---- */

export async function addB2b(data) {
  const { id, ...rest } = data; // strip client-side id
  return addDoc(b2bCol, { ...rest, createdAt: serverTimestamp() });
}

export async function updateB2b(docId, data) {
  const { id, ...rest } = data;
  return updateDoc(doc(db, 'b2bBatches', docId), { ...rest, updatedAt: serverTimestamp() });
}

export async function removeB2b(docId) {
  return deleteDoc(doc(db, 'b2bBatches', docId));
}

export async function addB2c(data) {
  const { id, ...rest } = data;
  return addDoc(b2cCol, { ...rest, createdAt: serverTimestamp() });
}

export async function updateB2c(docId, data) {
  const { id, ...rest } = data;
  return updateDoc(doc(db, 'b2cOrders', docId), { ...rest, updatedAt: serverTimestamp() });
}

export async function removeB2c(docId) {
  return deleteDoc(doc(db, 'b2cOrders', docId));
}

/* ---- real-time listeners ---- */

export function subscribeB2b(callback) {
  return onSnapshot(b2bQuery, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  });
}

export function subscribeB2c(callback) {
  return onSnapshot(b2cQuery, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  });
}

/* ---- hostel names from b2b_partner ---- */

const b2bPartnerCol = collection(db, 'b2b_partner');

export function subscribeHostels(callback) {
  return onSnapshot(b2bPartnerCol, (snap) => {
    const names = [];
    snap.docs.forEach((d) => {
      const data = d.data();
      if (Array.isArray(data.hostels_name)) {
        data.hostels_name.forEach((name) => {
          if (name && !names.includes(name)) names.push(name);
        });
      }
    });
    callback(names);
  });
}
