import React, { useEffect, useMemo, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { saveB2cVerification } from '../../firebase';
import { SERVICE_GROUPS, diffLines, num, round1 } from '../../lib/orders';
import {
  fmtKg, EmptyState, Sheet, StatusBadge, RowActions, ReasonSheet, HistoryList,
  STATUS_FILTERS, matchesFilter,
} from './shared';

const groupLabel = Object.fromEntries(SERVICE_GROUPS.map((g) => [g.id, g.label]));
const isKgLine = (l) => l.group === 'wash_fold' || l.group === 'wash_iron';

function EditSheet({ row, day, onClose }) {
  const [lines, setLines] = useState(() => row.lines.map((l) => ({ ...l })));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (i, field, value) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [field]: value } : l)));

  const submit = async (e) => {
    e.preventDefault();
    const clean = lines.map((l) => ({ ...l, kg: round1(l.kg), qty: num(l.qty) }));
    const changes = diffLines(row.lines, clean);
    if (!changes.length) { setError('Nothing changed. Use Verify if the rider values are correct.'); return; }
    if (!reason.trim()) { setError('Write why you are correcting this.'); return; }
    setSaving(true);
    try {
      await saveB2cVerification(row, day, 'edit', { lines: clean, reason: reason.trim(), changes });
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <Sheet title={`Correct ${row.customer}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="ops-hint">Saving a correction also marks the order verified. The rider's original values are kept in history.</p>
        {lines.map((l, i) => (
          <div className="form-row two-col" key={l.name}>
            <div>
              <label className="form-label">{l.name} <span className="ops-muted">({groupLabel[l.group]})</span></label>
              {isKgLine(l) && (
                <input className="form-input" type="number" step="0.1" min="0" inputMode="decimal"
                  value={l.kg} onChange={(e) => set(i, 'kg', e.target.value)} placeholder="KG" />
              )}
            </div>
            <div>
              <label className="form-label">Clothes</label>
              <input className="form-input" type="number" min="0" inputMode="numeric"
                value={l.qty} onChange={(e) => set(i, 'qty', e.target.value)} />
            </div>
          </div>
        ))}
        <div className="form-row">
          <label className="form-label">Reason for correction</label>
          <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Re-weighed at store: 4.2 kg" />
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="btn-primary" type="submit" disabled={saving} style={{ width: '100%' }}>
          {saving ? <Loader2 size={16} className="spin" /> : null} Save & verify
        </button>
      </form>
    </Sheet>
  );
}

function OrderRow({ row, day, highlight, onEdit, onCancel }) {
  const [busy, setBusy] = useState(false);
  const run = async (action) => {
    setBusy(true);
    try { await saveB2cVerification(row, day, action, { lines: row.lines }); } catch (err) { alert(err.message); }
    setBusy(false);
  };
  return (
    <div className={`card ops-row ${highlight ? 'ops-row-hl' : ''}`} id={`b2c-${row.id}`}>
      <div className="card-top">
        <div>
          <div className="card-name">{row.customer}</div>
          <div className="ops-muted">#{row.id.slice(-6).toUpperCase()} · {row.orderStatus || '—'}</div>
        </div>
        <div className="ops-row-kg">{row.kg > 0 && fmtKg(row.kg)}<div className="ops-muted">{row.clothes} clothes</div></div>
      </div>
      <table className="ops-lines">
        <tbody>
          {row.lines.map((l) => {
            const r = row.rider.find((x) => x.name === l.name);
            const edited = row.corrected && r && (round1(r.kg) !== round1(l.kg) || num(r.qty) !== num(l.qty));
            return (
              <tr key={l.name}>
                <td>{l.name}<span className="ops-muted"> · {groupLabel[l.group]}</span></td>
                <td className="ops-num">
                  {isKgLine(l) && `${round1(l.kg)} kg · `}{l.qty} pcs
                  {edited && <div className="ops-was">rider: {isKgLine(r) && `${round1(r.kg)} kg · `}{r.qty} pcs</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="card-badges">
        <StatusBadge status={row.status} locked={row.locked} />
        {row.corrected && <span className="badge badge-blue">Corrected</span>}
      </div>
      <RowActions status={row.status} locked={row.locked} busy={busy}
        onVerify={() => run('verify')} onRestore={() => run('restore')}
        onEdit={() => onEdit(row)} onCancel={() => onCancel(row)} />
      <HistoryList history={row.verification?.history} />
    </div>
  );
}

export default function B2CTab({ day, rows, focusId }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todo');
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  useEffect(() => {
    if (!focusId) return;
    setFilter('all');
    requestAnimationFrame(() => document.getElementById(`b2c-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [focusId]);

  const counts = useMemo(() => Object.fromEntries(STATUS_FILTERS.map((f) => [f.id, rows.filter((r) => matchesFilter(r.status, f.id)).length])), [rows]);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => matchesFilter(r.status, filter)
      && (!q || r.customer.toLowerCase().includes(q) || r.phone.includes(q) || r.id.toLowerCase().includes(q)));
  }, [rows, search, filter]);

  // Keep the open sheet on the live row.
  const liveEditing = editing && rows.find((r) => r.id === editing.id);

  return (
    <div>
      <div className="toolbar">
        <div className="search-wrap">
          <Search size={16} className="search-icon" />
          <input className="search-input" placeholder="Search name, phone or order ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="chip-row scroll">
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'chip-active' : ''}`} onClick={() => setFilter(f.id)}>{f.label} ({counts[f.id]})</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No rider orders for this day" sub="Orders show here once their pickup is scheduled for this date." />
      ) : list.length === 0 ? (
        <EmptyState title={filter === 'todo' ? 'All orders verified 🎉' : 'No matches'} sub="Try another filter or search." />
      ) : (
        <div className="list">
          {list.map((r) => <OrderRow key={r.id} row={r} day={day} highlight={r.id === focusId} onEdit={setEditing} onCancel={setCancelling} />)}
        </div>
      )}

      {liveEditing && <EditSheet row={liveEditing} day={day} onClose={() => setEditing(null)} />}
      {cancelling && (
        <ReasonSheet title={`Cancel ${cancelling.customer}'s order record`} confirmLabel="Cancel record"
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => saveB2cVerification(cancelling, day, 'cancel', { lines: cancelling.lines, reason })} />
      )}
    </div>
  );
}
