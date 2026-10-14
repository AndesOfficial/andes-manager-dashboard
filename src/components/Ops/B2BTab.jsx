import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Info } from 'lucide-react';
import { addB2bEntry, updateB2bEntry, fetchStoreB2bReference } from '../../firebase';
import { num, round1 } from '../../lib/orders';
import {
  fmtKg, fmtDay, todayStr, EmptyState, Sheet, StatusBadge, RowActions, ReasonSheet, HistoryList,
  STATUS_FILTERS, matchesFilter,
} from './shared';

const EDIT_FIELDS = [['kg', 'KG'], ['clothes', 'Clothes'], ['note', 'Note']];

/** Add (entry = null) or correct an existing B2B entry. */
function EntrySheet({ entry, defaultDate, clients, onClose }) {
  const isEdit = !!entry;
  const [form, setForm] = useState(() => entry
    ? { ...entry, items: entry.items || [] }
    : { client: clients[0] || '', date: defaultDate, batchNo: '1', kg: '', clothes: '', items: [], note: '' });
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setItem = (i, k, v) => set('items', form.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  // Item breakdown, when filled, decides the clothes count.
  const itemTotal = form.items.reduce((s, it) => s + num(it.qty), 0);

  const submit = async (e) => {
    e.preventDefault();
    const items = form.items.filter((it) => it.name.trim() && num(it.qty) > 0).map((it) => ({ name: it.name.trim(), qty: num(it.qty) }));
    const clean = {
      kg: round1(form.kg),
      clothes: items.length ? itemTotal : num(form.clothes),
      items,
      note: form.note.trim(),
    };
    if (!form.client.trim()) { setError('Choose the client.'); return; }
    if (clean.kg <= 0 && clean.clothes <= 0) { setError('Enter the KG or the clothes count.'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const changes = EDIT_FIELDS
          .filter(([k]) => String(entry[k] ?? '') !== String(clean[k]))
          .map(([k, label]) => ({ field: label, from: entry[k] ?? '', to: clean[k] }));
        if (JSON.stringify(entry.items || []) !== JSON.stringify(items)) changes.push({ field: 'Items', from: (entry.items || []).length, to: items.length });
        if (!changes.length) throw new Error('Nothing changed.');
        if (!reason.trim()) throw new Error('Write why you are changing this entry.');
        await updateB2bEntry(entry.id, 'edit', { patch: clean, reason: reason.trim(), changes });
      } else {
        await addB2bEntry({ ...clean, client: form.client.trim(), batchNo: String(form.batchNo || '1').trim(), date: form.date });
      }
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <Sheet title={isEdit ? `Correct ${entry.client}` : 'New B2B entry'} onClose={onClose}>
      <form onSubmit={submit}>
        {isEdit ? (
          <p className="ops-hint">{entry.client} · batch {entry.batchNo} · {fmtDay(entry.date)}. Editing sends it back to “To verify”. To change the client or date, cancel this entry and add a new one.</p>
        ) : (
          <>
          <div className="form-row">
            <label className="form-label">Date</label>
            <input className="form-input" type="date" value={form.date} max={todayStr()} onChange={(e) => set('date', e.target.value)} />
          </div>
          <div className="form-row two-col">
            <div>
              <label className="form-label">Client</label>
              <select className="form-input" value={form.client} onChange={(e) => set('client', e.target.value)}>
                {clients.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Batch / challan no.</label>
              <input className="form-input" value={form.batchNo} onChange={(e) => set('batchNo', e.target.value)} placeholder="1" />
            </div>
          </div>
          </>
        )}
        <div className="form-row two-col">
          <div>
            <label className="form-label">KG</label>
            <input className="form-input" type="number" step="0.1" min="0" inputMode="decimal" value={form.kg} onChange={(e) => set('kg', e.target.value)} autoFocus={!isEdit} />
          </div>
          <div>
            <label className="form-label">Clothes</label>
            <input className="form-input" type="number" min="0" inputMode="numeric"
              value={form.items.length ? itemTotal : form.clothes} disabled={form.items.length > 0}
              onChange={(e) => set('clothes', e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <label className="form-label">Item breakdown <span className="ops-muted">(optional — for per-piece clients)</span></label>
          {form.items.map((it, i) => (
            <div className="ops-item-row" key={i}>
              <input className="form-input" placeholder="Item, e.g. Double bedsheet" value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} />
              <input className="form-input ops-qty" type="number" min="0" inputMode="numeric" placeholder="Qty" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
              <button type="button" className="icon-btn" onClick={() => set('items', form.items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          ))}
          <button type="button" className="chip" onClick={() => set('items', [...form.items, { name: '', qty: '' }])}><Plus size={12} /> Add item</button>
        </div>

        <div className="form-row">
          <label className="form-label">Note</label>
          <input className="form-input" value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Optional" />
        </div>
        {isEdit && (
          <div className="form-row">
            <label className="form-label">Reason for change</label>
            <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Typed 52 instead of 25" />
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="btn-primary" type="submit" disabled={saving} style={{ width: '100%' }}>
          {saving ? <Loader2 size={16} className="spin" /> : null} {isEdit ? 'Save changes' : 'Add entry'}
        </button>
      </form>
    </Sheet>
  );
}

function EntryRow({ entry, onEdit, onCancel }) {
  const [busy, setBusy] = useState(false);
  const run = async (action) => {
    setBusy(true);
    try { await updateB2bEntry(entry.id, action); } catch (err) { alert(err.message); }
    setBusy(false);
  };
  return (
    <div className={`card ops-row ops-st-${entry.status}`}>
      <div className="card-top">
        <div>
          <div className="card-name">{entry.client}</div>
          <div className="ops-muted">{fmtDay(entry.date)} · Batch {entry.batchNo}{entry.note && ` · ${entry.note}`}</div>
        </div>
        <div className="ops-row-kg">{fmtKg(entry.kg)}<div className="ops-muted">{entry.clothes} clothes</div></div>
      </div>
      {entry.items?.length > 0 && (
        <div className="svc-items">{entry.items.map((it) => `${it.name} × ${it.qty}`).join(', ')}</div>
      )}
      <div className="card-badges"><StatusBadge status={entry.status} locked={!!entry.adminLockedAt} /></div>
      <RowActions status={entry.status} locked={!!entry.adminLockedAt} busy={busy}
        onVerify={() => run('verify')} onRestore={() => run('restore')}
        onEdit={() => onEdit(entry)} onCancel={() => onCancel(entry)} />
      <HistoryList history={entry.history} />
    </div>
  );
}

function StoreReference({ range, entries }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchStoreB2bReference(range.from, range.to).then((r) => alive && setRows(r)).catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [range.from, range.to]);
  if (!rows?.length) return null;
  const entered = (client) => entries.filter((e) => e.client === client && e.status !== 'cancelled')
    .reduce((s, e) => s + num(e.clothes), 0);
  return (
    <div className="panel">
      <div className="panel-title"><Info size={14} /> Store app records (for checking only — not counted)</div>
      <table className="ops-lines">
        <thead><tr><th>Client</th><th className="ops-num">Store clothes</th><th className="ops-num">You entered</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const mine = entered(r.client);
            return (
              <tr key={r.client}>
                <td>{r.client} <span className="ops-muted">· {r.orders} order{r.orders === 1 ? '' : 's'}</span></td>
                <td className="ops-num">{r.clothes}</td>
                <td className={`ops-num ${mine !== r.clothes ? 'ops-mismatch' : ''}`}>{mine}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function B2BTab({ range, entries, clients, adding, onAddClose }) {
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const counts = useMemo(() => Object.fromEntries(STATUS_FILTERS.map((f) => [f.id, entries.filter((e) => matchesFilter(e.status, f.id)).length])), [entries]);
  const list = entries.filter((e) => matchesFilter(e.status, filter));

  return (
    <div>
      <div className="chip-row scroll">
        {STATUS_FILTERS.map((f) => (
          <button key={f.id} className={`chip ${filter === f.id ? 'chip-active' : ''}`} onClick={() => setFilter(f.id)}>{f.label} ({counts[f.id]})</button>
        ))}
      </div>
      {entries.length === 0 ? (
        <EmptyState title="No B2B entries for these dates" sub="Tap “Add B2B entry” to log a client batch." />
      ) : list.length === 0 ? (
        <EmptyState title="No matches" sub="Try another filter." />
      ) : (
        <div className="ops-cards">
          {list.map((e) => <EntryRow key={e.id} entry={e} onEdit={setEditing} onCancel={setCancelling} />)}
        </div>
      )}

      <StoreReference range={range} entries={entries} />

      {(adding || editing) && (
        <EntrySheet entry={editing} defaultDate={range.to} clients={clients}
          onClose={() => { setEditing(null); onAddClose(); }} />
      )}
      {cancelling && (
        <ReasonSheet title={`Cancel ${cancelling.client} batch ${cancelling.batchNo}`} confirmLabel="Cancel entry"
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => updateB2bEntry(cancelling.id, 'cancel', { reason })} />
      )}
    </div>
  );
}
