import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Unlink, Loader2, ShoppingBag } from 'lucide-react';
import { subscribeJuteBags, addJuteBag, unassignJuteBag, deleteJuteBag, bagInUse } from '../../firebase';

const FILTERS = [
  { key: 'all', label: 'In the system' },
  { key: 'used', label: 'In use' },
  { key: 'free', label: 'Unassigned' },
];

const fmtWhen = (ts) => {
  const d = ts?.toDate?.();
  return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
};

// Natural sort so "2" < "10" and "ANDES-9" < "ANDES-12".
const byId = (a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });

const describeError = (err) => (err?.code === 'permission-denied' ? 'No permission to change jute bags.' : err?.message || 'Something went wrong.');

export default function JuteBagsSection() {
  const [bags, setBags] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [newId, setNewId] = useState('');
  const [busy, setBusy] = useState(''); // bag id (or 'add') being worked on

  useEffect(() => subscribeJuteBags(
    (list) => setBags(list.sort(byId)),
    (err) => { console.error(err); setError('Could not load jute bags. Check Firestore permissions.'); setBags([]); },
  ), []);

  const used = useMemo(() => (bags || []).filter(bagInUse), [bags]);
  const counts = { all: bags?.length || 0, used: used.length, free: (bags?.length || 0) - used.length };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (bags || []).filter((b) => {
      if (filter === 'used' && !bagInUse(b)) return false;
      if (filter === 'free' && bagInUse(b)) return false;
      if (!q) return true;
      return [b.id, b.current_order_id, b.current_customer_name].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [bags, filter, search]);

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try { await fn(); } catch (err) { console.error(err); setError(describeError(err)); } finally { setBusy(''); }
  };

  const handleAdd = (e) => {
    e.preventDefault();
    run('add', async () => { await addJuteBag(newId); setNewId(''); });
  };
  const handleUnassign = (b) => {
    const who = b.current_customer_name ? ` (${b.current_customer_name})` : '';
    if (!window.confirm(`Unassign bag ${b.id}${who}? It will also be removed from its order.`)) return;
    run(b.id, () => unassignJuteBag(b.id));
  };
  const handleDelete = (b) => {
    if (!window.confirm(`Delete bag ${b.id} from the system? This cannot be undone.`)) return;
    run(b.id, () => deleteJuteBag(b.id));
  };

  return (
    <section className="panel inv-section" id="inv-jutebags">
      <div className="inv-section-head">
        <div className="panel-title" style={{ marginBottom: 0 }}><ShoppingBag size={16} /> Jute bags</div>
        <span className="inv-hint">Live from the rider app</span>
      </div>

      {bags === null ? (
        <div className="loading-state"><Loader2 size={18} className="spin" /><span>Loading bags…</span></div>
      ) : (
        <>
          <div className="jb-stats">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={`jb-stat ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                <strong>{counts[f.key]}</strong><span>{f.label}</span>
              </button>
            ))}
          </div>

          <div className="jb-toolbar">
            <input className="form-input" placeholder="Search bag, order or customer" value={search} onChange={(e) => setSearch(e.target.value)} />
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 220 }}>
              <input className="form-input" placeholder="New bag ID, e.g. ANDES-125" value={newId} onChange={(e) => setNewId(e.target.value)} style={{ margin: 0 }} />
              <button type="submit" className="btn-action-primary" disabled={!newId.trim() || busy === 'add'}>
                {busy === 'add' ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}<span>Add bag</span>
              </button>
            </form>
          </div>

          {error && <div className="form-error" style={{ marginBottom: 10 }}>{error}</div>}

          <div className="jb-list">
            {shown.length === 0 && <div className="inv-hint" style={{ padding: 10 }}>No bags here.</div>}
            {shown.map((b) => {
              const inUse = bagInUse(b);
              return (
                <div key={b.id} className="jb-row">
                  <span>
                    <strong>{b.id}</strong>{' '}
                    {inUse ? <span className="badge badge-amber">In use</span> : <span className="badge badge-green">Free</span>}
                  </span>
                  <em>
                    {inUse
                      ? `${b.current_customer_name || 'Customer'} · order ${b.current_order_id || '—'}${fmtWhen(b.assigned_at) ? ` · since ${fmtWhen(b.assigned_at)}` : ''}`
                      : fmtWhen(b.updated_at) ? `Free since ${fmtWhen(b.updated_at)}` : ''}
                  </em>
                  <span className="jb-actions">
                    {inUse && (
                      <button type="button" className="jb-btn" disabled={!!busy} onClick={() => handleUnassign(b)}>
                        {busy === b.id ? <Loader2 size={12} className="spin" /> : <Unlink size={12} />} Unassign
                      </button>
                    )}
                    <button type="button" className="jb-btn danger" disabled={!!busy || inUse}
                      title={inUse ? 'Unassign before deleting' : 'Delete bag'} onClick={() => handleDelete(b)}>
                      <Trash2 size={12} /> Delete
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
