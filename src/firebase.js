import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  limit,
  where,
  Timestamp,
  runTransaction,
  arrayRemove,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as fbSignOut,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

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
export const storage = getStorage(app);

/** Upload a B2B order photo (challan/clothes) to Firebase Storage */
export async function uploadB2bPhoto(file, folder = 'manager_b2b_photos') {
  if (!file) throw new Error('No file provided for upload.');
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${folder}/${Date.now()}_${safeName}`;
  const fileRef = ref(storage, path);
  const snap = await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
  const url = await getDownloadURL(snap.ref);
  return { url, path };
}

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
// Must match the managerB2bEntries / managerVerifications rules in Firestore.
const MANAGER_EMAILS = [
  'manager@andes.co.in',
];

export function isAllowedUser(user) {
  return user && ALLOWED_EMAILS.includes(user.email);
}

export function isManagerUser(user) {
  return user && MANAGER_EMAILS.includes(user.email);
}

/* ---- archived hand-typed records (read-only, kept for history) ---- */

function subscribeArchive(name, callback, onError) {
  return onSnapshot(query(collection(db, name), orderBy('createdAt', 'desc')), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, onError);
}
export const subscribeB2bArchive = (cb, onError) => subscribeArchive('b2bBatches', cb, onError);
export const subscribeB2cArchive = (cb, onError) => subscribeArchive('b2cOrders', cb, onError);

/* ---- service categories (names only — no prices reach the manager site) ---- */

// { 'kurta/kurti': 'Dry Cleaning', ... } keyed by lower-case service name.
export async function fetchServiceCategories() {
  const snap = await getDocs(collection(db, 'prices'));
  const map = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    const name = String(data.serviceName || '').trim().toLowerCase();
    if (name) map[name] = data.category || '';
  });
  return map;
}

/** Full price catalog with rates, categories and units for client-side price calculation. */
export async function fetchPricesCatalog() {
  const snap = await getDocs(collection(db, 'prices'));
  const map = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    const name = String(data.serviceName || '').trim().toLowerCase();
    if (name) {
      map[name] = {
        name: data.serviceName,
        category: data.category || '',
        price: Number(data.price ?? data.rate ?? data.pricePerPiece ?? 0),
        pricePerKg: Number(data.pricePerKg ?? data.perKg ?? data.rate ?? data.price ?? 0),
        unit: data.unit || data.unitName || '',
      };
    }
  });
  return map;
}

/* ---- date helpers: day = 'YYYY-MM-DD' in India time ---- */

const dayStart = (day) => new Date(`${day}T00:00:00+05:30`);
const dayAfter = (day, n = 1) => new Date(dayStart(day).getTime() + n * 86400000);
const tsRange = (field, from, to) => [
  where(field, '>=', Timestamp.fromDate(dayStart(from))),
  where(field, '<', Timestamp.fromDate(dayAfter(to))),
];

const actor = () => auth.currentUser?.email || '';
const historyEntry = (action, reason = '', changes = []) => ({
  at: new Date().toISOString(), by: actor(), action, reason, changes,
});

/* ---- B2C: rider orders (`cartdetails`) ---- */

// Pickup day lives in different fields per app version (see pickupDay()), so
// load by createdAt — every order has it — looking back up to 60 days before
// the range to capture advance bookings and active delayed orders, with a 2-day buffer ahead of `to`.
export const PICKUP_LOOKBACK_DAYS = 60;

export function subscribeB2cOrders(from, to, callback, onError) {
  const q = query(collection(db, 'cartdetails'),
    where('createdAt', '>=', Timestamp.fromDate(dayAfter(from, -PICKUP_LOOKBACK_DAYS))),
    where('createdAt', '<', Timestamp.fromDate(dayAfter(to, 2))));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}

const verCol = collection(db, 'managerVerifications');

export function subscribeVerifications(from, to, callback, onError) {
  const lookbackDay = dayAfter(from, -PICKUP_LOOKBACK_DAYS).toISOString().slice(0, 10);
  const forwardDay = dayAfter(to, 14).toISOString().slice(0, 10);
  return onSnapshot(query(verCol, where('pickupDate', '>=', lookbackDay), where('pickupDate', '<=', forwardDay)), (snap) => {
    callback(Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])));
  }, onError);
}

/**
 * Verify / correct / cancel / restore a B2C order.
 * When editing weight/clothes, also updates `cartdetails` with the corrected
 * measurements and recalculated price so customer/rider apps reflect it and
 * server triggers recalculate the official breakdown.
 */
export async function saveB2cVerification(row, action, { lines, reason = '', changes = [], calculatedTotal = null } = {}) {
  const ref = doc(verCol, row.id);
  const cartRef = doc(db, 'cartdetails', row.id);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? snap.data() : {};
    if (cur.adminLockedAt) throw new Error('Admin has already counted this order. Ask Admin for an adjustment.');

    const status = action === 'cancel' ? 'cancelled' : action === 'restore' ? 'pending' : 'verified';
    const activeLines = lines || cur.lines || row.rider;
    const totalKg = Math.round(activeLines.reduce((s, l) => s + (Number(l.kg) || 0), 0) * 10) / 10;
    const totalClothes = activeLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

    const verPayload = {
      source: 'b2c',
      orderId: row.id,
      pickupDate: row.pickupDay,
      customer: row.customer,
      status,
      riderSig: row.riderSig,
      riderLines: row.rider,
      lines: activeLines,
      kg: totalKg,
      clothes: totalClothes,
      history: [...(cur.history || []), historyEntry(action, reason, changes)],
      updatedAt: serverTimestamp(),
      updatedBy: actor(),
      ...(status === 'verified' ? { verifiedAt: serverTimestamp(), verifiedBy: actor() } : {}),
    };

    if (calculatedTotal !== null && !isNaN(Number(calculatedTotal)) && Number(calculatedTotal) > 0) {
      verPayload.payment = {
        ...(cur.payment || {}),
        amount: Number(calculatedTotal),
        updatedAt: new Date().toISOString(),
        updatedBy: actor(),
      };
    }

    tx.set(ref, verPayload, { merge: true });

    // When manager edits weights or lines, also update cartdetails
    if (action === 'edit') {
      const cartSnap = await tx.get(cartRef);
      if (cartSnap.exists()) {
        const cartData = cartSnap.data();
        const existingPerKg = cartData.perKgDetails || {};
        const updatedPerKg = { ...existingPerKg };

        activeLines.forEach((l) => {
          if (l.group === 'wash_fold' || l.group === 'wash_iron') {
            updatedPerKg[l.name] = {
              ...(updatedPerKg[l.name] || {}),
              weight: Number(l.kg) || 0,
              count: Number(l.qty) || 0,
            };
          }
        });

        const cartPatch = {
          clothesWeightKg: totalKg,
          internalWeightKg: totalKg,
          riderRecordedWeightKg: totalKg,
          clothesCount: totalClothes,
          clothes: totalClothes,
          totalPieces: totalClothes,
          perKgDetails: updatedPerKg,
          weightUpdatedAt: serverTimestamp(),
          weightUpdatedBy: actor(),
          updatedAt: serverTimestamp(),
        };

        if (calculatedTotal !== null && !isNaN(Number(calculatedTotal)) && Number(calculatedTotal) > 0) {
          cartPatch.totalCost = Number(calculatedTotal);
          cartPatch.totalAmount = Number(calculatedTotal);
        }

        tx.update(cartRef, cartPatch);
      }
    }
  });
}

/**
 * Manager updates payment status, method, and amount on a B2C order.
 * Updates `cartdetails` and records audit history in `managerVerifications`.
 */
export async function updateB2cPayment(orderId, { status, method, amount, notes = '' }) {
  const isPaid = status === 'paid';
  const cartRef = doc(db, 'cartdetails', orderId);
  const verRef = doc(verCol, orderId);

  await runTransaction(db, async (tx) => {
    const cartSnap = await tx.get(cartRef);
    if (!cartSnap.exists()) {
      throw new Error(`Order ${orderId} does not exist in cartdetails.`);
    }
    const verSnap = await tx.get(verRef);
    const verCur = verSnap.exists() ? verSnap.data() : {};

    const cartPatch = {
      paymentStatus: isPaid ? 'completed' : status,
      paymentMethod: method,
      paymentMethodOnDelivery: method,
      paymentDoneOnDelivery: isPaid,
      paymentUpdatedAt: serverTimestamp(),
      paymentUpdatedBy: actor(),
    };
    if (amount !== undefined && !isNaN(Number(amount))) {
      cartPatch.totalCost = Number(amount);
      cartPatch.totalAmount = Number(amount);
    }
    tx.update(cartRef, cartPatch);

    tx.set(verRef, {
      ...verCur,
      source: 'b2c',
      orderId,
      payment: {
        status,
        method,
        amount: Number(amount) || 0,
        notes: notes.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: actor(),
      },
      history: [
        ...(verCur.history || []),
        historyEntry('update_payment', notes.trim() || `Payment updated to ${status} (${method})`),
      ],
      updatedAt: serverTimestamp(),
      updatedBy: actor(),
    }, { merge: true });
  });
}

/* ---- B2B: manager-entered batches (`managerB2bEntries`) ---- */

const b2bEntryCol = collection(db, 'managerB2bEntries');
const slug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

export function subscribeB2bEntries(from, to, callback, onError) {
  return onSnapshot(query(b2bEntryCol, where('date', '>=', from), where('date', '<=', to)), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => b.date.localeCompare(a.date) || a.client.localeCompare(b.client) || String(a.batchNo).localeCompare(String(b.batchNo))));
  }, onError);
}

/** Creates an entry. Id = date + client + batch, so the same batch can't be entered twice. */
export async function addB2bEntry(entry) {
  const id = `${entry.date}__${slug(entry.client)}__${slug(entry.batchNo || '1')}`;
  const ref = doc(b2bEntryCol, id);
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) {
      throw new Error(`${entry.client} batch ${entry.batchNo || '1'} is already entered for this date.`);
    }
    tx.set(ref, {
      ...entry,
      source: 'b2b',
      status: 'pending',
      history: [historyEntry('create')],
      createdAt: serverTimestamp(),
      createdBy: actor(),
      updatedAt: serverTimestamp(),
    });
  });
}

/** action: 'verify' | 'edit' | 'cancel' | 'restore'. `patch` only for edits. */
export async function updateB2bEntry(id, action, { patch = {}, reason = '', changes = [] } = {}) {
  const ref = doc(b2bEntryCol, id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This entry no longer exists.');
    const cur = snap.data();
    if (cur.adminLockedAt) throw new Error('Admin has already counted this entry. Ask Admin for an adjustment.');
    if (cur.status === 'verified' && action === 'cancel') {
      throw new Error('This B2B entry is already verified and cannot be cancelled. Ask Admin if cancellation is needed.');
    }
    const status = action === 'cancel' ? 'cancelled' : action === 'verify' ? 'verified' : 'pending';
    tx.update(ref, {
      ...patch,
      status,
      history: [...(cur.history || []), historyEntry(action, reason, changes)],
      updatedAt: serverTimestamp(),
      updatedBy: actor(),
      ...(status === 'verified' ? { verifiedAt: serverTimestamp(), verifiedBy: actor() } : {}),
    });
  });
}

/** Permanently deletes a B2B entry. */
export async function deleteB2bEntry(id) {
  const ref = doc(b2bEntryCol, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const cur = snap.data();
  if (cur.adminLockedAt) {
    throw new Error('Admin has already counted this entry. Ask Admin for an adjustment.');
  }
  await deleteDoc(ref);
}

/* ---- store-app B2B orders for the same day (reference only, never totalled) ---- */

export async function fetchStoreB2bReference(from, to) {
  const snap = await getDocs(query(collection(db, 'hostels_orders'), ...tsRange('createdAt', from, to)));
  const byClient = {};
  snap.docs.forEach((d) => {
    const o = d.data();
    const name = String(o.hostelName || o.hostel || o.location?.hostel || 'Unknown').trim();
    const r = byClient[name] || (byClient[name] = { client: name, orders: 0, clothes: 0, kg: 0 });
    r.orders += 1;
    r.clothes += Number(o.clothesCount) || 0;
    r.kg += Number(o.clothesWeightKg ?? o.weight) || 0;
  });
  return Object.values(byClient).sort((a, b) => a.client.localeCompare(b.client));
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

export async function deleteInventoryLog(date) {
  return deleteDoc(doc(db, 'inventoryLogs', date));
}

export async function clearAllInventoryLogs() {
  const snap = await getDocs(inventoryCol);
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}


/* ---- jute bags: one doc per physical bag in `jute_bags`, id = bag id ---- */

const BAG_IN_USE = ['assigned', 'at_store', 'out_for_delivery'];

export const bagInUse = (bag) => BAG_IN_USE.includes(String(bag.status || '').toLowerCase().trim());

export function subscribeJuteBags(callback, onError) {
    return onSnapshot(collection(db, 'jute_bags'), (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, onError);
}

function bagHistory(tx, bagId, event, orderId = null) {
    tx.set(doc(collection(db, 'bag_assignment_history')), {
        bag_id: bagId,
        order_id: orderId,
        event,
        stage: 'manager',
        reason: 'manager_dashboard',
        actor_id: auth.currentUser?.uid || '',
        actor_app: 'manager_dashboard',
        timestamp: serverTimestamp(),
    });
}

/** Creates a new, unassigned bag. Fails if the id already exists. */
export async function addJuteBag(rawId) {
    const bagId = String(rawId || '').trim().replace(/\//g, '');
    if (!bagId) throw new Error('Enter a bag ID.');
    const ref = doc(db, 'jute_bags', bagId);
    await runTransaction(db, async (tx) => {
        if ((await tx.get(ref)).exists()) throw new Error(`Bag "${bagId}" already exists.`);
        tx.set(ref, {
            bag_id: bagId,
            status: 'unassigned',
            current_order_id: null,
            current_customer_name: null,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
        });
        bagHistory(tx, bagId, 'created');
    });
    return bagId;
}

/** Frees a bag and removes it from the order it was on (same as a rider release). */
export async function unassignJuteBag(bagId) {
    const ref = doc(db, 'jute_bags', bagId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error(`Bag "${bagId}" no longer exists.`);
        const orderId = snap.data().current_order_id || null;
        const orders = [];
        if (orderId) {
            for (const c of ['cartdetails', 'hostels_orders']) {
                const oRef = doc(db, c, orderId);
                const oSnap = await tx.get(oRef);
                if (oSnap.exists()) orders.push([oRef, oSnap.data()]);
            }
        }
        for (const [oRef, data] of orders) {
            const patch = { juteBagIds: arrayRemove(bagId), deliveryJuteBagIds: arrayRemove(bagId) };
            if (Array.isArray(data.bags)) patch.bags = data.bags.filter((b) => String(b?.bagId ?? '') !== bagId);
            tx.update(oRef, patch);
        }
        tx.update(ref, {
            status: 'unassigned',
            current_order_id: null,
            current_customer_name: null,
            current_service: null,
            updated_at: serverTimestamp(),
        });
        bagHistory(tx, bagId, 'unassigned', orderId);
    });
}

/** Deletes a bag. Only unassigned bags can be deleted. */
export async function deleteJuteBag(bagId) {
    const ref = doc(db, 'jute_bags', bagId);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        if (bagInUse(snap.data())) throw new Error(`Bag "${bagId}" is in use. Unassign it first.`);
        tx.delete(ref);
        bagHistory(tx, bagId, 'deleted');
    });
}

/* ---- Manager Issues: Operations issue tracking for B2B and B2C ---- */

const managerIssuesCol = collection(db, 'manager_issues');

/** Subscribe to live updates of manager issues */
export function subscribeManagerIssues(callback, onError) {
  const q = query(managerIssuesCol, limit(300));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAtDate: data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : new Date()),
      };
    }).sort((a, b) => b.createdAtDate - a.createdAtDate);
    callback(list);
  }, onError);
}

/** Add a new manager issue (B2B or B2C) */
export async function addManagerIssue(issue) {
  const id = `issue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const ref = doc(managerIssuesCol, id);
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const issueDoc = {
    ...issue,
    id,
    date: issue.date || dateStr,
    status: issue.status || 'pending', // 'pending' | 'checking' | 'resolved'
    severity: issue.severity || 'normal', // 'normal' | 'high' | 'critical'
    scope: issue.scope || 'b2c', // 'b2b' | 'b2c'
    reportedBy: actor(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, issueDoc);
  return id;
}

/** Update an existing manager issue */
export async function updateManagerIssue(id, patch = {}) {
  const ref = doc(managerIssuesCol, id);
  await setDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
    lastUpdatedBy: actor(),
  }, { merge: true });
}

/** Upload issue proof photo to Firebase Storage */
export async function uploadIssuePhoto(file) {
  return uploadB2bPhoto(file, 'manager_issue_photos');
}
