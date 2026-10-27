import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2, X, Loader2, Plus, Trash2, Bike, MapPin, Phone,
  User, Calendar, Clock, CreditCard, Sparkles, AlertCircle
} from 'lucide-react';
import { Sheet, fmtKg } from './shared';
import { calculateB2cPrice, SERVICE_GROUPS, groupOf } from '../../lib/orders';
import { fetchActiveRiders, createWalkInOrder } from '../../firebase';

const groupLabel = Object.fromEntries(SERVICE_GROUPS.map((g) => [g.id, g.label]));
const isKgGroup = (group) => group === 'wash_fold' || group === 'wash_iron';

const DELIVERY_SLOTS = [
  'Morning (9:00 AM - 1:00 PM)',
  'Afternoon (1:00 PM - 5:00 PM)',
  'Evening (5:00 PM - 9:00 PM)',
  'Standard Delivery',
];

const TOMORROW_STR = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function CreateWalkInOrderSheet({ onClose, pricesCatalog = {}, onCreated }) {
  // 1. Customer Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');

  // 2. Services Lines
  const [lines, setLines] = useState([
    { name: 'Wash & Fold', group: 'wash_fold', kg: '', qty: 10, rate: 79 },
  ]);
  const [customTotal, setCustomTotal] = useState('');

  // 3. Delivery Options
  const [deliverySelected, setDeliverySelected] = useState(false);
  const [dropDate, setDropDate] = useState(TOMORROW_STR);
  const [dropSlot, setDropSlot] = useState(DELIVERY_SLOTS[0]);
  const [assignedRiderId, setAssignedRiderId] = useState('');
  const [riders, setRiders] = useState([]);
  const [loadingRiders, setLoadingRiders] = useState(false);

  // 4. Payment Details
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [paymentNotes, setPaymentNotes] = useState('Paid at store counter');

  // Form State
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load active riders for assignment
  useEffect(() => {
    setLoadingRiders(true);
    fetchActiveRiders()
      .then((list) => {
        setRiders(list);
        setLoadingRiders(false);
      })
      .catch((err) => {
        console.error('Failed to load riders:', err);
        setLoadingRiders(false);
      });
  }, []);

  // Distinct service choices from catalog
  const serviceOptions = useMemo(() => {
    const list = Object.values(pricesCatalog).map((p) => ({
      name: p.name,
      group: groupOf(p.name),
      rate: p.pricePerKg > 0 ? p.pricePerKg : p.price || 0,
      isKg: p.pricePerKg > 0 || String(p.unit || '').toLowerCase().includes('kg'),
    }));

    // Ensure core services are always present
    const core = [
      { name: 'Wash & Fold', group: 'wash_fold', rate: 79, isKg: true },
      { name: 'Wash & Iron', group: 'wash_iron', rate: 99, isKg: true },
      { name: 'Dry Cleaning', group: 'dry_clean', rate: 120, isKg: false },
      { name: 'Only Iron', group: 'iron', rate: 25, isKg: false },
    ];

    const names = new Set(list.map((s) => s.name.toLowerCase()));
    core.forEach((c) => {
      if (!names.has(c.name.toLowerCase())) list.unshift(c);
    });

    return list;
  }, [pricesCatalog]);

  const updateLine = (index, field, value) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, [field]: value };
        if (field === 'name') {
          const match = serviceOptions.find((o) => o.name.toLowerCase() === String(value).toLowerCase());
          if (match) {
            updated.group = match.group;
            updated.rate = match.rate;
          }
        }
        return updated;
      })
    );
  };

  const addLine = () => {
    setLines([
      ...lines,
      { name: 'Extra items', group: 'wash_fold', kg: '', qty: 1, rate: 79 },
    ]);
  };

  const removeLine = (index) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  // Live bill calculation
  const dummyOrder = useMemo(() => ({
    ratePerKg: 79,
    deliveryCharge: deliverySelected ? 0 : 0,
    convenienceFee: 0,
  }), [deliverySelected]);

  const priceInfo = useMemo(() => {
    return calculateB2cPrice(dummyOrder, lines, pricesCatalog);
  }, [dummyOrder, lines, pricesCatalog]);

  const finalAmount = customTotal !== '' && !isNaN(Number(customTotal))
    ? Number(customTotal)
    : priceInfo.total;

  const totalKg = Math.round(lines.reduce((s, l) => s + (Number(l.kg) || 0), 0) * 100) / 100;
  const totalClothes = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const selectedRiderObj = useMemo(() => {
    return riders.find((r) => r.id === assignedRiderId) || null;
  }, [riders, assignedRiderId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validations
    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setError('Please enter the customer name.');
      return;
    }

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    if (deliverySelected && !address.trim()) {
      setError('Delivery address is required when Home Delivery is selected.');
      return;
    }

    if (lines.length === 0) {
      setError('Please add at least one service line.');
      return;
    }

    const hasWeightOrClothes = lines.some((l) => Number(l.kg) > 0 || Number(l.qty) > 0);
    if (!hasWeightOrClothes) {
      setError('Please enter weight or clothes count for the service items.');
      return;
    }

    setSaving(true);
    try {
      const created = await createWalkInOrder({
        customerName: trimmedName,
        customerPhone: cleanPhone,
        address: address.trim(),
        lines,
        deliverySelected,
        dropDate: deliverySelected ? dropDate : null,
        dropSlot: deliverySelected ? dropSlot : null,
        assignedRider: deliverySelected ? selectedRiderObj : null,
        payment: {
          status: paymentStatus,
          method: paymentMethod,
          amount: finalAmount,
          notes: paymentNotes.trim(),
        },
      });

      if (onCreated) {
        onCreated(created.id);
      }
      onClose();
    } catch (err) {
      console.error('Failed to create walk-in order:', err);
      setError(err.message || 'Failed to create order. Please check inputs.');
      setSaving(false);
    }
  };

  const PAYMENT_METHODS = [
    { id: 'upi', label: 'UPI (GPay / PhonePe / Paytm)' },
    { id: 'cod', label: 'Cash on Counter / COD' },
    { id: 'card', label: 'Credit / Debit Card' },
    { id: 'online', label: 'Online / App Payment' },
    { id: 'wallet', label: 'Store Credit / Wallet' },
  ];

  return (
    <Sheet title="Create Walk-in Order" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ paddingBottom: 24 }}>
        <p className="ops-hint" style={{ marginTop: -4, marginBottom: 16 }}>
          Walk-in orders are brought directly to the store counter and have <strong>no pickup stop</strong>.
        </p>

        {/* 1. Customer Information */}
        <div style={{ marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={15} style={{ color: '#2563eb' }} />
            <span>Customer Details</span>
          </h4>

          <div className="form-row two-col">
            <div>
              <label className="form-label">Customer Name *</label>
              <input
                className="form-input"
                required
                autoFocus
                placeholder="e.g. Rahul Sharma"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Phone Number *</label>
              <input
                className="form-input"
                required
                type="tel"
                placeholder="10-digit mobile number"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Address <span className="ops-muted">(Optional for walk-in; required if Home Delivery is selected)</span>
            </label>
            <textarea
              className="form-input"
              rows={2}
              placeholder="e.g. Flat 302, Green Acres Society, Baner, Pune"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {/* 2. Services & Quantities */}
        <div style={{ marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={15} style={{ color: '#059669' }} />
              <span>Services Opted For</span>
            </h4>
            <span className="ops-muted" style={{ fontSize: 12 }}>Auto rates applied</span>
          </div>

          {/* Quick Metrics Summary Strip */}
          <div className="b2c-metrics-grid" style={{ marginBottom: 12, background: '#f8fafc', padding: 8, borderRadius: 8 }}>
            <div className="b2c-metric-cell">
              <span className="b2c-metric-val">{totalKg > 0 ? fmtKg(totalKg) : '0 kg'}</span>
              <span className="b2c-metric-lbl">Total Weight</span>
            </div>
            <div className="b2c-metric-cell">
              <span className="b2c-metric-val">{totalClothes} pcs</span>
              <span className="b2c-metric-lbl">Total Clothes</span>
            </div>
            <div className="b2c-metric-cell">
              <span className="b2c-metric-val b2c-price-highlight">₹{finalAmount}</span>
              <span className="b2c-metric-lbl">Total Bill</span>
            </div>
          </div>

          {lines.map((l, i) => (
            <div key={i} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, marginBottom: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <select
                  className="form-input"
                  style={{ flex: 1, fontWeight: 600 }}
                  value={l.name}
                  onChange={(e) => updateLine(i, 'name', e.target.value)}
                >
                  {serviceOptions.map((opt, idx) => (
                    <option key={idx} value={opt.name}>
                      {opt.name} ({groupLabel[opt.group] || opt.group}) — ₹{opt.rate}{opt.isKg ? '/kg' : '/pc'}
                    </option>
                  ))}
                </select>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn-danger-ghost"
                    onClick={() => removeLine(i)}
                    title="Remove service line"
                    style={{ padding: 6, background: '#fee2e2', borderRadius: 6, border: 'none', cursor: 'pointer', color: '#dc2626' }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              <div className="form-row two-col" style={{ margin: 0 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 11 }}>
                    {isKgGroup(l.group) ? 'Weight in KG *' : 'Weight (kg, optional)'}
                  </label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 3.5"
                    value={l.kg}
                    onChange={(e) => updateLine(i, 'kg', e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: 11 }}>Clothes Count (pcs) *</label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    placeholder="e.g. 8"
                    value={l.qty}
                    onChange={(e) => updateLine(i, 'qty', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="chip"
            style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            onClick={addLine}
          >
            <Plus size={13} /> Add another service
          </button>

          {/* Pricing breakdown box */}
          <div className="b2c-price-calc-box" style={{ marginTop: 12 }}>
            <div className="b2c-price-calc-row">
              <span>Standard Per-Kg Rate:</span>
              <strong>₹{priceInfo.perKgRate}/kg</strong>
            </div>
            <div className="b2c-price-calc-row">
              <span>Calculated Services Subtotal:</span>
              <span>₹{priceInfo.subtotal}</span>
            </div>
            <div className="b2c-price-calc-total">
              <span>Calculated Order Bill:</span>
              <strong style={{ fontSize: 16, color: '#059669' }}>₹{priceInfo.total}</strong>
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 10, marginBottom: 0 }}>
            <label className="form-label">
              Custom Bill Override <span className="ops-muted">(Optional — leave empty to use auto ₹{priceInfo.total})</span>
            </label>
            <input
              className="form-input"
              type="number"
              min="0"
              step="1"
              placeholder={`Auto: ₹${priceInfo.total}`}
              value={customTotal}
              onChange={(e) => setCustomTotal(e.target.value)}
            />
          </div>
        </div>

        {/* 3. Delivery & Rider Assignment */}
        <div style={{ marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Bike size={15} style={{ color: '#7c3aed' }} />
            <span>Fulfillment & Delivery</span>
          </h4>

          <div className="form-row">
            <label className="form-label">Order Fulfillment Method</label>
            <div className="toggle-seg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <button
                type="button"
                className={!deliverySelected ? 'on-yes' : ''}
                onClick={() => setDeliverySelected(false)}
              >
                Store Pickup
              </button>
              <button
                type="button"
                className={deliverySelected ? 'on-yes' : ''}
                onClick={() => setDeliverySelected(true)}
              >
                Home Delivery
              </button>
            </div>
          </div>

          {deliverySelected ? (
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 12, marginTop: 10 }}>
              <div className="form-row two-col">
                <div>
                  <label className="form-label">Delivery Date *</label>
                  <input
                    className="form-input"
                    type="date"
                    required
                    value={dropDate}
                    onChange={(e) => setDropDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="form-label">Delivery Time Slot</label>
                  <select
                    className="form-input"
                    value={dropSlot}
                    onChange={(e) => setDropSlot(e.target.value)}
                  >
                    {DELIVERY_SLOTS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Direct Rider Assignment */}
              <div className="form-row" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Directly Assign to Rider</span>
                  <span className="ops-muted">Reflects on Rider App immediately</span>
                </label>
                <select
                  className="form-input"
                  value={assignedRiderId}
                  onChange={(e) => setAssignedRiderId(e.target.value)}
                >
                  <option value="">-- No rider assigned (Assign later) --</option>
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.onDuty ? '🟢 On Duty' : '⚪ Off Duty'} {r.activeCount > 0 ? `(${r.activeCount} active)` : ''}
                    </option>
                  ))}
                </select>
                {selectedRiderObj && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle2 size={13} />
                    <span>Assigned to <strong>{selectedRiderObj.name}</strong> as a Delivery Stop.</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: '#64748b' }}>
              Customer will collect clothes directly from the store counter. No rider pickup or delivery will be scheduled.
            </div>
          )}
        </div>

        {/* 4. Payment Details */}
        <div style={{ marginBottom: 18 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CreditCard size={15} style={{ color: '#0284c7' }} />
            <span>Payment Details</span>
          </h4>

          <div className="form-row">
            <label className="form-label">Payment Status</label>
            <div className="toggle-seg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <button
                type="button"
                className={paymentStatus === 'paid' ? 'on-yes' : ''}
                onClick={() => setPaymentStatus('paid')}
              >
                <CheckCircle2 size={14} /> Paid at Counter
              </button>
              <button
                type="button"
                className={paymentStatus === 'unpaid' ? 'on-no' : ''}
                onClick={() => setPaymentStatus('unpaid')}
              >
                <X size={14} /> Unpaid / Pending
              </button>
            </div>
          </div>

          <div className="form-row two-col">
            <div>
              <label className="form-label">Payment Method</label>
              <select
                className="form-input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Final Amount (₹)</label>
              <input
                className="form-input"
                type="number"
                step="1"
                min="0"
                value={finalAmount}
                readOnly
                style={{ background: '#f8fafc', fontWeight: 700, color: '#059669' }}
              />
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 0 }}>
            <label className="form-label">Payment Notes (optional)</label>
            <input
              className="form-input"
              placeholder="e.g. Paid in cash at counter / GPay ref 12345"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <div className="form-error" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <button
          className="btn-primary"
          type="submit"
          disabled={saving}
          style={{ width: '100%', padding: '12px', fontSize: 15, fontWeight: 700 }}
        >
          {saving ? <Loader2 size={18} className="spin" /> : null}
          <span>Create Walk-in Order (₹{finalAmount})</span>
        </button>
      </form>
    </Sheet>
  );
}
