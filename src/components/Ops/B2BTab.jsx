import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2, Info, Camera, Image as ImageIcon, X } from 'lucide-react';
import { addB2bEntry, updateB2bEntry, fetchStoreB2bReference, uploadB2bPhoto } from '../../firebase';
import { num, round1, calculateB2bBatchRevenue, calculateBatchWeight, isHostel99Client, getDaysInMonth, HOSTEL_99_MONTHLY_REVENUE } from '../../lib/orders';
import {
  fmtKg, fmtDay, todayStr, EmptyState, Sheet, StatusBadge, RowActions, ReasonSheet, HistoryList,
  STATUS_FILTERS, matchesFilter,
} from './shared';

const EDIT_FIELDS = [
  ['kg', 'KG'],
  ['clothes', 'Clothes'],
  ['students', 'Students'],
  ['note', 'Note'],
  ['photoUrl', 'Photo'],
];

export const ONE8_CATALOGUE = [
  'Wiping Cloth',
  'Chef Coat',
  'T-Shirt',
  'Pant',
  'Apron',
  'Napkin',
  'Blazer',
  'Cap',
];

export const ZOLO_CATALOGUE = [
  'Single Bedsheet',
  'Double Bedsheet',
  'Duvet Cover',
  'Pillow Cover',
  'Bath towel',
  'Blanket',
  'Curtain',
  'Door mat',
];

export const STANDARD_B2B_CATALOGUE = [
  'Single Bedsheet',
  'Double Bedsheet',
  'Duvet Cover',
  'Pillow Cover',
  'Bath towel',
  'Blanket',
  'Curtain',
  'Door mat',
];

export function getClientCatalogue(clientName) {
  if (!clientName) return STANDARD_B2B_CATALOGUE;
  const lower = clientName.trim().toLowerCase();
  if (lower.includes('one 8') || lower.includes('one8')) {
    return ONE8_CATALOGUE;
  }
  if (lower.includes('zolo')) {
    return ZOLO_CATALOGUE;
  }
  return STANDARD_B2B_CATALOGUE;
}

/** Add (entry = null) or correct an existing B2B entry. */
function EntrySheet({ entry, defaultDate, clients, onClose }) {
  const isEdit = !!entry;
  const [form, setForm] = useState(() => entry
    ? { ...entry, items: entry.items || [], students: entry.students ?? '', photoUrl: entry.photoUrl || '' }
    : { client: clients[0] || '', date: defaultDate, batchNo: '1', kg: '', clothes: '', students: '', photoUrl: '', items: [], note: '' });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(() => entry?.photoUrl || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const updateItems = (newItems) => {
    const isLinenOrH99 = isHostel99Client(form.client) || String(form.client || '').toLowerCase().includes('zolo');
    const autoWeight = calculateBatchWeight(newItems);
    setForm((f) => ({
      ...f,
      items: newItems,
      kg: (isLinenOrH99 && autoWeight > 0) ? autoWeight : (autoWeight > 0 && (!f.kg || f.kg === '0' || f.kg === '') ? autoWeight : f.kg),
    }));
  };

  const setItem = (i, k, v) => {
    const updated = form.items.map((it, j) => (j === i ? { ...it, [k]: v } : it));
    updateItems(updated);
  };

  const clientCatalogue = useMemo(() => getClientCatalogue(form.client), [form.client]);

  // Item breakdown, when filled, decides the clothes count.
  const itemTotal = form.items.reduce((s, it) => s + num(it.qty), 0);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose a valid image file (PNG, JPG, WebP).');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
    set('photoUrl', '');
  };

  const addFromCatalogue = (itemName) => {
    const existingIndex = form.items.findIndex((it) => it.name.toLowerCase() === itemName.toLowerCase());
    let updated;
    if (existingIndex >= 0) {
      updated = form.items.map((it, idx) => idx === existingIndex ? { ...it, qty: num(it.qty) + 1 } : it);
    } else {
      updated = [...form.items, { name: itemName, qty: 1 }];
    }
    updateItems(updated);
  };

  const prefillCatalogue = () => {
    const existingNames = new Set(form.items.map((it) => it.name.toLowerCase()));
    const newItems = [...form.items];
    clientCatalogue.forEach((name) => {
      if (!existingNames.has(name.toLowerCase())) {
        newItems.push({ name, qty: '' });
      }
    });
    updateItems(newItems);
  };

  const submit = async (e) => {
    e.preventDefault();
    const items = form.items.filter((it) => it.name.trim() && num(it.qty) > 0).map((it) => ({ name: it.name.trim(), qty: num(it.qty) }));
    if (!form.client.trim()) { setError('Choose the client.'); return; }
    if (round1(form.kg) <= 0 && (items.length ? itemTotal : num(form.clothes)) <= 0) {
      setError('Enter the KG or the clothes count.'); return;
    }

    setSaving(true);
    let photoUrl = form.photoUrl || '';
    if (photoFile) {
      setUploadingPhoto(true);
      try {
        const res = await uploadB2bPhoto(photoFile, `b2b_entries/${form.date}`);
        photoUrl = res.url;
      } catch (uploadErr) {
        setError(`Photo upload failed: ${uploadErr.message}`);
        setSaving(false);
        setUploadingPhoto(false);
        return;
      }
      setUploadingPhoto(false);
    }

    const clean = {
      kg: round1(form.kg),
      clothes: items.length ? itemTotal : num(form.clothes),
      students: num(form.students) || 0,
      photoUrl: photoUrl || '',
      items,
      note: form.note.trim(),
    };

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
          <label className="form-label">Number of students <span className="ops-muted">(Hostels / Colleges)</span></label>
          <input className="form-input" type="number" min="0" inputMode="numeric"
            value={form.students || ''} onChange={(e) => set('students', e.target.value)} placeholder="e.g. 120 (optional)" />
        </div>

        <div className="form-row">
          <label className="form-label">Challan / Clothes Photo</label>
          {photoPreview ? (
            <div className="b2b-photo-preview-wrap">
              <img src={photoPreview} alt="Challan preview" className="b2b-photo-thumb" />
              <div className="b2b-photo-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <label className="btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Camera size={14} /> Camera
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                </label>
                <label className="btn-ghost" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ImageIcon size={14} /> Gallery
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                </label>
                <button type="button" className="btn-ghost" style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={removePhoto}>
                  <Trash2 size={14} /> Remove photo
                </button>
              </div>
            </div>
          ) : (
            <div className="b2b-photo-dropzone" style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Camera size={22} className="ops-muted" />
                <span style={{ color: '#cbd5e1' }}>|</span>
                <ImageIcon size={22} className="ops-muted" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <span className="b2b-photo-dropzone-title" style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  Add Challan / Clothes Photo
                </span>
                <span className="ops-muted" style={{ fontSize: 12 }}>Attach receipt or clothes photo (optional)</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4, width: '100%', maxWidth: 280 }}>
                <label className="btn-secondary" style={{ flex: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, padding: '7px 10px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                  <Camera size={14} /> Take Photo
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                </label>
                <label className="btn-secondary" style={{ flex: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, padding: '7px 10px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 600 }}>
                  <ImageIcon size={14} /> Gallery
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoSelect} />
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="form-row">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>
              Item breakdown <span className="ops-muted">({form.client ? `${form.client} catalogue` : 'catalogue or manual'})</span>
            </label>
            <button type="button" className="chip" onClick={prefillCatalogue} style={{ fontSize: 11 }}>
              Pre-fill catalogue
            </button>
          </div>

          <datalist id="b2b-items-catalogue">
            {clientCatalogue.map((catName) => (
              <option key={catName} value={catName} />
            ))}
          </datalist>

          {/* Quick-add chips from catalogue */}
          <div className="chip-row scroll" style={{ marginBottom: 8, paddingBottom: 4 }}>
            {clientCatalogue.map((catItem) => (
              <button
                key={catItem}
                type="button"
                className="chip"
                onClick={() => addFromCatalogue(catItem)}
                title={`Add ${catItem}`}
              >
                <Plus size={11} /> {catItem}
              </button>
            ))}
          </div>

          {form.items.map((it, i) => (
            <div className="ops-item-row" key={i}>
              <input
                className="form-input"
                list="b2b-items-catalogue"
                placeholder="Item (catalogue or type custom)"
                value={it.name}
                onChange={(e) => setItem(i, 'name', e.target.value)}
              />
              <input
                className="form-input ops-qty"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="Qty"
                value={it.qty}
                onChange={(e) => setItem(i, 'qty', e.target.value)}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => updateItems(form.items.filter((_, j) => j !== i))}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}

          <button
            type="button"
            className="chip"
            onClick={() => set('items', [...form.items, { name: '', qty: '' }])}
          >
            <Plus size={12} /> Add custom item
          </button>
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
          {saving ? <Loader2 size={16} className="spin" /> : null}{' '}
          {uploadingPhoto ? 'Uploading photo...' : isEdit ? 'Save changes' : 'Add entry'}
        </button>
      </form>
    </Sheet>
  );
}

function PhotoModal({ url, title, onClose }) {
  if (!url) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 100 }}>
      <div className="modal-sheet photo-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title || 'Challan Photo'}</div>
          <button type="button" className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center', padding: 16 }}>
          <img src={url} alt={title || 'Challan'} className="b2b-lightbox-img" />
        </div>
      </div>
    </div>
  );
}

function EntryRow({ entry, countOnDate = 1, onEdit, onCancel, onZoomPhoto }) {
  const [busy, setBusy] = useState(false);
  const run = async (action) => {
    setBusy(true);
    try { await updateB2bEntry(entry.id, action); } catch (err) { alert(err.message); }
    setBusy(false);
  };

  const isH99 = isHostel99Client(entry.client);
  const isOne8 = String(entry.client || '').toLowerCase().includes('one 8') || String(entry.client || '').toLowerCase().includes('one8');
  const isZolo = String(entry.client || '').toLowerCase().includes('zolo');

  return (
    <div className={`card ops-row ops-st-${entry.status}`}>
      <div className="card-top">
        <div>
          <div className="card-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{entry.client}</span>
            {isH99 && (
              <span className="badge badge-purple" style={{ fontSize: 10, padding: '1px 6px' }}>Hostel 99</span>
            )}
          </div>
          <div className="ops-muted">
            {fmtDay(entry.date)} · Batch {entry.batchNo}
            {entry.students > 0 && ` · ${entry.students} students`}
            {entry.note && ` · ${entry.note}`}
          </div>
        </div>
        <div className="ops-row-kg">
          <div style={{ color: '#0f172a', fontWeight: 800, fontSize: 16 }}>
            {fmtKg(entry.kg)}
          </div>
          <div className="ops-muted">{entry.clothes} pcs</div>
        </div>
      </div>
      {entry.items?.length > 0 && (
        <div className="svc-items">{entry.items.map((it) => `${it.name} × ${it.qty}`).join(', ')}</div>
      )}
      <div className="card-badges">
        <StatusBadge status={entry.status} locked={!!entry.adminLockedAt} />
        {entry.students > 0 && <span className="badge badge-purple">{entry.students} students</span>}
        {entry.photoUrl && (
          <button
            type="button"
            className="b2b-photo-pill"
            onClick={() => onZoomPhoto(entry.photoUrl, `${entry.client} (Batch ${entry.batchNo})`)}
            title="Click to view challan photo"
          >
            <Camera size={12} /> Challan Photo
          </button>
        )}
      </div>
      <RowActions status={entry.status} locked={!!entry.adminLockedAt} busy={busy} isB2b={true}
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
  const [zoomPhoto, setZoomPhoto] = useState(null);

  const clientList = useMemo(() => Array.from(new Set([
    ...(clients || []),
    'One 8',
    'Zolo stays',
    ...entries.map((e) => e.client),
  ])).filter(Boolean).sort(), [clients, entries]);

  const h99CountsByDate = useMemo(() => {
    const counts = {};
    entries.forEach((e) => {
      if (isHostel99Client(e.client) && e.status !== 'cancelled') {
        const d = e.date || 'unknown';
        counts[d] = (counts[d] || 0) + 1;
      }
    });
    return counts;
  }, [entries]);

  const counts = useMemo(() => Object.fromEntries(STATUS_FILTERS.map((f) => [f.id, entries.filter((e) => matchesFilter(e.status, f.id)).length])), [entries]);
  const list = entries.filter((e) => matchesFilter(e.status, filter));

  const summary = useMemo(() => {
    const live = list.filter((e) => e.status !== 'cancelled');
    let totalKg = 0;
    let totalClothes = 0;
    let totalStudents = 0;

    live.forEach((e) => {
      totalKg += num(e.kg);
      totalClothes += num(e.clothes);
      totalStudents += num(e.students);
    });

    return {
      kg: round1(totalKg),
      clothes: totalClothes,
      students: totalStudents,
      verified: live.filter((e) => e.status === 'verified').length,
      entries: live.length,
    };
  }, [list]);

  return (
    <div>
      {/* Top B2B KPI Summary Strip (Operations Only) */}
      <div className="b2c-metrics-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(4, 1fr)', background: '#ffffff' }}>
        <div className="b2c-metric-cell">
          <span className="b2c-metric-val">{summary.entries}</span>
          <span className="b2c-metric-lbl">Total Batches</span>
        </div>
        <div className="b2c-metric-cell">
          <span className="b2c-metric-val">{fmtKg(summary.kg)}</span>
          <span className="b2c-metric-lbl">Total Weight</span>
        </div>
        <div className="b2c-metric-cell">
          <span className="b2c-metric-val">{summary.clothes} pcs</span>
          <span className="b2c-metric-lbl">Total Clothes</span>
        </div>
        <div className="b2c-metric-cell">
          <span className="b2c-metric-val">{summary.verified} / {summary.entries}</span>
          <span className="b2c-metric-lbl">Verified Batches</span>
        </div>
      </div>

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
          {list.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              countOnDate={isHostel99Client(e.client) ? (h99CountsByDate[e.date] || 1) : 1}
              onEdit={setEditing}
              onCancel={setCancelling}
              onZoomPhoto={(url, title) => setZoomPhoto({ url, title })}
            />
          ))}
        </div>
      )}

      <StoreReference range={range} entries={entries} />

      {(adding || editing) && (
        <EntrySheet entry={editing} defaultDate={range.to} clients={clientList}
          onClose={() => { setEditing(null); onAddClose(); }} />
      )}
      {cancelling && (
        <ReasonSheet title={`Cancel ${cancelling.client} batch ${cancelling.batchNo}`} confirmLabel="Cancel entry"
          onClose={() => setCancelling(null)}
          onConfirm={(reason) => updateB2bEntry(cancelling.id, 'cancel', { reason })} />
      )}
      {zoomPhoto && (
        <PhotoModal
          url={zoomPhoto.url}
          title={zoomPhoto.title}
          onClose={() => setZoomPhoto(null)}
        />
      )}
    </div>
  );
}
