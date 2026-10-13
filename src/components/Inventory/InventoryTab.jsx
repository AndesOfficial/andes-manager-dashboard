import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Save, Loader2, AlertTriangle, Sparkles, Bike, Zap, Droplets, Check, X, Plus,
} from 'lucide-react';
import { subscribeInventoryLogs, saveInventoryLog } from '../../firebase';
import JuteBagsSection from './JuteBagsSection';
import { STOCK_SECTIONS, CLEANLINESS_AREAS, VEHICLES } from '../../config/inventoryItems';

/* ---------------- helpers ---------------- */

const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const shiftDate = (date, days) => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const isBlank = (v) => v === '' || v === null || v === undefined;
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const round = (n) => Math.round(n * 100) / 100;
const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

const emptyLog = () => {
  const log = {
    water: { filled: '', used: '', remaining: '' },
    cleanliness: {}, vehicles: {}, vehicleIssues: '',
    electricity: { start: '', end: '' }, notes: '',
  };
  STOCK_SECTIONS.forEach((s) => {
    log[s.key] = {};
    s.items.forEach((it) => { log[s.key][it.key] = { added: '', used: '', remaining: '', manual: false }; });
  });
  return log;
};

// Merge a saved doc over an empty log so new config items still render.
const hydrate = (saved) => {
  const base = emptyLog();
  if (!saved) return base;
  const out = { ...base, ...saved };
  STOCK_SECTIONS.forEach((s) => {
    out[s.key] = { ...base[s.key] };
    s.items.forEach((it) => { out[s.key][it.key] = { ...base[s.key][it.key], ...(saved[s.key]?.[it.key] || {}) }; });
  });
  out.water = { ...base.water, ...(saved.water || {}) };
  out.electricity = { ...base.electricity, ...(saved.electricity || {}) };
  return out;
};

const remainingOf = (row, opening) => (
  row.manual && !isBlank(row.remaining)
    ? num(row.remaining)
    : round(opening + num(row.added) - num(row.used))
);

const stockStatus = (remaining, item) => (
  remaining < 0 ? 'neg' : remaining <= item.lowAt ? 'low' : 'ok'
);

/* ---------------- small UI pieces ---------------- */

function Widget({ tone, icon, label, value, sub }) {
  return (
    <div className={`widget-card widget-${tone}`}>
      <div className="widget-header">
        <span className="widget-label">{label}</span>
        <div className={`widget-circle-icon icon-${tone}`}>{icon}</div>
      </div>
      <div className="widget-value">{value}</div>
      {sub && <div className="inv-widget-sub">{sub}</div>}
    </div>
  );
}

function NumInput({ value, onChange, placeholder = '0', ...rest }) {
  return (
    <input
      className="form-input inv-num" type="number" inputMode="decimal" min="0" step="any"
      value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onWheel={(e) => e.currentTarget.blur()}
      {...rest}
    />
  );
}

// Stock added during the day is logged as entries via the row's + button;
// `added` is their total.
const addsOf = (row) => (Array.isArray(row.adds) ? row.adds : []);

function StockRow({ item, row, opening, onChange }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const remaining = remainingOf(row, opening);
  const status = stockStatus(remaining, item);
  const adds = addsOf(row);
  // Days saved before entries existed only have a total.
  const legacy = adds.length === 0 && num(row.added) > 0 ? num(row.added) : 0;

  const setAdds = (next) => onChange({ adds: next, added: round(next.reduce((t, e) => t + num(e.qty), 0)) });
  const addEntry = () => {
    if (!(num(qty) > 0)) return;
    const base = legacy ? [{ qty: legacy, note: 'Earlier entry', at: '' }] : adds;
    setAdds([...base, {
      qty: num(qty), note: note.trim(),
      at: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
    }]);
    setQty(''); setNote(''); setOpen(false);
  };

  return (
    <div className={`inv-rowwrap inv-row-${status}`}>
      <div className="inv-tr">
        <span className="inv-item">
          <strong>{item.label}</strong>
          <em>{item.unit}</em>
          {status === 'low' && <span className="badge badge-amber">Low</span>}
          {status === 'neg' && <span className="badge badge-red">Check</span>}
        </span>
        <span className="inv-cell" data-label="Opening"><span className="inv-static">{opening}</span></span>
        <span className="inv-cell" data-label="Added"><span className="inv-static">{num(row.added) > 0 ? `+${num(row.added)}` : '—'}</span></span>
        <span className="inv-cell" data-label="Used">
          <NumInput value={row.used} onChange={(v) => onChange({ used: v })} />
        </span>
        <span className="inv-cell" data-label="Remaining">
          <NumInput
            value={row.manual ? row.remaining : remaining}
            className={`form-input inv-num ${row.manual ? 'inv-manual' : 'inv-auto'}`}
            title="Auto-calculated. Type to override after a physical count."
            onChange={(v) => onChange({ remaining: v, manual: v !== '' })}
          />
        </span>
        <span className="inv-cell inv-plus-cell">
          <button type="button" className={`inv-plus ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)}
            title={`Add ${item.label} stock`} aria-label={`Add ${item.label} stock`}>
            <Plus size={16} />
          </button>
        </span>
      </div>
      {(open || adds.length > 0) && (
        <div className="inv-adds">
          {adds.map((e, i) => (
            <span key={i} className="inv-add-chip">
              +{e.qty} {item.unit}{e.note ? ` · ${e.note}` : ''}{e.at ? ` · ${e.at}` : ''}
              <button type="button" aria-label="Remove entry" onClick={() => setAdds(adds.filter((_, j) => j !== i))}><X size={12} /></button>
            </span>
          ))}
          {open && (
            <span className="inv-add-form">
              <NumInput value={qty} onChange={setQty} placeholder={`Qty (${item.unit})`} autoFocus
                onKeyDown={(e) => e.key === 'Enter' && addEntry()} />
              <input className="form-input" value={note} placeholder="Note (optional)" onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addEntry()} />
              <button type="button" className="btn-action-primary" onClick={addEntry} disabled={!(num(qty) > 0)}>Add</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function StockSection({ section, rows, openings, onChange }) {
  return (
    <section className="panel inv-section" id={`inv-${section.key}`}>
      <div className="inv-section-head">
        <div className="panel-title" style={{ marginBottom: 0 }}>{section.label}</div>
        <span className="inv-hint">Tap + to log stock added · Remaining = opening + added − used</span>
      </div>
      <div className="inv-table">
        <div className="inv-tr inv-th">
          <span>Item</span><span>Opening</span><span>Added</span><span>Used</span><span>Remaining</span><span />
        </div>
        {section.items.map((item) => (
          <StockRow key={item.key} item={item} row={rows[item.key]} opening={openings[item.key] ?? 0}
            onChange={(patch) => onChange(item.key, patch)} />
        ))}
      </div>
    </section>
  );
}

function Toggle({ value, yes, no, onChange }) {
  return (
    <div className="toggle-seg">
      <button type="button" className={value === true ? 'on-yes' : ''} onClick={() => onChange(true)}><Check size={14} /> {yes}</button>
      <button type="button" className={value === false ? 'on-no' : ''} onClick={() => onChange(false)}><X size={14} /> {no}</button>
    </div>
  );
}

/* ---------------- main tab ---------------- */

export default function InventoryTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(todayStr());
  const [log, setLog] = useState(emptyLog());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => subscribeInventoryLogs(
    (list) => { setLogs(list); setLoading(false); },
    (err) => { console.error(err); setError('Could not load inventory logs. Check Firestore permissions.'); setLoading(false); },
  ), []);

  const savedForDate = logs.find((l) => l.id === date) || null;
  const prevLog = logs.find((l) => l.id < date) || null; // logs are newest first

  // Load the selected day whenever it changes (or arrives from Firestore), unless editing.
  useEffect(() => {
    if (dirty) return;
    setLog(hydrate(savedForDate));
    setSavedAt(savedForDate?.updatedAt?.toDate?.() || null);
  }, [date, savedForDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Opening stock = previous day's remaining.
  const openings = useMemo(() => {
    const out = {};
    STOCK_SECTIONS.forEach((s) => {
      out[s.key] = {};
      s.items.forEach((it) => { out[s.key][it.key] = num(prevLog?.[s.key]?.[it.key]?.remaining); });
    });
    return out;
  }, [prevLog]);

  const edit = (fn) => { setLog((l) => fn(structuredClone(l))); setDirty(true); };
  const changeDate = (d) => {
    if (!d || d === date) return;
    if (dirty && !window.confirm('You have unsaved changes for this day. Discard them?')) return;
    setDirty(false);
    setDate(d);
  };

  /* summary numbers */
  const lowItems = [];
  STOCK_SECTIONS.forEach((s) => s.items.forEach((it) => {
    const r = remainingOf(log[s.key][it.key], openings[s.key][it.key]);
    if (stockStatus(r, it) !== 'ok') lowItems.push(it.label);
  }));
  const cleanDone = CLEANLINESS_AREAS.filter((a) => log.cleanliness[a.key] === true).length;
  const charged = VEHICLES.filter((v) => log.vehicles[v.key] === true).length;
  const elecStart = log.electricity.start;
  const elecEnd = log.electricity.end;
  const units = !isBlank(elecStart) && !isBlank(elecEnd) ? round(num(elecEnd) - num(elecStart)) : null;
  const waterRemaining = !isBlank(log.water.remaining)
    ? num(log.water.remaining) : round(num(log.water.filled) - num(log.water.used));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const data = structuredClone(log);
      STOCK_SECTIONS.forEach((s) => s.items.forEach((it) => {
        const row = data[s.key][it.key];
        row.opening = openings[s.key][it.key];
        row.remaining = remainingOf(row, row.opening);
      }));
      data.water.remaining = waterRemaining;
      data.electricity.units = units;
      if (savedForDate?.createdAt) data.createdAt = savedForDate.createdAt;
      await saveInventoryLog(date, data);
      setDirty(false);
      setSavedAt(new Date());
    } catch (err) {
      console.error(err);
      setError('Save failed: ' + (err.code === 'permission-denied' ? 'no permission to write inventory logs.' : err.message));
    } finally {
      setSaving(false);
    }
  };

  const jump = (key) => document.getElementById(`inv-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (loading) {
    return <div className="loading-state"><Loader2 size={22} className="spin" /><span>Loading inventory…</span></div>;
  }

  const isToday = date === todayStr();

  return (
    <div className="inv-page">
      {/* date bar */}
      <div className="inv-datebar">
        <div className="inv-date-nav">
          <button className="icon-btn" onClick={() => changeDate(shiftDate(date, -1))} title="Previous day"><ChevronLeft size={18} /></button>
          <input className="form-input inv-date" type="date" value={date} max={todayStr()} onChange={(e) => changeDate(e.target.value)} />
          <button className="icon-btn" onClick={() => changeDate(shiftDate(date, 1))} disabled={isToday} title="Next day"><ChevronRight size={18} /></button>
          {!isToday && <button className="chip" onClick={() => changeDate(todayStr())}>Today</button>}
        </div>
        <div className="inv-save-wrap">
          {dirty
            ? <span className="badge badge-amber">Unsaved changes</span>
            : savedAt
              ? <span className="badge badge-green">Saved {savedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
              : <span className="badge badge-gray">Not logged yet</span>}
          <button className="btn-action-primary" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            <span>Save day</span>
          </button>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
      {!prevLog && <div className="inv-note">No earlier log found, so opening stock starts at 0. Use the <b>+</b> button on a row to log today's stock.</div>}

      {/* summary */}
      <div className="overview-widgets-grid">
        <Widget tone="red" icon={<AlertTriangle size={18} />} label="Low stock" value={lowItems.length}
          sub={lowItems.length ? lowItems.slice(0, 3).join(', ') + (lowItems.length > 3 ? ` +${lowItems.length - 3}` : '') : 'All stocked'} />
        <Widget tone="green" icon={<Sparkles size={18} />} label="Cleanliness" value={`${cleanDone}/${CLEANLINESS_AREAS.length}`} sub="areas cleaned" />
        <Widget tone="purple" icon={<Bike size={18} />} label="Vehicles charged" value={`${charged}/${VEHICLES.length}`} sub={log.vehicleIssues ? 'Issue reported' : 'No issues'} />
        <Widget tone="blue" icon={<Zap size={18} />} label="Electricity" value={units === null ? '—' : `${units} units`} sub={`Water left: ${waterRemaining} L`} />
      </div>

      {/* section jump chips */}
      <div className="chip-row scroll inv-chips">
        {[['jutebags', 'Jute bags'], ...STOCK_SECTIONS.map((s) => [s.key, s.label]), ['water', 'Water'], ['cleanliness', 'Cleanliness'], ['vehicles', 'Vehicles'], ['electricity', 'Electricity'], ['history', 'History']]
          .map(([k, l]) => <button key={k} className="chip" onClick={() => jump(k)}>{l}</button>)}
      </div>

      <JuteBagsSection />

      {STOCK_SECTIONS.slice(0, 2).map((s) => (
        <StockSection key={s.key} section={s} rows={log[s.key]} openings={openings[s.key]}
          onChange={(item, patch) => edit((l) => { Object.assign(l[s.key][item], patch); return l; })} />
      ))}

      {/* water */}
      <section className="panel inv-section" id="inv-water">
        <div className="panel-title"><Droplets size={16} /> Water log</div>
        <div className="form-row three-col" style={{ marginBottom: 0 }}>
          <div>
            <label className="form-label">Water filled (L)</label>
            <NumInput value={log.water.filled} onChange={(v) => edit((l) => { l.water.filled = v; return l; })} />
          </div>
          <div>
            <label className="form-label">Water used (L)</label>
            <NumInput value={log.water.used} onChange={(v) => edit((l) => { l.water.used = v; return l; })} />
          </div>
          <div>
            <label className="form-label">Remaining (L)</label>
            <NumInput value={isBlank(log.water.remaining) ? waterRemaining : log.water.remaining}
              className="form-input inv-num inv-auto"
              onChange={(v) => edit((l) => { l.water.remaining = v; return l; })} />
          </div>
        </div>
      </section>

      {STOCK_SECTIONS.slice(2).map((s) => (
        <StockSection key={s.key} section={s} rows={log[s.key]} openings={openings[s.key]}
          onChange={(item, patch) => edit((l) => { Object.assign(l[s.key][item], patch); return l; })} />
      ))}

      {/* cleanliness */}
      <section className="panel inv-section" id="inv-cleanliness">
        <div className="inv-section-head">
          <div className="panel-title" style={{ marginBottom: 0 }}>Cleanliness log</div>
          <button className="chip" onClick={() => edit((l) => { CLEANLINESS_AREAS.forEach((a) => { l.cleanliness[a.key] = true; }); return l; })}>
            Mark all cleaned
          </button>
        </div>
        <div className="inv-check-grid">
          {CLEANLINESS_AREAS.map((a) => (
            <div key={a.key} className="check-tile">
              <span>{a.label}</span>
              <Toggle value={log.cleanliness[a.key]} yes="Cleaned" no="Not cleaned"
                onChange={(v) => edit((l) => { l.cleanliness[a.key] = v; return l; })} />
            </div>
          ))}
        </div>
      </section>

      {/* vehicles */}
      <section className="panel inv-section" id="inv-vehicles">
        <div className="panel-title">Vehicle log</div>
        <div className="inv-check-grid">
          {VEHICLES.map((v) => (
            <div key={v.key} className="check-tile">
              <span>{v.label} <em className="inv-sub">charged?</em></span>
              <Toggle value={log.vehicles[v.key]} yes="Yes" no="No"
                onChange={(val) => edit((l) => { l.vehicles[v.key] = val; return l; })} />
            </div>
          ))}
        </div>
        <div className="form-row" style={{ marginTop: 14, marginBottom: 0 }}>
          <label className="form-label">Issues if any</label>
          <textarea className="form-input" rows={2} placeholder="e.g. Scooty 2 brake loose"
            value={log.vehicleIssues} onChange={(e) => { const v = e.target.value; edit((l) => { l.vehicleIssues = v; return l; }); }} />
        </div>
      </section>

      {/* electricity */}
      <section className="panel inv-section" id="inv-electricity">
        <div className="panel-title"><Zap size={16} /> Electricity log</div>
        <div className="form-row three-col" style={{ marginBottom: 0 }}>
          <div>
            <label className="form-label">Start reading</label>
            <NumInput value={log.electricity.start} onChange={(v) => edit((l) => { l.electricity.start = v; return l; })} />
          </div>
          <div>
            <label className="form-label">End reading</label>
            <NumInput value={log.electricity.end} onChange={(v) => edit((l) => { l.electricity.end = v; return l; })} />
          </div>
          <div>
            <label className="form-label">Units used</label>
            <div className={`inv-static inv-units ${units !== null && units < 0 ? 'inv-bad' : ''}`}>
              {units === null ? '—' : units < 0 ? 'End < start' : units}
            </div>
          </div>
        </div>
      </section>

      <section className="panel inv-section">
        <label className="form-label">Notes for the day</label>
        <textarea className="form-input" rows={2} placeholder="Anything else to report"
          value={log.notes} onChange={(e) => { const v = e.target.value; edit((l) => { l.notes = v; return l; }); }} />
      </section>

      {/* history */}
      <section className="panel inv-section" id="inv-history">
        <div className="panel-title">Recent days</div>
        {logs.length === 0 ? (
          <div className="inv-hint">No days logged yet.</div>
        ) : (
          <div className="inv-history">
            {logs.slice(0, 14).map((h) => {
              const clean = CLEANLINESS_AREAS.filter((a) => h.cleanliness?.[a.key] === true).length;
              const low = STOCK_SECTIONS.reduce((n, s) => n + s.items.filter((it) => {
                const r = h[s.key]?.[it.key]?.remaining;
                return !isBlank(r) && stockStatus(num(r), it) !== 'ok';
              }).length, 0);
              return (
                <button key={h.id} className={`inv-history-row ${h.id === date ? 'active' : ''}`} onClick={() => changeDate(h.id)}>
                  <strong>{fmtDay(h.id)}</strong>
                  <span>Clean {clean}/{CLEANLINESS_AREAS.length}</span>
                  <span>{h.electricity?.units ?? '—'} units</span>
                  {low ? <span className="badge badge-amber">{low} low</span> : <span className="badge badge-green">Stocked</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* sticky mobile save */}
      {dirty && (
        <div className="inv-mobile-save">
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
            {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : <><Save size={16} /> Save {fmtDay(date)}</>}
          </button>
        </div>
      )}
    </div>
  );
}
