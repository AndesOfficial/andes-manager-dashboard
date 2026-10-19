// Pure helpers for turning rider orders (`cartdetails`) and manager entries
// into the quantities the dashboard shows. No prices or amounts on purpose:
// revenue lives only in the Admin site.

export const SERVICE_GROUPS = [
  { id: 'wash_iron', label: 'Wash & Iron', byKg: true },
  { id: 'wash_fold', label: 'Wash & Fold', byKg: true },
  { id: 'dry_clean', label: 'Dry Cleaning', byKg: false },
  { id: 'iron', label: 'Only Iron', byKg: false },
  { id: 'other', label: 'Other (shoes, household…)', byKg: false },
];

export const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const round1 = (n) => Math.round(num(n) * 10) / 10;

const META_KEYS = new Set([
  'piece', 'pieces', 'price', 'total', 'note', 'quantity', 'unit', 'unitName',
  'rate', 'pricePerKg', 'perKg', 'addedAt', 'updatedAt', 'service', 'serviceName', 'name',
]);

const qtyOf = (val) => (typeof val === 'number'
  ? val || 1
  : val && typeof val === 'object' ? num(val.qty ?? val.quantity ?? 1) || 1 : 1);

// "Iron_Saree Ironing_regular" -> "Saree Ironing"
function cleanName(key) {
  let k = String(key).trim();
  if (k.toLowerCase().endsWith('_piece')) k = k.slice(0, -6);
  if (k.startsWith('Iron_')) {
    const last = k.lastIndexOf('_');
    if (last > 4) k = k.slice(5, last) || 'Iron';
  }
  return k.replace(/_(regular|instant)$/i, '').trim();
}

// Same formats the server's normalizeServices() accepts.
function parseServices(raw) {
  const out = [];
  if (!raw) return out;
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const svc = String(item.service ?? item.serviceName ?? item.name ?? '').trim();
      if (svc) { out.push({ key: svc, qty: num(item.quantity ?? item.pieces ?? item.piece ?? 1) || 1 }); return; }
      Object.entries(item).forEach(([k, v]) => { if (!META_KEYS.has(k)) out.push({ key: k, qty: qtyOf(v) }); });
    });
  } else if (typeof raw === 'object') {
    Object.entries(raw).forEach(([k, v]) => out.push({ key: k, qty: qtyOf(v) }));
  }
  return out;
}

function washGroup(name) {
  const n = name.toLowerCase().replace(/_/g, ' ').replace(/\s+and\s+/g, ' & ')
    .replace(/\s*\((general|regular)\)\s*$/, '').replace(/\s+/g, ' ').trim();
  if (n === 'wash & fold' || n === 'wash fold') return 'wash_fold';
  if (n === 'wash & iron' || n === 'wash iron') return 'wash_iron';
  return null;
}

/** Service group for a line name; `categories` maps lower-case price name -> price category. */
export function groupOf(rawKey, categories = {}) {
  const wash = washGroup(cleanName(rawKey));
  if (wash) return wash;
  const name = cleanName(rawKey).toLowerCase();
  const cat = String(categories[name] || '').toLowerCase();
  if (cat.includes('dry') || name.includes('dry clean')) return 'dry_clean';
  if (String(rawKey).startsWith('Iron_') || cat.includes('iron') || /\b(iron|ironing|press)\b/.test(name)) return 'iron';
  return 'other';
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** 'YYYY-MM-DD' of a Date in India time. */
export const istDay = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);

const toDate = (v) => {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' || /^\d{10,}$/.test(String(v).trim())) {
    const n = Number(v);
    return new Date(n < 10000000000 ? n * 1000 : n);
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) return new Date(parsed);
  }
  return null;
};

/**
 * Pickup day of a rider order. The apps store it in several shapes:
 * scheduledPickupDate (Timestamp/Date/String), pickupDate ('YYYY-MM-DD' or 'DD/MM/YYYY'),
 * pickupTime (Timestamp, ISO string, or text like "Tue, 14 Oct · 6:00 PM - 10:00 PM"),
 * date / orderDate, or createdAt / orderTimestamp / updatedAt fallback.
 */
export function pickupDay(o) {
  if (!o) return '';
  // 1. scheduledPickupDate (e.g. advance bookings)
  const sched = toDate(o.scheduledPickupDate);
  if (sched) return istDay(sched);
  if (typeof o.scheduledPickupDate === 'string') {
    const trimmed = o.scheduledPickupDate.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // 2. pickupDate
  if (o.pickupDate) {
    const pd = String(o.pickupDate).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(pd)) return pd.slice(0, 10);
    const dmy = pd.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const d = toDate(o.pickupDate);
    if (d) return istDay(d);
  }

  // 3. pickupTime
  const pt = o.pickupTime;
  const ptDate = toDate(pt);
  if (ptDate) return istDay(ptDate);
  if (typeof pt === 'string') {
    const trimmed = pt.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const m = trimmed.match(/\b(\d{1,2})\s+([A-Za-z]{3})/);
    const created = toDate(o.createdAt) || toDate(o.orderTimestamp) || toDate(o.updatedAt);
    if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
      let year = created ? created.getFullYear() : new Date().getFullYear();
      const month = MONTHS[m[2].toLowerCase()];
      if (created && month < created.getMonth() - 6) year += 1;
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    }
  }

  // 4. date or orderDate
  if (o.date || o.orderDate) {
    const rawD = o.date || o.orderDate;
    if (typeof rawD === 'string') {
      const trimmed = rawD.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
      const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    const d = toDate(rawD);
    if (d) return istDay(d);
  }

  // 5. fallback: createdAt, orderTimestamp, or updatedAt
  const created = toDate(o.createdAt) || toDate(o.orderTimestamp) || toDate(o.updatedAt);
  if (created) return istDay(created);

  return '';
}

/** Expected drop/delivery day of a rider order in 'YYYY-MM-DD' IST format. */
export function getDropDay(o) {
  if (!o) return '';
  // 1. Explicit dropDate
  if (o.dropDate) {
    const dd = String(o.dropDate).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(dd)) return dd.slice(0, 10);
    const dmy = dd.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const d = toDate(o.dropDate);
    if (d) return istDay(d);
  }

  // 2. dropTime / deliveryTime / dropSlot
  const dt = o.dropTime || o.deliveryTime || o.dropSlot;
  const dtDate = toDate(dt);
  if (dtDate) return istDay(dtDate);
  if (typeof dt === 'string') {
    const trimmed = dt.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    const m = trimmed.match(/\b(\d{1,2})\s+([A-Za-z]{3})/);
    const created = toDate(o.createdAt) || toDate(o.orderTimestamp) || toDate(o.updatedAt);
    if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
      let year = created ? created.getFullYear() : new Date().getFullYear();
      const month = MONTHS[m[2].toLowerCase()];
      if (created && month < created.getMonth() - 6) year += 1;
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    }
  }

  return '';
}

/** Rider-recorded order weight, newest field first. */
/** Assumed average weights (in kg) for bedsheets and per-piece items. Easily editable. */
export const ITEM_AVERAGE_WEIGHTS = {
  'single bedsheet': 0.47,
  'single bed sheet': 0.47,
  'double bedsheet': 0.87,
  'double bed sheet': 0.87,
  'bedsheet': 0.47,
  'duvet cover single': 0.92,
  'single duvet cover': 0.92,
  'duvet cover double': 1.5,
  'double duvet cover': 1.5,
  'duvet cover': 1.0,
  'pillow cover': 0.175,
  'pillow': 0.5,
  'bath towel': 0.72,
  'towel': 0.72,
  'hand towel': 0.15,
  'face towel': 0.1,
  'bath mat': 0.3,
  'blanket': 1.8,
  'quilt': 2.0,
  'curtain': 1.0,
  'door mat': 0.4,
  'shirt': 0.25,
  't-shirt': 0.2,
  'pant': 0.45,
  'trousers': 0.45,
  'jeans': 0.6,
  'kurta': 0.3,
  'saree': 0.45,
  'suit': 1.0,
  'blazer': 0.8,
  'coat': 0.8,
  'jacket': 0.7,
  'chef coat': 0.4,
  'apron': 0.2,
  'wiping cloth': 0.05,
  'napkin': 0.05,
  'cap': 0.1,
};

export function getEstimatedItemWeight(name) {
  if (!name) return 0;
  const n = String(name).toLowerCase().trim();
  if (ITEM_AVERAGE_WEIGHTS[n] !== undefined) return ITEM_AVERAGE_WEIGHTS[n];
  for (const [key, wt] of Object.entries(ITEM_AVERAGE_WEIGHTS)) {
    if (n.includes(key)) return wt;
  }
  return 0;
}

/** 5 standard order / lead types: other, whatsapp, user app, walk in, website */
export const LEAD_SOURCE_TYPES = [
  { id: 'all', label: 'All Leads' },
  { id: 'user_app', label: 'User App' },
  { id: 'website', label: 'Website' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'walk_in', label: 'Walk In' },
  { id: 'other', label: 'Other' },
];

export function getOrderLeadSource(order) {
  if (!order) return 'other';
  // 1. Explicit leadSource / orderSource / source field (set by Rider app or system)
  const raw = String(order.leadSource || order.orderSource || order.source || '').toLowerCase().trim();
  if (raw === 'whatsapp') return 'whatsapp';
  if (raw === 'walk in' || raw === 'walk_in' || raw === 'walkin') return 'walk_in';
  if (raw === 'website' || raw === 'web') return 'website';
  if (raw === 'user app' || raw === 'user_app' || raw === 'app') return 'user_app';
  if (raw === 'other') return 'other';

  // 2. Detection from order location / selectionSource
  const locSource = String(order.location?.selectionSource || '').toLowerCase();
  if (locSource === 'website' || order.selectionSource === 'website') return 'website';

  // 3. User app orders vs rider-created orders without leadSource
  if (order.riderId && !order.paymentMethod && !order.paymentData) {
    return 'other';
  }

  return 'user_app';
}

/** Rider-recorded order weight, newest field first. */
const orderWeight = (o) => num(o.riderRecordedWeightKg ?? o.clothesWeightKg ?? o.internalWeightKg ?? o.weightKg ?? o.weight);

/** Lines as the rider recorded them: [{ name, group, kg, qty }]. */
export function riderLines(order, categories) {
  const details = order.perKgDetails || {};
  const parsed = parseServices(order.services);
  const kgCount = parsed.filter((s) => washGroup(cleanName(s.key))).length;
  return parsed.map(({ key, qty }) => {
    const name = cleanName(key);
    const group = groupOf(key, categories);
    if (group === 'wash_fold' || group === 'wash_iron') {
      const d = details[key] || details[name] || Object.entries(details)
        .find(([k]) => washGroup(k) === group)?.[1] || {};
      // A single kg service with no own weight uses the order weight.
      const kg = num(d.weight) || (kgCount === 1 ? orderWeight(order) : 0);
      const clothes = num(d.count) || (kgCount === 1 ? num(order.clothesCount) : 0);
      return { name, group, kg: round1(kg), qty: clothes };
    }
    // Per-piece items (bedsheets, blankets, towels, dry clean, iron):
    // Add estimated average weight into total kgs processed
    const avgWt = getEstimatedItemWeight(name);
    const estKg = avgWt > 0 ? round1(qty * avgWt) : 0;
    return { name, group, kg: estKg, qty };
  });
}

/** Stable fingerprint of rider values; a change after verification means re-verify. */
export const linesSig = (lines) => lines.map((l) => `${l.name}|${round1(l.kg)}|${num(l.qty)}`).sort().join(';');

export const sumKg = (lines) => round1(lines.reduce((s, l) => s + num(l.kg), 0));
export const sumQty = (lines) => lines.reduce((s, l) => s + num(l.qty), 0);

export const isCancelledOrder = (o) => /cancel/i.test(String(o.status || ''));

export const DELIVERED_STATUSES = new Set([
  'completed',
  'delivered',
  'delivered_at_next_door',
  'cancelled',
  'canceled',
  'archived',
]);

export function isOrderDelivered(status) {
  const s = String(status || '').toLowerCase().trim();
  return DELIVERED_STATUSES.has(s);
}

/**
 * Calculates how many days an active order is delayed past its scheduled date.
 * Returns 0 if already delivered/completed or not yet overdue.
 */
export function getOrderDelay(order, referenceDay = istDay(new Date())) {
  if (!order || isOrderDelivered(order.status)) return 0;

  const drop = getDropDay(order);
  const pickup = pickupDay(order);
  const targetDay = drop || pickup;
  if (!targetDay) return 0;

  if (targetDay >= referenceDay) return 0;

  const targetMs = new Date(`${targetDay}T12:00:00+05:30`).getTime();
  const refMs = new Date(`${referenceDay}T12:00:00+05:30`).getTime();
  const diffDays = Math.round((refMs - targetMs) / 86400000);
  return diffDays > 0 ? diffDays : 0;
}

/** Normalizes payment info from cartdetails + manager overrides */
export function getPaymentInfo(order, verification) {
  const vPay = verification?.payment;

  const rawStatus = String(vPay?.status || order?.paymentStatus || (order?.paymentDoneOnDelivery ? 'completed' : '') || 'pending').toLowerCase().trim();
  const rawMethod = String(vPay?.method || order?.paymentMethodOnDelivery || order?.paymentMethod || order?.payment_method || 'cod').toLowerCase().trim();
  const amount = num(vPay?.amount !== undefined ? vPay.amount : (order?.totalCost !== undefined ? order.totalCost : order?.totalAmount));

  const isPaid = rawStatus === 'paid' || rawStatus === 'completed' || rawStatus === 'success' || rawStatus === 'captured' || order?.paymentDoneOnDelivery === true;
  const status = isPaid ? 'paid' : (rawStatus === 'failed' ? 'failed' : 'unpaid');

  let methodLabel = 'Cash on Delivery';
  if (rawMethod === 'upi') methodLabel = 'UPI';
  else if (rawMethod.includes('online') || rawMethod.includes('razorpay')) methodLabel = 'Online';
  else if (rawMethod.includes('card')) methodLabel = 'Card';
  else if (rawMethod.includes('wallet')) methodLabel = 'Wallet';
  else if (rawMethod === 'cod' || rawMethod.includes('cash')) methodLabel = 'Cash (COD)';
  else if (rawMethod) methodLabel = rawMethod.toUpperCase();

  return {
    status, // 'paid' | 'unpaid' | 'failed'
    rawStatus,
    method: rawMethod,
    methodLabel,
    amount,
    isPaid,
    notes: vPay?.notes || '',
    updatedAt: vPay?.updatedAt || order?.paymentUpdatedAt || order?.paymentRecordedAt || null,
    updatedBy: vPay?.updatedBy || order?.paymentUpdatedBy || order?.paymentRecordedBy || null,
  };
}

/**
 * Joins a rider order with its manager verification doc.
 * status: pending | verified | changed (rider edited after verify) | cancelled
 */
export function buildB2cRow(order, verification, categories, referenceDay = istDay(new Date())) {
  const rider = riderLines(order, categories);
  const v = verification || {};
  const sig = linesSig(rider);
  let status = v.status || (isCancelledOrder(order) ? 'cancelled' : 'pending');
  if (status === 'verified' && v.riderSig && v.riderSig !== sig) status = 'changed';
  const lines = Array.isArray(v.lines) && status !== 'changed' ? v.lines : rider;
  const leadSource = getOrderLeadSource(order);
  const pickup = pickupDay(order);
  const drop = getDropDay(order);
  const delayedDays = getOrderDelay(order, referenceDay);
  const isDelayed = delayedDays > 0;
  const isDelivered = isOrderDelivered(order.status);
  const payment = getPaymentInfo(order, verification);

  return {
    id: order.id,
    order,
    globalOrderNumber: order.globalOrderNumber || null,
    leadSource,
    pickupDay: pickup,
    dropDay: drop,
    pickupSlot: order.pickupSlot || (typeof order.pickupTime === 'string' ? order.pickupTime : null),
    dropSlot: order.dropSlot || (typeof order.dropTime === 'string' ? order.dropTime : typeof order.deliveryTime === 'string' ? order.deliveryTime : null),
    createdAt: order.createdAt || null,
    delayedDays,
    isDelayed,
    isDelivered,
    payment,
    customer: String(order.customerName || order.userName || order.name || 'Customer').trim(),
    phone: String(order.userMobile || order.customerNumber || order.phoneNumber || ''),
    orderStatus: String(order.status || ''),
    rider,
    riderSig: sig,
    lines,
    corrected: Array.isArray(v.lines) && linesSig(v.lines) !== sig,
    status,
    verification: verification || null,
    locked: !!v.adminLockedAt,
    kg: sumKg(lines),
    clothes: sumQty(lines),
  };
}

/**
 * Calculates updated B2C price when weights or quantities are edited.
 * Uses order breakdown rates, order.services rates, order.ratePerKg, or prices catalog.
 */
export function calculateB2cPrice(order, lines, pricesCatalog = {}) {
  if (!order) return { subtotal: 0, total: 0, perKgRate: 79, items: [] };

  // 1. Determine rate per kg for wash lines
  let perKgRate = num(order.ratePerKg);
  if (!perKgRate && order.breakdown?.perKg?.items?.length) {
    perKgRate = num(order.breakdown.perKg.items[0]?.rate);
  }
  if (!perKgRate && Array.isArray(order.services)) {
    for (const s of order.services) {
      if (typeof s === 'object' && s) {
        const r = num(s.pricePerKg ?? s.rate ?? s.price);
        const name = String(s.service ?? s.serviceName ?? s.name ?? '').toLowerCase();
        const unit = String(s.unit ?? s.unitName ?? '').toLowerCase();
        if (r > 0 && (unit.includes('kg') || name.includes('wash'))) {
          perKgRate = r;
          break;
        }
      }
    }
  }
  if (!perKgRate) {
    const wf = pricesCatalog['wash & fold'] || pricesCatalog['wash and fold'] || pricesCatalog['wash_fold'];
    if (wf) perKgRate = num(wf.pricePerKg ?? wf.rate ?? wf.price);
  }
  if (!perKgRate) perKgRate = 79; // standard default rate

  let perKgSubtotal = 0;
  let perPieceSubtotal = 0;
  const items = [];

  for (const l of lines) {
    const isKg = l.group === 'wash_fold' || l.group === 'wash_iron';
    if (isKg) {
      const wt = round1(l.kg);
      let rate = perKgRate;
      const bItem = order.breakdown?.perKg?.items?.find((it) => cleanName(it.name).toLowerCase() === cleanName(l.name).toLowerCase());
      if (bItem && num(bItem.rate) > 0) rate = num(bItem.rate);
      const lineAmt = Math.round(wt * rate);
      perKgSubtotal += lineAmt;
      items.push({ name: l.name, group: l.group, isKg: true, rate, weight: wt, qty: num(l.qty), amount: lineAmt });
    } else {
      const qty = num(l.qty);
      let pieceRate = 0;
      const bItem = order.breakdown?.perPiece?.items?.find((it) => cleanName(it.name).toLowerCase() === cleanName(l.name).toLowerCase());
      if (bItem && num(bItem.rate) > 0) {
        pieceRate = num(bItem.rate);
      } else if (Array.isArray(order.services)) {
        const s = order.services.find((it) => typeof it === 'object' && it && cleanName(it.service ?? it.serviceName ?? it.name).toLowerCase() === cleanName(l.name).toLowerCase());
        if (s) pieceRate = num(s.price ?? s.rate);
      }
      if (!pieceRate) {
        const pDoc = pricesCatalog[cleanName(l.name).toLowerCase()] || pricesCatalog[String(l.name).toLowerCase()];
        if (pDoc) pieceRate = num(pDoc.price ?? pDoc.rate ?? pDoc.pricePerPiece);
      }
      const lineAmt = Math.round(qty * pieceRate);
      perPieceSubtotal += lineAmt;
      items.push({ name: l.name, group: l.group, isKg: false, rate: pieceRate, qty, amount: lineAmt });
    }
  }

  const subtotal = perKgSubtotal + perPieceSubtotal;
  const deliveryCharge = num(order.deliveryCharge);
  const convenienceFee = num(order.convenienceFee);
  const couponDiscount = num(order.couponDiscount ?? order.coupon_discount);
  const promotionDiscount = num(order.promotionDiscount ?? order.promoDiscount);
  const walletAmountUsed = num(order.walletAmountUsed);

  const total = Math.max(0, Math.round(subtotal + deliveryCharge + convenienceFee - couponDiscount - promotionDiscount - walletAmountUsed));

  return {
    subtotal,
    total,
    perKgRate,
    perKgSubtotal,
    perPieceSubtotal,
    deliveryCharge,
    convenienceFee,
    discounts: couponDiscount + promotionDiscount + walletAmountUsed,
    items,
  };
}

/** Totals for live (non-cancelled) rows plus per-group breakdown. */
export function b2cTotals(rows) {
  const live = rows.filter((r) => r.status !== 'cancelled');
  const delayed = rows.filter((r) => r.isDelayed);
  const groups = Object.fromEntries(SERVICE_GROUPS.map((g) => [g.id, { orders: new Set(), kg: 0, clothes: 0, rows: [] }]));
  live.forEach((r) => r.lines.forEach((l) => {
    const g = groups[l.group] || groups.other;
    if (!g.orders.has(r.id)) { g.orders.add(r.id); g.rows.push(r); }
    g.kg += num(l.kg);
    g.clothes += num(l.qty);
  }));
  return {
    orders: live.length,
    delayed: delayed.length,
    kg: round1(live.reduce((s, r) => s + r.kg, 0)),
    clothes: live.reduce((s, r) => s + r.clothes, 0),
    verified: live.filter((r) => r.status === 'verified').length,
    groups: Object.fromEntries(Object.entries(groups).map(([id, g]) => [id, { orders: g.orders.size, kg: round1(g.kg), clothes: g.clothes, rows: g.rows }])),
  };
}

export function b2bTotals(entries) {
  const live = entries.filter((e) => e.status !== 'cancelled');
  const totalKg = live.reduce((s, e) => {
    const directKg = num(e.kg);
    if (directKg > 0) return s + directKg;
    // Fall back to estimated item weights if kg was not entered directly
    const itemKg = (e.items || []).reduce((is, it) => is + (num(it.qty) * getEstimatedItemWeight(it.name)), 0);
    return s + itemKg;
  }, 0);
  return {
    entries: live.length,
    kg: round1(totalKg),
    clothes: live.reduce((s, e) => s + num(e.clothes), 0),
    verified: live.filter((e) => e.status === 'verified').length,
  };
}

/** Field-level diff for the correction history. */
export function diffLines(before, after) {
  const key = (l) => l.name;
  const b = new Map(before.map((l) => [key(l), l]));
  const changes = [];
  after.forEach((l) => {
    const old = b.get(key(l)) || { kg: 0, qty: 0 };
    if (round1(old.kg) !== round1(l.kg)) changes.push({ field: `${l.name} kg`, from: round1(old.kg), to: round1(l.kg) });
    if (num(old.qty) !== num(l.qty)) changes.push({ field: `${l.name} clothes`, from: num(old.qty), to: num(l.qty) });
  });
  return changes;
}
