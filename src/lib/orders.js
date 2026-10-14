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
    return { name, group, kg: 0, qty };
  });
}

/** Stable fingerprint of rider values; a change after verification means re-verify. */
export const linesSig = (lines) => lines.map((l) => `${l.name}|${round1(l.kg)}|${num(l.qty)}`).sort().join(';');

export const sumKg = (lines) => round1(lines.reduce((s, l) => s + num(l.kg), 0));
export const sumQty = (lines) => lines.reduce((s, l) => s + num(l.qty), 0);

export const isCancelledOrder = (o) => /cancel/i.test(String(o.status || ''));

/**
 * Joins a rider order with its manager verification doc.
 * status: pending | verified | changed (rider edited after verify) | cancelled
 */
export function buildB2cRow(order, verification, categories) {
  const rider = riderLines(order, categories);
  const v = verification || {};
  const sig = linesSig(rider);
  let status = v.status || 'pending';
  if (status === 'verified' && v.riderSig && v.riderSig !== sig) status = 'changed';
  const lines = Array.isArray(v.lines) && status !== 'changed' ? v.lines : rider;
  return {
    id: order.id,
    order,
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

/** Totals for live (non-cancelled) rows plus per-group breakdown. */
export function b2cTotals(rows) {
  const live = rows.filter((r) => r.status !== 'cancelled');
  const groups = Object.fromEntries(SERVICE_GROUPS.map((g) => [g.id, { orders: new Set(), kg: 0, clothes: 0, rows: [] }]));
  live.forEach((r) => r.lines.forEach((l) => {
    const g = groups[l.group] || groups.other;
    if (!g.orders.has(r.id)) { g.orders.add(r.id); g.rows.push(r); }
    g.kg += num(l.kg);
    g.clothes += num(l.qty);
  }));
  return {
    orders: live.length,
    kg: round1(live.reduce((s, r) => s + r.kg, 0)),
    clothes: live.reduce((s, r) => s + r.clothes, 0),
    verified: live.filter((r) => r.status === 'verified').length,
    groups: Object.fromEntries(Object.entries(groups).map(([id, g]) => [id, { orders: g.orders.size, kg: round1(g.kg), clothes: g.clothes, rows: g.rows }])),
  };
}

export function b2bTotals(entries) {
  const live = entries.filter((e) => e.status !== 'cancelled');
  return {
    entries: live.length,
    kg: round1(live.reduce((s, e) => s + num(e.kg), 0)),
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
