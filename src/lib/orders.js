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

export const HOSTEL_99_MONTHLY_REVENUE = 28000;

export const ONE8_RATE_MAP = {
  'Yellow Wiping Cloth': 9,
  'White Wiping Cloth': 9,
  'Wiping Cloth': 9,
  'White Chef Coat': 13,
  'Black Chef Coat': 13,
  'Chef Coat': 13,
  'Beanie Chef Cap': 5,
  'Cap': 5,
  'T-Shirt': 13,
  'Pant': 13,
  'Apron': 9,
  'Napkin': 6,
  'Blazer': 200,
};

export const ONE8_ITEM_WEIGHTS = {
  'Yellow Wiping Cloth': 0.11,
  'White Wiping Cloth': 0.135,
  'Wiping Cloth': 0.11,
  'White Chef Coat': 0.32,
  'Black Chef Coat': 0.5,
  'Chef Coat': 0.32,
  'Beanie Chef Cap': 0.05,
  'Cap': 0.05,
  'T-Shirt': 0.2,
  'Pant': 0.4,
  'Apron': 0.15,
  'Napkin': 0.05,
  'Blazer': 0.8,
};

export const ZOLO_RATE_MAP = {
  'Towel': 12,
  'Bath towel': 12,
  'Bath Towel': 12,
  'Single Bedsheet': 13,
  'Single Bed Sheet': 13,
  'Double Bedsheet': 15,
  'Double Bed Sheet': 15,
  'Pillow Cover': 10,
  'Single Duvet Cover': 30,
  'Double Duvet Cover': 35,
  'King Duvet Cover': 35,
  'Duvet Cover': 35,
  'Blanket': 110,
  'Curtain': 75,
  'Door mat': 49,
};

export const ITEM_RATE_MAP = {
  'Single Bedsheet': 30,
  'Double Bedsheet': 45,
  'Duvet Cover': 30,
  'Pillow Cover': 10,
  'Bath towel': 20,
  'Blanket': 110,
  'Curtain': 75,
  'Door mat': 49,
  ...ONE8_RATE_MAP,
  ...ZOLO_RATE_MAP,
};

export const LINEN_ITEM_WEIGHTS = {
  'Single Bedsheet': 0.47,
  'Single Bed Sheet': 0.47,
  'Double Bedsheet': 0.87,
  'Double Bed Sheet': 0.87,
  'Single Duvet Cover': 0.92,
  'Duvet Cover Single': 0.92,
  'Double Duvet Cover': 1.5,
  'Duvet Cover Double': 1.5,
  'King Duvet Cover': 1.5,
  'Duvet Cover': 1.5,
  'Pillow Cover': 0.175,
  'Towel': 0.72,
  'Bath towel': 0.72,
  'Bath Towel': 0.72,
};

export function calculateBatchWeight(items) {
  if (!Array.isArray(items) || !items.length) return 0;
  let totalWeight = 0;
  for (const it of items) {
    const qty = num(it.qty ?? it.quantity);
    if (qty <= 0) continue;
    const rawName = String(it.name || '').trim();
    const nameLower = rawName.toLowerCase();
    let unitWeight = 0;

    if (ONE8_ITEM_WEIGHTS[rawName] !== undefined) {
      unitWeight = ONE8_ITEM_WEIGHTS[rawName];
    } else if (LINEN_ITEM_WEIGHTS[rawName] !== undefined) {
      unitWeight = LINEN_ITEM_WEIGHTS[rawName];
    } else if (nameLower.includes('yellow') && (nameLower.includes('wiping') || nameLower.includes('cloth'))) {
      unitWeight = 0.11;
    } else if (nameLower.includes('white') && (nameLower.includes('wiping') || nameLower.includes('cloth'))) {
      unitWeight = 0.135;
    } else if (nameLower.includes('wiping') || (nameLower.includes('cloth') && !nameLower.includes('table'))) {
      unitWeight = 0.11;
    } else if (nameLower.includes('white') && nameLower.includes('chef')) {
      unitWeight = 0.32;
    } else if (nameLower.includes('black') && nameLower.includes('chef')) {
      unitWeight = 0.5;
    } else if (nameLower.includes('chef') || nameLower.includes('coat')) {
      unitWeight = 0.32;
    } else if (nameLower.includes('beanie') || nameLower.includes('cap')) {
      unitWeight = 0.05;
    } else if (nameLower.includes('apron')) {
      unitWeight = 0.15;
    } else if (nameLower.includes('napkin')) {
      unitWeight = 0.05;
    } else if (nameLower.includes('pant') || nameLower.includes('trouser')) {
      unitWeight = 0.4;
    } else if (nameLower.includes('t-shirt') || nameLower.includes('tshirt')) {
      unitWeight = 0.2;
    } else if (nameLower.includes('blazer')) {
      unitWeight = 0.8;
    } else if (nameLower.includes('pillow')) {
      unitWeight = 0.175;
    } else if (nameLower.includes('towel')) {
      unitWeight = 0.72;
    } else if (nameLower.includes('single duvet') || nameLower.includes('duvet cover single')) {
      unitWeight = 0.92;
    } else if (nameLower.includes('double duvet') || nameLower.includes('king duvet') || nameLower.includes('duvet cover')) {
      unitWeight = 1.5;
    } else if (nameLower.includes('single bedsheet') || nameLower.includes('single bed sheet')) {
      unitWeight = 0.47;
    } else if (nameLower.includes('double bedsheet') || nameLower.includes('double bed sheet')) {
      unitWeight = 0.87;
    }

    totalWeight += qty * unitWeight;
  }
  return round1(totalWeight);
}

export function isHostel99Client(clientName) {
  const c = String(clientName || '').trim().toLowerCase();
  return c.includes('hostel 99') || c.includes('hostel99') || c.startsWith('99');
}

export function getDaysInMonth(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }
  const dStr = dateStr.split('T')[0];
  const parts = dStr.split(/[-/]/);
  if (parts.length >= 2) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
      return new Date(year, month, 0).getDate();
    }
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export function calculateB2bBatchRevenue(entry, countOnDate = 1) {
  const clientLower = String(entry.client || '').toLowerCase();

  // Hostel 99 orders have a combined fixed monthly revenue of ₹28,000 across all properties.
  // For each order daily, divide 28,000 by (number of days in month * count of batches on that day).
  if (isHostel99Client(clientLower)) {
    const daysInMonth = getDaysInMonth(entry.date);
    const dailyTotal = HOSTEL_99_MONTHLY_REVENUE / daysInMonth;
    const safeCount = Math.max(1, countOnDate || 1);
    return parseFloat((dailyTotal / safeCount).toFixed(2));
  }

  const isOne8 = clientLower.includes('one 8') || clientLower.includes('one8');
  const isZolo = clientLower.includes('zolo');

  let total = 0;
  let hasItemRevenue = false;

  const items = entry.items || entry.itemsList;
  if (Array.isArray(items) && items.length > 0) {
    items.forEach((it) => {
      const qty = Number(it.qty ?? it.quantity) || 0;
      if (qty <= 0) return;
      const nameLower = String(it.name || '').trim().toLowerCase();
      let rate = 0;
      if (isOne8) {
        rate = ONE8_RATE_MAP[it.name] ||
          (nameLower.includes('wiping') ? 9 :
           nameLower.includes('chef') ? 13 :
           nameLower.includes('t-shirt') || nameLower.includes('tshirt') ? 13 :
           nameLower.includes('pant') || nameLower.includes('trouser') ? 13 :
           nameLower.includes('apron') ? 9 :
           nameLower.includes('napkin') ? 6 :
           nameLower.includes('blazer') ? 200 :
           nameLower.includes('cap') ? 5 : 0);
      } else if (isZolo) {
        rate = ZOLO_RATE_MAP[it.name] ||
          (nameLower.includes('pillow') ? 10 :
           nameLower.includes('towel') ? 12 :
           nameLower.includes('single bedsheet') || nameLower.includes('single bed sheet') ? 13 :
           nameLower.includes('double bedsheet') || nameLower.includes('double bed sheet') ? 15 :
           nameLower.includes('single duvet') ? 30 :
           nameLower.includes('double duvet') || nameLower.includes('king duvet') ? 35 :
           (ITEM_RATE_MAP[it.name] || 0));
      } else {
        rate = ITEM_RATE_MAP[it.name] ||
          (nameLower.includes('bedsheet') ? 30 :
           nameLower.includes('towel') ? 20 :
           nameLower.includes('blanket') ? 110 :
           nameLower.includes('cover') ? 25 : 15);
      }

      if (rate > 0) {
        total += qty * rate;
        hasItemRevenue = true;
      }
    });
  }

  if (!hasItemRevenue && Number(entry.calculatedRevenue) > 0) {
    return Number(entry.calculatedRevenue);
  }

  const weight = Number(entry.kg ?? entry.weight) || 0;
  if (!hasItemRevenue && weight > 0) {
    const kgRate = 35;
    total = weight * kgRate;
  }

  return Math.round(total);
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

  const totalRevenue = Math.round(
    live.reduce((s, r) => s + (r.payment?.amount || num(r.order?.totalCost ?? r.order?.payableAmount ?? r.order?.totalAmount ?? r.order?.amount ?? 0)), 0)
  );

  return {
    orders: live.length,
    delayed: delayed.length,
    kg: round1(live.reduce((s, r) => s + r.kg, 0)),
    clothes: live.reduce((s, r) => s + r.clothes, 0),
    verified: live.filter((r) => r.status === 'verified').length,
    totalRevenue,
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

  // Group Hostel 99 batches by date
  const h99CountsByDate = {};
  live.forEach((e) => {
    if (isHostel99Client(e.client)) {
      const d = e.date || 'unknown';
      h99CountsByDate[d] = (h99CountsByDate[d] || 0) + 1;
    }
  });

  let nonH99Revenue = 0;
  const h99Dates = new Set();
  live.forEach((e) => {
    if (isHostel99Client(e.client)) {
      if (e.date) h99Dates.add(e.date);
    } else {
      nonH99Revenue += calculateB2bBatchRevenue(e);
    }
  });

  // Calculate Hostel 99 contract share
  const hostel99Revenue = Array.from(h99Dates).reduce((sum, d) => sum + (HOSTEL_99_MONTHLY_REVENUE / getDaysInMonth(d)), 0);
  const totalRevenue = Math.round(nonH99Revenue + hostel99Revenue);

  return {
    entries: live.length,
    kg: round1(totalKg),
    clothes: live.reduce((s, e) => s + num(e.clothes), 0),
    verified: live.filter((e) => e.status === 'verified').length,
    totalRevenue,
    hostel99Revenue: Math.round(hostel99Revenue),
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
