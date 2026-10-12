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
  getDocs,
  getDoc,
  setDoc,
  limit,
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

// Shared manager login (temporary until each manager has their own account).
// Must match the b2bBatches / b2cOrders rules in Firestore.
const MANAGER_EMAILS = [
  'manager@andes.co.in',
];

export function isAllowedUser(user) {
  return user && ALLOWED_EMAILS.includes(user.email);
}

export function isManagerUser(user) {
  return user && MANAGER_EMAILS.includes(user.email);
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

export function subscribeB2b(callback, onError) {
  return onSnapshot(b2bQuery, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  }, onError);
}

export function subscribeB2c(callback, onError) {
  return onSnapshot(b2cQuery, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  }, onError);
}

/* ---- live price list (same `prices` collection the customer app uses) ---- */

// Returns [{ id, name, category, unit: 'kg' | 'piece' | 'pair', rate }] for every
// priced item, sorted by category then name.
export async function fetchPriceItems() {
  const snap = await getDocs(collection(db, 'prices'));
  const items = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    const name = (data.serviceName || '').trim();
    if (!name || data.status === 'archived') return;
    const category = data.category || '';
    const kg = Number(data.rateByKg);
    const piece = Number(data.rateByPiece) || Number(data.rateByPair);
    // The admin-set unit decides; rate fields only for docs without one.
    const unit = ['kg', 'piece', 'pair'].includes(data.unit) ? data.unit : (kg > 0 ? 'kg' : 'piece');
    const rate = unit === 'kg' ? kg : unit === 'pair' ? (Number(data.rateByPair) || piece) : piece;
    if (rate > 0) items.push({ id: d.id, name, category, unit, rate });
    // Household sub-services ("Bed Sheet Single (Wash)") are per piece.
    (Array.isArray(data.subServices) ? data.subServices : []).forEach((sub, i) => {
      const subName = String(sub?.name || sub?.serviceName || '').trim();
      const subRate = Number(sub?.rateByPiece);
      if (!subName || sub?.status === 'archived' || !(subRate > 0)) return;
      items.push({ id: `${d.id}_${i}`, name: `${name} (${subName})`, category, unit: 'piece', rate: subRate });
    });
  });
  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return items;
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

/* ---- daily inventory log: one doc per day, id = YYYY-MM-DD ---- */

const inventoryCol = collection(db, 'inventoryLogs');

export function subscribeInventoryLogs(callback, onError) {
  const q = query(inventoryCol, orderBy('date', 'desc'), limit(60));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function getInventoryLog(date) {
  const snap = await getDoc(doc(db, 'inventoryLogs', date));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveInventoryLog(date, data) {
  const { id, createdAt, updatedAt, ...rest } = data;
  return setDoc(doc(db, 'inventoryLogs', date), {
    ...rest,
    date,
    createdAt: createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser?.email || '',
  }, { merge: true });
}
