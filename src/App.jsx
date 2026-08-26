import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, X, Search, Loader2, Home, Package, Users,
  AlertTriangle, CheckCircle2, Clock, Repeat2, Trash2, Pencil, IndianRupee, LogOut, Lock,
} from 'lucide-react';
import {
  subscribeB2b, subscribeB2c, subscribeHostels,
  addB2b, updateB2b, removeB2b,
  addB2c, updateB2c, removeB2c,
  subscribeAuth, signIn, signOut, isAllowedUser,
} from './firebase';

/* ---------------- constants ---------------- */

const SERVICES = ['Wash & Fold', 'Wash & Iron', 'Dry Clean', 'Steam Iron', 'Shoe Clean'];

const B2B_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'flagged', label: 'Issues / complaints' },
  { id: 'pending_review', label: 'Pending Review' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'review_flagged', label: 'Review Flagged' },
];

const B2C_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Payment pending' },
  { id: 'delayed', label: 'Delayed' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'repeat', label: 'Repeat customers' },
  { id: 'pending_review', label: 'Pending Review' },
  { id: 'reviewed', label: 'Reviewed' },
  { id: 'review_flagged', label: 'Review Flagged' },
];

/* ---------------- helpers ---------------- */

const todayStr = () => new Date().toISOString().slice(0, 10);
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmtINR = (n) => '₹' + num(n).toLocaleString('en-IN');
const fmtKg = (n) => num(n).toFixed(1) + ' kg';
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

function newB2b(hostels) {
  return {
    hostel: hostels.length ? hostels[0] : '', status: 'unprocessed',
    totalKg: '', pickupDate: todayStr(), deliveredDate: '',
    delay: false, delayNote: '', issues: '', complaints: '', refund: '',
    reviewStatus: 'pending', reviewNote: '',
  };
}

function newB2c() {
  return {
    customerName: '', date: todayStr(), pickup: todayStr(), delivery: '',
    weight: '', services: [], orderValue: '', discount: '',
    paymentStatus: 'Pending', delayStatus: 'On-time', refund: '', repeatCustomer: false,
    reviewStatus: 'pending', reviewNote: '',
  };
}

/* ---------------- small UI atoms ---------------- */

function Badge({ tone = 'gray', children, title }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

function Tag({ children }) {
  return <span className="tag">{children}</span>;
}

function StatCard({ icon, label, value, tone = 'blue' }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ title, sub }) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
}

function Sheet({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- B2B form ---------------- */

function B2BForm({ initial, onSave, onDelete, onClose, hostels, isAdmin }) {
  const isEdit = !!initial;
  const base = initial || newB2b(hostels);
  const [hostelSelect, setHostelSelect] = useState(hostels.includes(base.hostel) ? base.hostel : 'Other');
  const [hostelCustom, setHostelCustom] = useState(hostels.includes(base.hostel) ? '' : base.hostel);
  const [form, setForm] = useState(base);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleStatusChange = (statusVal) => {
    setForm((f) => {
      const updates = { status: statusVal };
      if (statusVal === 'processed' && !f.deliveredDate) {
        updates.deliveredDate = todayStr();
      }
      return { ...f, ...updates };
    });
  };

  const submit = async () => {
    const hostel = hostelSelect === 'Other' ? hostelCustom.trim() : hostelSelect;
    if (!hostel) { setError('Add a property name.'); return; }
    if (!form.totalKg || num(form.totalKg) <= 0) { setError('Add the total kg for this batch.'); return; }
    if (form.deliveredDate && form.deliveredDate < form.pickupDate) {
      setError('Delivered date cannot be before pickup date.');
      return;
    }
    setSaving(true);
    try {
      const reviewFields = isAdmin ? {
        reviewStatus: form.reviewStatus || 'pending',
        reviewNote: form.reviewStatus === 'flagged' ? (form.reviewNote || '') : '',
      } : {
        reviewStatus: 'pending',
        reviewNote: '',
      };
      await onSave({ ...form, hostel, ...reviewFields });
    } catch (e) {
      setError('Failed to save — check your connection.');
      setSaving(false);
    }
  };

  return (
    <Sheet title={isEdit ? 'Edit batch' : 'Add B2B batch'} onClose={onClose}>
      <div className="form-row">
        <label className="form-label">Property</label>
        <select className="form-input" value={hostelSelect} onChange={(e) => setHostelSelect(e.target.value)}>
          {hostels.map((h) => <option key={h} value={h}>{h}</option>)}
          <option value="Other">Other</option>
        </select>
        {hostelSelect === 'Other' && (
          <input className="form-input" style={{ marginTop: 8 }} placeholder="Property name"
            value={hostelCustom} onChange={(e) => setHostelCustom(e.target.value)} />
        )}
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Total kg</label>
          <input className="form-input" type="number" step="0.1" placeholder="0.0"
            value={form.totalKg} onChange={(e) => set('totalKg', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Status</label>
          <select className="form-input" value={form.status} onChange={(e) => handleStatusChange(e.target.value)}>
            <option value="unprocessed">Unprocessed</option>
            <option value="processed">Processed</option>
          </select>
        </div>
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Pickup date</label>
          <input className="form-input" type="date" value={form.pickupDate} onChange={(e) => set('pickupDate', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Delivered date</label>
          <input className="form-input" type="date" value={form.deliveredDate} onChange={(e) => set('deliveredDate', e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <label className="check-row">
          <input type="checkbox" checked={form.delay} onChange={(e) => set('delay', e.target.checked)} />
          <span>This batch is delayed</span>
        </label>
        {form.delay && (
          <input className="form-input" style={{ marginTop: 8 }} placeholder="Reason / how long"
            value={form.delayNote} onChange={(e) => set('delayNote', e.target.value)} />
        )}
      </div>

      <div className="form-row">
        <label className="form-label">Issues</label>
        <textarea className="form-input" rows={2} placeholder="Anything wrong with the batch itself"
          value={form.issues} onChange={(e) => set('issues', e.target.value)} />
      </div>

      <div className="form-row">
        <label className="form-label">Complaints</label>
        <textarea className="form-input" rows={2} placeholder="Complaint raised by the property"
          value={form.complaints} onChange={(e) => set('complaints', e.target.value)} />
      </div>

      <div className="form-row">
        <label className="form-label">Refund (₹)</label>
        <input className="form-input" type="number" placeholder="0" value={form.refund} onChange={(e) => set('refund', e.target.value)} />
      </div>

      {isAdmin && (
        <div className="admin-review-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
          <label className="form-label" style={{ color: 'var(--blue)' }}>Admin Review Status</label>
          <div className="form-row two-col" style={{ margin: '8px 0' }}>
            <label className="check-row">
              <input type="radio" name="reviewStatus" checked={form.reviewStatus !== 'reviewed' && form.reviewStatus !== 'flagged'} onChange={() => set('reviewStatus', 'pending')} />
              <span>Pending</span>
            </label>
            <label className="check-row">
              <input type="radio" name="reviewStatus" checked={form.reviewStatus === 'reviewed'} onChange={() => set('reviewStatus', 'reviewed')} />
              <span>Reviewed</span>
            </label>
          </div>
          <div className="form-row">
            <label className="check-row">
              <input type="radio" name="reviewStatus" checked={form.reviewStatus === 'flagged'} onChange={() => set('reviewStatus', 'flagged')} />
              <span>Flag issue / needs correction</span>
            </label>
          </div>
          {form.reviewStatus === 'flagged' && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <input className="form-input" placeholder="What needs correction?" value={form.reviewNote || ''} onChange={(e) => set('reviewNote', e.target.value)} />
            </div>
          )}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        {isEdit && (
          <button className="btn-danger" onClick={() => onDelete(form.id)} disabled={saving}>
            <Trash2 size={16} /> Delete
          </button>
        )}
        <button className="btn-primary" onClick={submit} disabled={saving}>
          {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : 'Save batch'}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- B2C form ---------------- */

function B2CForm({ initial, onSave, onDelete, onClose, isAdmin }) {
  const isEdit = !!initial;
  const base = initial || newB2c();
  const [form, setForm] = useState(base);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleService = (s) => {
    setForm((f) => ({
      ...f,
      services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s],
    }));
  };

  const submit = async () => {
    if (!form.customerName.trim()) { setError('Add the customer name.'); return; }
    if (!form.date) { setError('Add the order date.'); return; }
    if (form.delivery && form.delivery < form.pickup) {
      setError('Delivery date cannot be before pickup date.');
      return;
    }
    setSaving(true);
    try {
      const reviewFields = isAdmin ? {
        reviewStatus: form.reviewStatus || 'pending',
        reviewNote: form.reviewStatus === 'flagged' ? (form.reviewNote || '') : '',
      } : {
        reviewStatus: 'pending',
        reviewNote: '',
      };
      await onSave({ ...form, customerName: form.customerName.trim(), ...reviewFields });
    } catch (e) {
      setError('Failed to save — check your connection.');
      setSaving(false);
    }
  };

  return (
    <Sheet title={isEdit ? 'Edit order' : 'Add B2C order'} onClose={onClose}>
      <div className="form-row">
        <label className="form-label">Customer name</label>
        <input className="form-input" placeholder="Full name" value={form.customerName} onChange={(e) => set('customerName', e.target.value)} />
      </div>

      <div className="form-row three-col">
        <div>
          <label className="form-label">Date</label>
          <input className="form-input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Pickup</label>
          <input className="form-input" type="date" value={form.pickup} onChange={(e) => set('pickup', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Delivery</label>
          <input className="form-input" type="date" value={form.delivery} onChange={(e) => set('delivery', e.target.value)} />
        </div>
      </div>

      <div className="form-row">
        <label className="form-label">Services</label>
        <div className="chip-row">
          {SERVICES.map((s) => (
            <button type="button" key={s} className={`chip ${form.services.includes(s) ? 'chip-active' : ''}`} onClick={() => toggleService(s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Weight (kg)</label>
          <input className="form-input" type="number" step="0.1" placeholder="0.0" value={form.weight} onChange={(e) => set('weight', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Order value (₹)</label>
          <input className="form-input" type="number" placeholder="0" value={form.orderValue} onChange={(e) => set('orderValue', e.target.value)} />
        </div>
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Discount (₹)</label>
          <input className="form-input" type="number" placeholder="0" value={form.discount} onChange={(e) => set('discount', e.target.value)} />
        </div>
        <div>
          <label className="form-label">Refund (₹)</label>
          <input className="form-input" type="number" placeholder="0" value={form.refund} onChange={(e) => set('refund', e.target.value)} />
        </div>
      </div>

      <div className="form-row two-col">
        <div>
          <label className="form-label">Payment status</label>
          <select className="form-input" value={form.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)}>
            <option>Paid</option><option>Pending</option><option>Partial</option>
          </select>
        </div>
        <div>
          <label className="form-label">Delay status</label>
          <select className="form-input" value={form.delayStatus} onChange={(e) => set('delayStatus', e.target.value)}>
            <option>On-time</option><option>Delayed</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <label className="check-row">
          <input type="checkbox" checked={form.repeatCustomer} onChange={(e) => set('repeatCustomer', e.target.checked)} />
          <span>Repeat customer</span>
        </label>
      </div>

      {isAdmin && (
        <div className="admin-review-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
          <label className="form-label" style={{ color: 'var(--blue)' }}>Admin Review Status</label>
          <div className="form-row two-col" style={{ margin: '8px 0' }}>
            <label className="check-row">
              <input type="radio" name="reviewStatus" checked={form.reviewStatus !== 'reviewed' && form.reviewStatus !== 'flagged'} onChange={() => set('reviewStatus', 'pending')} />
              <span>Pending</span>
            </label>
            <label className="check-row">
              <input type="radio" name="reviewStatus" checked={form.reviewStatus === 'reviewed'} onChange={() => set('reviewStatus', 'reviewed')} />
              <span>Reviewed</span>
            </label>
          </div>
          <div className="form-row">
            <label className="check-row">
              <input type="radio" name="reviewStatus" checked={form.reviewStatus === 'flagged'} onChange={() => set('reviewStatus', 'flagged')} />
              <span>Flag issue / needs correction</span>
            </label>
          </div>
          {form.reviewStatus === 'flagged' && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <input className="form-input" placeholder="What needs correction?" value={form.reviewNote || ''} onChange={(e) => set('reviewNote', e.target.value)} />
            </div>
          )}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        {isEdit && (
          <button className="btn-danger" onClick={() => onDelete(form.id)} disabled={saving}>
            <Trash2 size={16} /> Delete
          </button>
        )}
        <button className="btn-primary" onClick={submit} disabled={saving}>
          {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : 'Save order'}
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- B2B card + board ---------------- */

function B2BCard({ entry, onEdit, onQuickProcess }) {
  return (
    <div className="card" onClick={() => onEdit(entry)}>
      <div className="card-top">
        <Tag>{entry.hostel}</Tag>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {entry.status === 'unprocessed' && onQuickProcess && (
            <button className="quick-process-btn" onClick={(e) => onQuickProcess(entry.id, e)} title="Mark Processed (Delivered Today)">
              <CheckCircle2 size={14} />
            </button>
          )}
          <Pencil size={14} className="edit-hint" />
        </div>
      </div>
      <div className="card-kg">{fmtKg(entry.totalKg)}</div>
      <div className="card-dates">
        <span>Pickup {fmtDate(entry.pickupDate)}</span>
        <span>·</span>
        <span>Delivered {entry.deliveredDate ? fmtDate(entry.deliveredDate) : 'pending'}</span>
      </div>
      <div className="card-badges">
        {(!entry.reviewStatus || entry.reviewStatus === 'pending') && <Badge tone="gray">Pending Review</Badge>}
        {entry.reviewStatus === 'reviewed' && <Badge tone="green">Reviewed</Badge>}
        {entry.reviewStatus === 'flagged' && <Badge tone="red" title={entry.reviewNote}>Flagged: {entry.reviewNote}</Badge>}
        {entry.delay && <Badge tone="amber">Delayed</Badge>}
        {entry.issues && <Badge tone="red">Issue</Badge>}
        {entry.complaints && <Badge tone="red">Complaint</Badge>}
        {num(entry.refund) > 0 && <Badge tone="gray">{fmtINR(entry.refund)} refunded</Badge>}
      </div>
    </div>
  );
}

function B2BTab({ data, onEdit, onQuickProcess }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = [...data];
    if (search.trim()) list = list.filter((x) => x.hostel.toLowerCase().includes(search.trim().toLowerCase()));
    if (filter === 'delayed') list = list.filter((x) => x.delay);
    if (filter === 'flagged') list = list.filter((x) => x.issues || x.complaints);
    if (filter === 'pending_review') list = list.filter((x) => !x.reviewStatus || x.reviewStatus === 'pending');
    if (filter === 'reviewed') list = list.filter((x) => x.reviewStatus === 'reviewed');
    if (filter === 'review_flagged') list = list.filter((x) => x.reviewStatus === 'flagged');
    return list;
  }, [data, search, filter]);

  const unprocessed = filtered.filter((x) => x.status === 'unprocessed');
  const processed = filtered.filter((x) => x.status === 'processed');

  const byProperty = useMemo(() => {
    const map = {};
    data.forEach((x) => { map[x.hostel] = (map[x.hostel] || 0) + num(x.totalKg); });
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    return { rows, max };
  }, [data]);

  return (
    <div>
      {data.length > 0 && (
        <div className="panel">
          <div className="panel-title">Kg by property</div>
          {byProperty.rows.map(([name, kg]) => (
            <div className="bar-row" key={name}>
              <div className="bar-label">{name}</div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(kg / byProperty.max) * 100}%` }} /></div>
              <div className="bar-value">{fmtKg(kg)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input className="search-input" placeholder="Search property" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="chip-row scroll">
        {B2B_FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'chip-active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {data.length === 0 ? (
        <EmptyState title="No batches yet" sub="Add your first hostel pickup to get started." />
      ) : (
        <div className="board">
          <div className="board-col">
            <div className="board-col-header"><Badge tone="amber">Unprocessed</Badge><span className="board-count">{unprocessed.length}</span></div>
            {unprocessed.length === 0 ? <div className="col-empty">Nothing here</div> : unprocessed.map((e) => <B2BCard key={e.id} entry={e} onEdit={onEdit} onQuickProcess={onQuickProcess} />)}
          </div>
          <div className="board-divider" />
          <div className="board-col">
            <div className="board-col-header"><Badge tone="green">Processed</Badge><span className="board-count">{processed.length}</span></div>
            {processed.length === 0 ? <div className="col-empty">Nothing here</div> : processed.map((e) => <B2BCard key={e.id} entry={e} onEdit={onEdit} onQuickProcess={onQuickProcess} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- B2C card + list ---------------- */

function B2CCard({ entry, onEdit }) {
  return (
    <div className="card" onClick={() => onEdit(entry)}>
      <div className="card-top">
        <div className="card-name">{entry.customerName}</div>
        <Pencil size={14} className="edit-hint" />
      </div>
      <div className="card-dates">
        <span>{fmtDate(entry.date)}</span><span>·</span><span>{fmtKg(entry.weight)}</span><span>·</span><span>{fmtINR(entry.orderValue)}</span>
      </div>
      <div className="card-badges">
        {(!entry.reviewStatus || entry.reviewStatus === 'pending') && <Badge tone="gray">Pending Review</Badge>}
        {entry.reviewStatus === 'reviewed' && <Badge tone="green">Reviewed</Badge>}
        {entry.reviewStatus === 'flagged' && <Badge tone="red" title={entry.reviewNote}>Flagged: {entry.reviewNote}</Badge>}
        <Badge tone={entry.paymentStatus === 'Paid' ? 'green' : entry.paymentStatus === 'Partial' ? 'amber' : 'red'}>{entry.paymentStatus}</Badge>
        <Badge tone={entry.delayStatus === 'Delayed' ? 'amber' : 'gray'}>{entry.delayStatus}</Badge>
        {entry.repeatCustomer && <Badge tone="blue">Repeat</Badge>}
        {num(entry.refund) > 0 && <Badge tone="gray">{fmtINR(entry.refund)} refunded</Badge>}
      </div>
    </div>
  );
}

function B2CTab({ data, onEdit }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = [...data];
    if (search.trim()) list = list.filter((x) => x.customerName.toLowerCase().includes(search.trim().toLowerCase()));
    if (filter === 'pending') list = list.filter((x) => x.paymentStatus !== 'Paid');
    if (filter === 'delayed') list = list.filter((x) => x.delayStatus === 'Delayed');
    if (filter === 'refunded') list = list.filter((x) => num(x.refund) > 0);
    if (filter === 'repeat') list = list.filter((x) => x.repeatCustomer);
    if (filter === 'pending_review') list = list.filter((x) => !x.reviewStatus || x.reviewStatus === 'pending');
    if (filter === 'reviewed') list = list.filter((x) => x.reviewStatus === 'reviewed');
    if (filter === 'review_flagged') list = list.filter((x) => x.reviewStatus === 'flagged');
    return list;
  }, [data, search, filter]);

  return (
    <div>
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input className="search-input" placeholder="Search customer" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="chip-row scroll">
        {B2C_FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'chip-active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {data.length === 0 ? (
        <EmptyState title="No orders yet" sub="Add the first customer order to get started." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" sub="Try a different search or filter." />
      ) : (
        <div className="list">
          {filtered.map((e) => <B2CCard key={e.id} entry={e} onEdit={onEdit} />)}
        </div>
      )}
    </div>
  );
}

/* ---------------- overview (matching design layout) ---------------- */

function OverviewTab({ b2b, b2c }) {
  const b2bStats = useMemo(() => ({
    total: b2b.length,
    unprocessed: b2b.filter((x) => x.status === 'unprocessed').length,
    processed: b2b.filter((x) => x.status === 'processed').length,
    kg: b2b.reduce((s, x) => s + num(x.totalKg), 0),
    delayed: b2b.filter((x) => x.delay).length,
    flagged: b2b.filter((x) => x.issues || x.complaints).length,
    refund: b2b.reduce((s, x) => s + num(x.refund), 0),
  }), [b2b]);

  const b2cStats = useMemo(() => ({
    total: b2c.length,
    kg: b2c.reduce((s, x) => s + num(x.weight), 0),
    revenue: b2c.reduce((s, x) => s + num(x.orderValue) - num(x.discount), 0),
    pending: b2c.filter((x) => x.paymentStatus !== 'Paid').length,
    delayed: b2c.filter((x) => x.delayStatus === 'Delayed').length,
    refund: b2c.reduce((s, x) => s + num(x.refund), 0),
    repeat: b2c.length ? Math.round((b2c.filter((x) => x.repeatCustomer).length / b2c.length) * 100) : 0,
  }), [b2c]);

  const overallRevenue = b2cStats.revenue;

  return (
    <div className="overview-container">
      <div className="overview-widgets-grid">
        
        {/* Widget 1: Revenue */}
        <div className="widget-card widget-blue">
          <div className="widget-header">
            <span className="widget-label">REVENUE (OVERALL)</span>
            <div className="widget-circle-icon icon-blue"><IndianRupee size={16} /></div>
          </div>
          <div className="widget-value">{fmtINR(overallRevenue)}</div>
          <div className="widget-breakdown">
            <div className="breakdown-col">
              <span className="breakdown-label">B2C</span>
              <span className="breakdown-val">{fmtINR(b2cStats.revenue)}</span>
            </div>
            <div className="breakdown-divider" />
            <div className="breakdown-col">
              <span className="breakdown-label">B2B</span>
              <span className="breakdown-val">{fmtINR(b2bStats.refund ? -b2bStats.refund : 0)} (Refunds)</span>
            </div>
          </div>
        </div>

        {/* Widget 2: Pickups & Deliveries */}
        <div className="widget-card widget-purple">
          <div className="widget-header">
            <span className="widget-label">PICKUPS & DELIVERIES</span>
            <div className="widget-circle-icon icon-purple"><Clock size={16} /></div>
          </div>
          <div className="widget-breakdown-row">
            <div className="breakdown-side">
              <span className="side-title">B2C</span>
              <div className="side-stat">Pickups: <strong>{b2cStats.total}</strong></div>
              <div className="side-stat">Delayed: <strong>{b2cStats.delayed}</strong></div>
            </div>
            <div className="breakdown-divider-v" />
            <div className="breakdown-side">
              <span className="side-title">B2B</span>
              <div className="side-stat">Pickups: <strong>{b2bStats.total}</strong></div>
              <div className="side-stat">Delivered: <strong>{b2bStats.processed}</strong></div>
            </div>
          </div>
        </div>

        {/* Widget 3: KG Processed */}
        <div className="widget-card widget-green">
          <div className="widget-header">
            <span className="widget-label">KG PROCESSED</span>
            <div className="widget-circle-icon icon-green"><Package size={16} /></div>
          </div>
          <div className="widget-value">{fmtKg(b2bStats.kg + b2cStats.kg)}</div>
          <div className="widget-breakdown">
            <div className="breakdown-col">
              <span className="breakdown-label">B2C</span>
              <span className="breakdown-val">{fmtKg(b2cStats.kg)}</span>
            </div>
            <div className="breakdown-divider" />
            <div className="breakdown-col">
              <span className="breakdown-label">B2B</span>
              <span className="breakdown-val">{fmtKg(b2bStats.kg)}</span>
            </div>
          </div>
        </div>

        {/* Widget 4: Open Issues */}
        <div className="widget-card widget-red">
          <div className="widget-header">
            <span className="widget-label">OPEN ISSUES</span>
            <div className="widget-circle-icon icon-red"><AlertTriangle size={16} /></div>
          </div>
          <div className="widget-value">{b2bStats.flagged}</div>
          <div className="widget-breakdown">
            <div className="breakdown-col">
              <span className="breakdown-label">Delayed Batches</span>
              <span className="breakdown-val">{b2bStats.delayed}</span>
            </div>
            <div className="breakdown-divider" />
            <div className="breakdown-col">
              <span className="breakdown-label">Complaints</span>
              <span className="breakdown-val">{b2bStats.flagged}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ---------------- main app ---------------- */

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out/manager
  const [authError, setAuthError] = useState('');
  const [tab, setTab] = useState('b2b'); // default to B2B for managers
  const [b2b, setB2b] = useState([]);
  const [b2c, setB2c] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  /* network listener */
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const isAdmin = user && isAllowedUser(user);

  /* auth listener */
  useEffect(() => {
    return subscribeAuth((u) => {
      setUser(u);
      if (u) {
        if (isAllowedUser(u)) {
          setTab('overview'); // switch to admin stats on login
          setAuthError('');
        } else {
          setAuthError('This account does not have access. Sign in with an Andes admin account.');
          signOut();
        }
      } else {
        setTab('b2b'); // switch back to data tabs on signout
      }
    });
  }, []);

  /* real-time Firestore listeners — always load since managers are unauthenticated */
  useEffect(() => {
    let b2bReady = false;
    let b2cReady = false;

    const unsubB2b = subscribeB2b((list) => {
      setB2b(list);
      b2bReady = true;
      if (b2cReady) setLoading(false);
    });

    const unsubB2c = subscribeB2c((list) => {
      setB2c(list);
      b2cReady = true;
      if (b2bReady) setLoading(false);
    });

    const timeout = setTimeout(() => setLoading(false), 3000);
    const unsubHostels = subscribeHostels((names) => setHostels(names));

    return () => {
      unsubB2b();
      unsubB2c();
      unsubHostels();
      clearTimeout(timeout);
    };
  }, []);

  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError('Enter email and password.');
      return;
    }
    setLoginLoading(true);
    try {
      await signIn(loginEmail.trim(), loginPassword);
      setLoginModalOpen(false);
    } catch (err) {
      console.error('Firebase Auth error details:', err);
      const msg = err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
        ? 'Wrong email or password.'
        : err.code === 'auth/user-not-found'
          ? 'No account with this email.'
          : `Sign-in failed (${err.code || 'unknown'}).`;
      setAuthError(msg);
    }
    setLoginLoading(false);
  };

  const handleSignOut = () => {
    signOut();
    setLoginEmail('');
    setLoginPassword('');
  };

  /* ---- B2B save / delete ---- */
  const saveB2b = async (entry) => {
    if (entry.id && b2b.some((x) => x.id === entry.id)) {
      await updateB2b(entry.id, entry);
    } else {
      await addB2b(entry);
    }
    setModal(null);
  };

  const deleteB2b = async (id) => {
    await removeB2b(id);
    setModal(null);
  };

  /* ---- B2C save / delete ---- */
  const saveB2c = async (entry) => {
    if (entry.id && b2c.some((x) => x.id === entry.id)) {
      await updateB2c(entry.id, entry);
    } else {
      await addB2c(entry);
    }
    setModal(null);
  };

  const deleteB2c = async (id) => {
    await removeB2c(id);
    setModal(null);
  };

  const quickProcessB2b = async (id, e) => {
    e.stopPropagation();
    const target = b2b.find((x) => x.id === id);
    if (target) {
      await updateB2b(id, {
        ...target,
        status: 'processed',
        deliveredDate: todayStr(),
        reviewStatus: 'pending',
      });
    }
  };

  if (user === undefined) {
    return (
      <div className="layout-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="loading-state"><Loader2 size={22} className="spin" /><span>Checking auth…</span></div>
      </div>
    );
  }

  return (
    <div className="layout-container">
      
      {/* 1. WIDESCREEN SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="sidebar-logo"><Home size={20} color="#fff" /></div>
            <div>
              <div className="sidebar-title">Andes</div>
              <div className="sidebar-subtitle">Manager Portal</div>
            </div>
          </div>

          <nav className="sidebar-menu">
            {isAdmin && (
              <button className={`menu-item ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
                <Package size={18} />
                <span>Overview</span>
              </button>
            )}
            <button className={`menu-item ${tab === 'b2b' ? 'active' : ''}`} onClick={() => setTab('b2b')}>
              <Package size={18} />
              <span>B2B Hostels</span>
            </button>
            <button className={`menu-item ${tab === 'b2c' ? 'active' : ''}`} onClick={() => setTab('b2c')}>
              <Users size={18} />
              <span>B2C Orders</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-profile">
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              {isAdmin ? (
                <>
                  <div className="profile-info">
                    <span className="profile-name">Aryan</span>
                    <span className="profile-role">Admin</span>
                  </div>
                  <button className="icon-btn" style={{ background: 'transparent', border: 'none', color: '#94a3b8' }} onClick={handleSignOut} title="Sign out">
                    <LogOut size={18} />
                  </button>
                </>
              ) : (
                <button className="menu-item" style={{ padding: 0 }} onClick={() => setLoginModalOpen(true)}>
                  <Lock size={18} />
                  <span>Admin Login</span>
                </button>
              )}
            </div>
            <div className="profile-info" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: isOnline ? 'var(--green)' : 'var(--red)',
                boxShadow: isOnline ? '0 0 8px var(--green)' : '0 0 8px var(--red)'
              }} />
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN AREA */}
      <main className="main-area">
        
        {/* Desktop Header */}
        <header className="main-header">
          <div className="main-title-wrap">
            <h1>{tab === 'overview' ? 'Dashboard Overview' : tab === 'b2b' ? 'B2B Hostels' : 'B2C Orders'}</h1>
            <p>{b2b.length} B2B batches · {b2c.length} B2C orders total</p>
          </div>

          <div className="header-actions">
            {(tab === 'b2b' || tab === 'b2c') && (
              <button className="btn-action-primary" onClick={() => setModal({ type: tab, entry: null })}>
                <Plus size={16} />
                <span>{tab === 'b2b' ? 'Log New Batch' : 'Log New Order'}</span>
              </button>
            )}
          </div>
        </header>

        {/* Mobile Header (Hidden on Desktop) */}
        <div className="mobile-topbar">
          <div className="brand">
            <div className="brand-badge"><Home size={17} color="#fff" /></div>
            <div>
              <div className="brand-name">Andes {isAdmin && <span className="admin-pill" style={{ fontSize: 9, background: '#2563eb', color: '#fff', padding: '2px 6px', borderRadius: 4, marginLeft: 6, fontWeight: 700, textTransform: 'uppercase' }}>Admin</span>}</div>
              <div className="brand-sub">{b2b.length} B2B · {b2c.length} B2C</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdmin ? (
              <button className="icon-btn" onClick={handleSignOut} title="Sign out admin">
                <LogOut size={16} />
              </button>
            ) : (
              <button className="icon-btn" onClick={() => setLoginModalOpen(true)} title="Admin Login">
                <Lock size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Tabs (Hidden on Desktop) */}
        <nav className="mobile-tabs">
          {(isAdmin ? ['overview', 'b2b', 'b2c'] : ['b2b', 'b2c']).map((t) => (
            <button key={t} className={`mobile-tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : t.toUpperCase()}
            </button>
          ))}
        </nav>

        {/* Active Tab Panel */}
        <div className="tab-content-panel">
          {loading ? (
            <div className="loading-state"><Loader2 size={22} className="spin" /><span>Loading dashboard…</span></div>
          ) : tab === 'overview' ? (
            <OverviewTab b2b={b2b} b2c={b2c} />
          ) : tab === 'b2b' ? (
            <B2BTab data={b2b} onEdit={(entry) => setModal({ type: 'b2b', entry })} onQuickProcess={quickProcessB2b} />
          ) : (
            <B2CTab data={b2c} onEdit={(entry) => setModal({ type: 'b2c', entry })} />
          )}
        </div>

      </main>

      {/* Mobile Floating Action Button (FAB) */}
      {(tab === 'b2b' || tab === 'b2c') && !loading && (
        <button className="fab" onClick={() => setModal({ type: tab, entry: null })}>
          <Plus size={20} /> <span>{tab === 'b2b' ? 'Log New Batch' : 'Log New Order'}</span>
        </button>
      )}

      {/* Modals & Forms */}
      {modal && modal.type === 'b2b' && (
        <B2BForm initial={modal.entry} onSave={saveB2b} onDelete={deleteB2b} onClose={() => setModal(null)} hostels={hostels} isAdmin={isAdmin} />
      )}
      {modal && modal.type === 'b2c' && (
        <B2CForm initial={modal.entry} onSave={saveB2c} onDelete={deleteB2c} onClose={() => setModal(null)} isAdmin={isAdmin} />
      )}

      {loginModalOpen && (
        <Sheet title="Admin Sign In" onClose={() => setLoginModalOpen(false)}>
          <form onSubmit={handleSignIn} style={{ width: '100%' }}>
            <div className="form-row">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="you@andes.co.in"
                value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} autoFocus />
            </div>
            <div className="form-row">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••"
                value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
            </div>
            {authError && <div className="form-error" style={{ textAlign: 'center', marginBottom: 10 }}>{authError}</div>}
            <button className="btn-primary" type="submit" style={{ width: '100%' }} disabled={loginLoading}>
              {loginLoading ? <><Loader2 size={16} className="spin" /> Signing in…</> : 'Sign in'}
            </button>
          </form>
        </Sheet>
      )}

    </div>
  );
}
