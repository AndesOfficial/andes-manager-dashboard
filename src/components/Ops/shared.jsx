import React, { useState } from 'react';
import { X, CheckCircle2, Pencil, Ban, RotateCcw, Loader2, History, Lock } from 'lucide-react';

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const shiftDay = (day, n) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtKg = (n) => `${(Number(n) || 0).toFixed(1)} kg`;
export const fmtDay = (day) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export function Badge({ tone = 'gray', children, title }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

export function EmptyState({ title, sub }) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
}

export function Sheet({ title, onClose, children }) {
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

const PRESETS = [
  { id: 'today', label: 'Today', range: () => ({ from: todayStr(), to: todayStr() }) },
  { id: 'yesterday', label: 'Yesterday', range: () => ({ from: shiftDay(todayStr(), -1), to: shiftDay(todayStr(), -1) }) },
  { id: 'week', label: 'Last 7 days', range: () => ({ from: shiftDay(todayStr(), -6), to: todayStr() }) },
  { id: 'month', label: 'This month', range: () => ({ from: `${todayStr().slice(0, 8)}01`, to: todayStr() }) },
];

export const rangeLabel = ({ from, to }) => (from === to ? fmtDay(from) : `${fmtDay(from)} – ${fmtDay(to)}`);

/** From–to range for the whole dashboard, with quick presets. */
export function RangeBar({ range, onChange }) {
  const active = PRESETS.find((p) => { const r = p.range(); return r.from === range.from && r.to === range.to; });
  const set = (from, to) => onChange(from <= to ? { from, to } : { from: to, to: from });
  return (
    <div className="range-bar">
      <div className="chip-row scroll range-presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={`chip ${active?.id === p.id ? 'chip-active' : ''}`} onClick={() => onChange(p.range())}>{p.label}</button>
        ))}
      </div>
      <div className="range-inputs">
        <label><span>From</span>
          <input className="form-input" type="date" value={range.from} max={todayStr()} onChange={(e) => e.target.value && set(e.target.value, range.to)} />
        </label>
        <label><span>To</span>
          <input className="form-input" type="date" value={range.to} max={todayStr()} onChange={(e) => e.target.value && set(range.from, e.target.value)} />
        </label>
      </div>
    </div>
  );
}

/** Colored stat tile in the same style as the rest of the site. */
export function Tile({ tone = 'blue', icon, label, value, sub }) {
  return (
    <div className={`widget-card widget-${tone} ops-tile`}>
      <div className="widget-header">
        <span className="widget-label">{label}</span>
        {icon && <div className={`widget-circle-icon icon-${tone}`}>{icon}</div>}
      </div>
      <div className="widget-value">{value}</div>
      {sub && <div className="ops-tile-sub">{sub}</div>}
    </div>
  );
}

const STATUS = {
  pending: { tone: 'gray', label: 'To verify' },
  verified: { tone: 'green', label: 'Verified' },
  changed: { tone: 'amber', label: 'Changed by rider — re-verify' },
  cancelled: { tone: 'red', label: 'Cancelled' },
};

export function StatusBadge({ status, locked }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <>
      <Badge tone={s.tone}>{s.label}</Badge>
      {locked && <Badge tone="blue" title="Admin has counted this record"><Lock size={10} /> Counted by Admin</Badge>}
    </>
  );
}

export const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'todo', label: 'To verify' },
  { id: 'verified', label: 'Verified' },
  { id: 'cancelled', label: 'Cancelled' },
];
export const matchesFilter = (status, filter) => filter === 'all'
  || (filter === 'todo' && (status === 'pending' || status === 'changed'))
  || status === filter;

/** Verify / Edit / Cancel (or Restore) buttons shared by B2B and B2C rows. */
export function RowActions({ status, locked, busy, onVerify, onEdit, onCancel, onRestore, isB2b = false }) {
  if (locked) return null;
  if (status === 'cancelled') {
    return (
      <div className="row-actions">
        <button className="btn-ghost" disabled={busy} onClick={onRestore}><RotateCcw size={14} /> Restore</button>
      </div>
    );
  }
  // In B2B, manager is not allowed to edit or cancel after verification
  if (isB2b && status === 'verified') {
    return null;
  }
  return (
    <div className="row-actions">
      {status !== 'verified' && (
        <button className="btn-verify" disabled={busy} onClick={onVerify}>
          {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Verify
        </button>
      )}
      <button className="btn-ghost" disabled={busy} onClick={onEdit}><Pencil size={14} /> Edit</button>
      <button className="btn-ghost btn-ghost-red" disabled={busy} onClick={onCancel}><Ban size={14} /> Cancel</button>
    </div>
  );
}

/** Asks for the reason before a cancel. */
export function ReasonSheet({ title, confirmLabel, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('Write a short reason.'); return; }
    setSaving(true);
    try { await onConfirm(reason.trim()); onClose(); } catch (err) { setError(err.message); setSaving(false); }
  };
  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-row">
          <label className="form-label">Reason</label>
          <input className="form-input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate entry, customer cancelled" />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn-danger" type="submit" disabled={saving} style={{ width: '100%' }}>
          {saving ? <Loader2 size={16} className="spin" /> : null} {confirmLabel}
        </button>
      </form>
    </Sheet>
  );
}

const ACTION_LABEL = { create: 'Created', verify: 'Verified', edit: 'Corrected', cancel: 'Cancelled', restore: 'Restored' };

export function HistoryList({ history }) {
  const [open, setOpen] = useState(false);
  if (!history?.length) return null;
  return (
    <div className="history">
      <button className="history-toggle" onClick={() => setOpen(!open)}>
        <History size={12} /> {open ? 'Hide' : 'Show'} history ({history.length})
      </button>
      {open && (
        <ul className="history-list">
          {[...history].reverse().map((h, i) => (
            <li key={i}>
              <strong>{ACTION_LABEL[h.action] || h.action}</strong>
              {' · '}{new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              {h.by && ` · ${h.by.split('@')[0]}`}
              {h.reason && <div className="history-reason">“{h.reason}”</div>}
              {h.changes?.map((c, j) => <div key={j} className="history-change">{c.field}: {c.from} → {c.to}</div>)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
