import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Loader2, CreditCard, AlertTriangle, Pencil, CheckCircle2, X,
  Copy, Check, Phone, Calendar, Clock, Sparkles, Bike
} from 'lucide-react';
import { saveB2cVerification, updateB2cPayment, fetchPricesCatalog } from '../../firebase';
import { SERVICE_GROUPS, diffLines, num, round1, LEAD_SOURCE_TYPES, calculateB2cPrice } from '../../lib/orders';
import {
  fmtKg, fmtDay, EmptyState, Sheet, StatusBadge, RowActions, ReasonSheet, HistoryList,
  STATUS_FILTERS, matchesFilter,
} from './shared';

const groupLabel = Object.fromEntries(SERVICE_GROUPS.map((g) => [g.id, g.label]));
const isKgLine = (l) => l.group === 'wash_fold' || l.group === 'wash_iron';

function EditPaymentSheet({ row, onClose }) {
  const [status, setStatus] = useState(row.payment?.status === 'paid' ? 'paid' : 'unpaid');
  const [method, setMethod] = useState(row.payment?.method || 'cod');
  const [amount, setAmount] = useState(row.payment?.amount ?? 0);
  const [notes, setNotes] = useState(row.payment?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateB2cPayment(row.id, {
        status,
        method,
        amount: Number(amount) || 0,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to update payment.');
      setSaving(false);
    }
  };

  const METHODS = [
    { id: 'cod', label: 'Cash on Delivery (COD)' },
    { id: 'upi', label: 'UPI (GPay / PhonePe / Paytm)' },
    { id: 'online', label: 'Online / App Payment' },
    { id: 'card', label: 'Credit / Debit Card' },
    { id: 'wallet', label: 'Wallet' },
  ];

  return (
    <Sheet title={`Edit Payment — ${row.customer}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <div className="ops-muted">Order ID: #{row.id.slice(-6).toUpperCase()} · Current Status: {row.orderStatus || '—'}</div>
        </div>

        <div className="form-row">
          <label className="form-label">Payment Status</label>
          <div className="toggle-seg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <button
              type="button"
              className={status === 'paid' ? 'on-yes' : ''}
              onClick={() => setStatus('paid')}
            >
              <CheckCircle2 size={15} /> Paid
            </button>
            <button
              type="button"
              className={status === 'unpaid' ? 'on-no' : ''}
              onClick={() => setStatus('unpaid')}
            >
              <X size={15} /> Unpaid / Pending
            </button>
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">Payment Method</label>
          <select
            className="form-input"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHODS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label">Total Amount (₹)</label>
          <input
            className="form-input"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Notes (optional)</label>
          <input
            className="form-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Paid cash at store counter / Verified via GPay"
          />
        </div>

        {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="btn-primary" type="submit" disabled={saving} style={{ width: '100%' }}>
          {saving ? <Loader2 size={16} className="spin" /> : null} Save Payment Details
        </button>
      </form>
    </Sheet>
  );
}

function EditSheet({ row, onClose, pricesCatalog = {}, onSaved }) {
  const [lines, setLines] = useState(() => {
    if (Array.isArray(row.lines) && row.lines.length > 0) {
      return row.lines.map((l) => ({ ...l }));
    }
    const initialKg = Number(row.kg) || Number(row.order?.clothesWeightKg) || Number(row.order?.riderRecordedWeightKg) || 0;
    const initialQty = Number(row.clothes) || Number(row.order?.clothesCount) || 1;
    return [{ name: row.order?.service || 'Wash & Fold', group: 'wash_fold', kg: initialKg, qty: initialQty }];
  });
  const [customTotal, setCustomTotal] = useState('');
  const [reason, setReason] = useState('Re-weighed at store counter');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (i, field, value) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [field]: value } : l)));

  // Live recalculate price based on edited lines
  const priceInfo = useMemo(() => {
    return calculateB2cPrice(row.order, lines, pricesCatalog);
  }, [row.order, lines, pricesCatalog]);

  const finalPrice = customTotal !== '' && !isNaN(Number(customTotal)) ? Number(customTotal) : priceInfo.total;

  const totalKg = Math.round(lines.reduce((s, l) => s + (Number(l.kg) || 0), 0) * 100) / 100;
  const totalClothes = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    const clean = lines.map((l) => ({ ...l, kg: Math.round((Number(l.kg) || 0) * 100) / 100, qty: num(l.qty) }));
    const changes = diffLines(row.lines || [], clean);
    setSaving(true);
    try {
      await saveB2cVerification(row, 'edit', {
        lines: clean,
        reason: reason.trim() || 'Re-weighed and verified at store counter',
        changes,
        calculatedTotal: finalPrice,
      });
      if (onSaved) onSaved(row.id);
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <Sheet title={`Edit ${row.customer}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="ops-hint">
          Updating weight and clothes will automatically recalculate the order bill and update it across all dashboards.
        </p>

        {/* Total Summary Strip */}
        <div className="b2c-metrics-grid" style={{ marginBottom: 14, background: '#f8fafc', padding: 10, borderRadius: 10 }}>
          <div className="b2c-metric-cell">
            <span className="b2c-metric-val">{totalKg > 0 ? fmtKg(totalKg) : '0 kg'}</span>
            <span className="b2c-metric-lbl">Total Weight</span>
          </div>
          <div className="b2c-metric-cell">
            <span className="b2c-metric-val">{totalClothes} pcs</span>
            <span className="b2c-metric-lbl">Total Clothes</span>
          </div>
          <div className="b2c-metric-cell">
            <span className="b2c-metric-val b2c-price-highlight">₹{finalPrice}</span>
            <span className="b2c-metric-lbl">New Price</span>
          </div>
        </div>

        {lines.map((l, i) => (
          <div className="form-row two-col" key={i}>
            <div>
              <label className="form-label">{l.name} <span className="ops-muted">({groupLabel[l.group] || l.group})</span></label>
              <input className="form-input" type="number" step="any" min="0" inputMode="decimal"
                value={l.kg} onChange={(e) => set(i, 'kg', e.target.value)} placeholder="Weight in KG" />
            </div>
            <div>
              <label className="form-label">Clothes Count (pcs)</label>
              <input className="form-input" type="number" min="0" inputMode="numeric"
                value={l.qty} onChange={(e) => set(i, 'qty', e.target.value)} placeholder="Clothes qty" />
            </div>
          </div>
        ))}

        <button
          type="button"
          className="chip"
          style={{ marginBottom: 14 }}
          onClick={() => setLines([...lines, { name: 'Extra items', group: 'wash_fold', kg: '', qty: 1 }])}
        >
          + Add another service line
        </button>

        {/* Live calculated price box */}
        <div className="b2c-price-calc-box">
          <div className="b2c-price-calc-row">
            <span>Rate Applied:</span>
            <strong>₹{priceInfo.perKgRate}/kg (Wash)</strong>
          </div>
          <div className="b2c-price-calc-row">
            <span>Items Subtotal:</span>
            <span>₹{priceInfo.subtotal}</span>
          </div>
          {priceInfo.campaignDiscount > 0 && (
            <div className="b2c-price-calc-row" style={{ color: '#c2410c' }}>
              <span>{priceInfo.campaignLabel} (free units, already ₹0 above):</span>
              <span>₹{priceInfo.campaignDiscount}</span>
            </div>
          )}
          {(priceInfo.deliveryCharge > 0 || priceInfo.convenienceFee > 0) && (
            <div className="b2c-price-calc-row">
              <span>Delivery & Fees:</span>
              <span>+₹{priceInfo.deliveryCharge + priceInfo.convenienceFee}</span>
            </div>
          )}
          {priceInfo.discounts > 0 && (
            <div className="b2c-price-calc-row" style={{ color: '#047857' }}>
              <span>Discounts Applied:</span>
              <span>-₹{priceInfo.discounts}</span>
            </div>
          )}
          <div className="b2c-price-calc-total">
            <span>Calculated Total:</span>
            <span style={{ fontSize: 17, color: '#047857' }}>
              ₹{priceInfo.total} <span style={{ fontSize: 12, fontWeight: 400, color: '#64748b' }}>(was ₹{row.payment.amount})</span>
            </span>
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">Custom Price Override <span className="ops-muted">(Optional — leave blank to use calculated ₹{priceInfo.total})</span></label>
          <input
            className="form-input"
            type="number"
            min="0"
            step="1"
            value={customTotal}
            onChange={(e) => setCustomTotal(e.target.value)}
            placeholder={`Auto: ₹${priceInfo.total}`}
          />
        </div>

        <div className="form-row">
          <label className="form-label">Reason for correction</label>
          <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Re-weighed at store counter" />
        </div>

        {error && <div className="form-error">{error}</div>}

        <button className="btn-primary" type="submit" disabled={saving} style={{ width: '100%', marginTop: 8 }}>
          {saving ? <Loader2 size={16} className="spin" /> : null} Save Changes & Update Bill (₹{finalPrice})
        </button>
      </form>
    </Sheet>
  );
}

function RewashStrip({ rewash }) {
  return (
    <div className="b2c-rewash-strip">
      <strong>Free rewash</strong>
      {rewash.reason ? <span> · {rewash.reason}</span> : <span className="ops-muted"> · details recorded at pickup</span>}
      {rewash.garments != null && <span> · {rewash.garments} garments</span>}
      {rewash.note && <div className="ops-muted">{rewash.note}</div>}
      {rewash.photos.length > 0 && (
        <div className="b2c-rewash-photos">
          {rewash.photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              <img src={url} alt="Rewash issue" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderRow({ row, highlight, isJustEdited, onEdit, onCancel, onEditPayment }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (action) => {
    setBusy(true);
    try { await saveB2cVerification(row, action, { lines: row.lines }); } catch (err) { alert(err.message); }
    setBusy(false);
  };

  const orderNumber = row.globalOrderNumber ? `#${row.globalOrderNumber}` : `#${row.id.slice(-6).toUpperCase()}`;

  const copyId = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(row.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`card b2c-card ops-row ops-st-${row.status} ${row.isDelayed ? 'ops-row-delayed' : ''} ${highlight ? 'ops-row-hl' : ''}`} id={`b2c-${row.id}`}>
      
      {/* 1. Header Zone: Order ID, Status Badge, Just-Edited Flag */}
      <div className="b2c-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="b2c-id-pill" onClick={copyId} title="Click to copy full Order ID">
            {orderNumber}
            {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} style={{ opacity: 0.6 }} />}
          </button>
          {row.orderStatus && (
            <span className="b2c-order-status-badge">
              {row.orderStatus}
            </span>
          )}
          {row.rewash?.isRewash && (
            <span className="badge badge-rewash">
              REWASH{row.rewash.parent ? ` · of #${row.rewash.parent}` : ''}
            </span>
          )}
          {row.removedServices.length > 0 && (
            <span className="badge badge-amber" title="Booked but not handed over; removed by the rider and left out of the bill">
              Removed: {row.removedServices.join(', ')}
            </span>
          )}
          {row.rewash?.requestedFor && (
            <span className="badge badge-rewash-outline" title={`Rewash order ${row.rewash.requestedFor}`}>
              Rewash requested
            </span>
          )}
          {isJustEdited && (
            <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Sparkles size={11} /> Saved & Verified
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {row.isDelayed && (
            <span className="badge badge-delayed" title={`Active order not delivered yet. Scheduled: ${fmtDay(row.dropDay || row.pickupDay)}`}>
              <AlertTriangle size={12} /> Delayed by {row.delayedDays} {row.delayedDays === 1 ? 'day' : 'days'}
            </span>
          )}
          <StatusBadge status={row.status} locked={row.locked} />
        </div>
      </div>

      {/* 2. Customer & Contact Info */}
      <div className="b2c-customer-row">
        <div>
          <span className="b2c-cust-name">{row.customer}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {row.phone && (
            <a href={`tel:${row.phone}`} className="b2c-cust-phone" title="Call customer">
              <Phone size={12} /> {row.phone}
            </a>
          )}
          {row.leadSource && (
            <span className={`badge ${
              row.leadSource === 'whatsapp' ? 'badge-green' :
              row.leadSource === 'website' ? 'badge-blue' :
              row.leadSource === 'user_app' ? 'badge-purple' :
              row.leadSource === 'walk_in' ? 'badge-amber' : 'badge-gray'
            }`}>
              {row.leadSource === 'user_app' ? 'User App' :
               row.leadSource === 'walk_in' ? 'Walk In' :
               row.leadSource === 'whatsapp' ? 'WhatsApp' :
               row.leadSource === 'website' ? 'Website' : 'Other'}
            </span>
          )}
        </div>
      </div>

      {/* 3. Schedule & Slots */}
      <div className="b2c-schedule-strip">
        <span className="b2c-schedule-item">
          <Calendar size={12} style={{ color: '#2563eb' }} />
          <span>Pickup: <strong>{fmtDay(row.pickupDay)}</strong></span>
          {typeof row.pickupSlot === 'string' && row.pickupSlot && <span className="ops-muted">({row.pickupSlot})</span>}
        </span>
        <span className="b2c-schedule-item">
          <Clock size={12} style={{ color: '#059669' }} />
          <span>Drop: <strong>{row.dropDay ? fmtDay(row.dropDay) : 'Standard'}</strong></span>
          {typeof row.dropSlot === 'string' && row.dropSlot && <span className="ops-muted">({row.dropSlot})</span>}
        </span>
        <span className="b2c-schedule-item" title="Rider who picked up this order">
          <Bike size={13} style={{ color: '#7c3aed' }} />
          <span>Rider: <strong style={{ color: '#1e293b' }}>{typeof row.pickupRider === 'string' ? row.pickupRider : typeof row.riderName === 'string' ? row.riderName : 'Not assigned'}</strong></span>
          {typeof row.riderPhone === 'string' && row.riderPhone && (
            <a href={`tel:${row.riderPhone}`} style={{ color: '#2563eb', marginLeft: 4 }} title={`Call rider (${row.riderPhone})`}>
              📞
            </a>
          )}
        </span>
      </div>

      {row.rewash?.isRewash && <RewashStrip rewash={row.rewash} />}

      {/* 4. Key Metrics Grid: Total Weight, Total Clothes, Total Amount */}
      <div className="b2c-metrics-grid">
        <div className="b2c-metric-cell">
          <span className="b2c-metric-val">{row.kg > 0 ? fmtKg(row.kg) : '—'}</span>
          <span className="b2c-metric-lbl">Total Weight</span>
        </div>
        <div className="b2c-metric-cell">
          <span className="b2c-metric-val">{row.clothes} pcs</span>
          <span className="b2c-metric-lbl">Clothes Count</span>
        </div>
        <div className="b2c-metric-cell">
          <span className="b2c-metric-val b2c-price-highlight">₹{row.payment.amount}</span>
          <span className="b2c-metric-lbl">Order Amount</span>
        </div>
      </div>

      {/* 5. Services Line Items Breakdown */}
      <table className="ops-lines" style={{ margin: '4px 0' }}>
        <tbody>
          {row.lines.map((l) => {
            const r = row.rider.find((x) => x.name === l.name);
            const edited = row.corrected && r && (Math.round(num(r.kg) * 100) !== Math.round(num(l.kg) * 100) || num(r.qty) !== num(l.qty));
            return (
              <tr key={l.name}>
                <td>
                  <strong>{l.name}</strong>
                  <span className="ops-muted"> · {groupLabel[l.group] || l.group}</span>
                </td>
                <td className="ops-num">
                  {isKgLine(l) && <span style={{ fontWeight: 700 }}>{fmtKg(l.kg)} · </span>}
                  <span>{l.qty} pcs</span>
                  {edited && (
                    <div className="ops-was">
                      rider: {isKgLine(r) && `${fmtKg(r.kg)} · `}{r.qty} pcs
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 6. Payment Status and Edit Action */}
      <div className="ops-payment-wrap">
        <div className="ops-payment-info">
          <span className={`badge ${
            row.payment.status === 'paid' ? 'badge-green' :
            row.payment.status === 'failed' ? 'badge-red' : 'badge-amber'
          }`}>
            <CreditCard size={12} style={{ marginRight: 3, verticalAlign: -1 }} />
            {row.payment.status === 'paid' ? 'Paid' : row.payment.status === 'failed' ? 'Failed' : 'Unpaid'} · {row.payment.methodLabel}
          </span>
          {row.payment.notes && <span className="ops-muted" title={row.payment.notes}>({row.payment.notes})</span>}
        </div>
        <button
          type="button"
          className="btn-payment-edit"
          onClick={() => onEditPayment(row)}
          title="Edit payment status, method, or amount"
        >
          <Pencil size={12} />
          <span>Edit Payment</span>
        </button>
      </div>

      {/* 7. Footer Action Buttons */}
      <RowActions
        status={row.status}
        locked={row.locked}
        busy={busy}
        onVerify={() => run('verify')}
        onRestore={() => run('restore')}
        onEdit={() => onEdit(row)}
        onCancel={() => onCancel(row)}
      />

      <HistoryList history={row.verification?.history} />
    </div>
  );
}

export default function B2CTab({ rows, focusId, range }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [lastEditedId, setLastEditedId] = useState(null);
  const [pricesCatalog, setPricesCatalog] = useState({});

  useEffect(() => {
    fetchPricesCatalog().then(setPricesCatalog).catch((err) => console.error('fetchPricesCatalog error:', err));
  }, []);

  useEffect(() => {
    if (!focusId) return;
    setFilter('all');
    setLeadFilter('all');
    requestAnimationFrame(() => document.getElementById(`b2c-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [focusId]);

  const counts = useMemo(() => {
    return Object.fromEntries(
      STATUS_FILTERS.map((f) => [f.id, rows.filter((r) => matchesFilter(r, f.id, lastEditedId)).length])
    );
  }, [rows, lastEditedId]);

  const delayedCount = useMemo(() => rows.filter((r) => r.isDelayed && !matchesFilter(r, 'cancelled')).length, [rows]);

  const leadCounts = useMemo(() => {
    const relevantRows = filter === 'cancelled'
      ? rows.filter((r) => matchesFilter(r, 'cancelled'))
      : rows.filter((r) => !matchesFilter(r, 'cancelled'));
    const c = { all: relevantRows.length };
    LEAD_SOURCE_TYPES.forEach((l) => { if (l.id !== 'all') c[l.id] = 0; });
    relevantRows.forEach((r) => {
      const src = r.leadSource || 'other';
      c[src] = (c[src] || 0) + 1;
    });
    return c;
  }, [rows, filter]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!matchesFilter(r, filter, lastEditedId)) return false;

      // Filter by date range:
      // If user is explicitly viewing 'delayed', show delayed orders.
      // Otherwise, only show orders belonging to the selected date range OR if it was just edited.
      // This stops past delayed orders from 22 Oct of last year from dominating today's view!
      if (filter !== 'delayed' && range?.from && range?.to) {
        const inRange = (r.pickupDay >= range.from && r.pickupDay <= range.to) ||
                        (r.dropDay && r.dropDay >= range.from && r.dropDay <= range.to);
        if (!inRange && r.id !== lastEditedId) return false;
      }

      if (
        q &&
        !String(r.customer || '').toLowerCase().includes(q) &&
        !String(r.phone || '').includes(q) &&
        !String(r.id || '').toLowerCase().includes(q) &&
        !(typeof r.pickupRider === 'string' && r.pickupRider.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [rows, search, filter, leadFilter, range, lastEditedId]);

  // Keep the open sheets on live rows.
  const liveEditing = editing && rows.find((r) => r.id === editing.id);
  const liveEditingPayment = editingPayment && rows.find((r) => r.id === editingPayment.id);

  return (
    <div>
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input className="search-input" placeholder="Search name, phone, order ID, or rider" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {delayedCount > 0 && (
        <div className="delayed-banner">
          <div>
            <div className="delayed-banner-title">
              <AlertTriangle size={18} />
              <span>{delayedCount} Active Order{delayedCount === 1 ? '' : 's'} Delayed</span>
            </div>
            <div className="delayed-banner-sub">
              These orders from earlier dates have not been delivered yet.
            </div>
          </div>
          <button
            type="button"
            className={`chip ${filter === 'delayed' ? 'chip-active' : ''}`}
            onClick={() => setFilter(filter === 'delayed' ? 'all' : 'delayed')}
            style={{ background: '#fff', color: '#b91c1c', border: '1px solid #fca5a5', fontWeight: 700 }}
          >
            {filter === 'delayed' ? 'Show All Orders' : `View Delayed (${delayedCount})`}
          </button>
        </div>
      )}

      <div className="chip-row scroll">
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'chip-active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label} ({counts[f.id] ?? 0})
          </button>
        ))}
      </div>
      <div className="chip-row scroll" style={{ marginTop: 8 }}>
        <span className="ops-muted" style={{ alignSelf: 'center', fontSize: 12, marginRight: 4 }}>Channel:</span>
        {LEAD_SOURCE_TYPES.map((l) => (
          <button
            key={l.id}
            className={`chip ${leadFilter === l.id ? 'chip-active' : ''}`}
            onClick={() => setLeadFilter(l.id)}
          >
            {l.label} ({leadCounts[l.id] ?? 0})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No rider orders for these dates" sub="Orders show here by their pickup date." />
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center' }}>
          <EmptyState
            title={
              filter === 'todo'
                ? 'All orders verified 🎉'
                : filter === 'delayed'
                ? 'No delayed orders 🎉'
                : filter === 'cancelled'
                ? 'No cancelled orders'
                : 'No matches'
            }
            sub={filter === 'cancelled' ? 'No cancelled orders for these dates.' : 'Try another filter or search.'}
          />
          {filter === 'todo' && counts.all > 0 && (
            <button
              type="button"
              className="btn-ghost"
              style={{ margin: '12px auto 0' }}
              onClick={() => setFilter('all')}
            >
              View all {counts.all} orders
            </button>
          )}
        </div>
      ) : (
        <div className="ops-cards">
          {list.map((r) => (
            <OrderRow
              key={r.id}
              row={r}
              highlight={r.id === focusId}
              isJustEdited={r.id === lastEditedId}
              onEdit={setEditing}
              onCancel={setCancelling}
              onEditPayment={setEditingPayment}
            />
          ))}
        </div>
      )}

      {liveEditing && (
        <EditSheet
          row={liveEditing}
          pricesCatalog={pricesCatalog}
          onSaved={(id) => setLastEditedId(id)}
          onClose={() => setEditing(null)}
        />
      )}
      {liveEditingPayment && <EditPaymentSheet row={liveEditingPayment} onClose={() => setEditingPayment(null)} />}
      {cancelling && (
        <ReasonSheet
          title={`Cancel ${cancelling.customer}'s order record`}
          confirmLabel="Cancel record"
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => saveB2cVerification(cancelling, 'cancel', { lines: cancelling.lines, reason })}
        />
      )}
    </div>
  );
}
