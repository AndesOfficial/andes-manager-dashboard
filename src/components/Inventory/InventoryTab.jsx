import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Save, Loader2, AlertTriangle, Sparkles, Zap, Check, X, Plus, RotateCcw, Trash2,
} from 'lucide-react';
import { subscribeInventoryLogs, saveInventoryLog, deleteInventoryLog, clearAllInventoryLogs } from '../../firebase';
import JuteBagsSection from './JuteBagsSection';
import { STOCK_SECTIONS, CLEANLINESS_AREAS } from '../../config/inventoryItems';

/* ---------------- helpers ---------------- */

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const shiftDate = (dateStr, days) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d + days, 12, 0, 0);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
};
const isWednesday = (dStr) => {
  if (!dStr) return false;
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return false;
  // Day 3 is Wednesday (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat) in all timezones
  return new Date(y, m - 1, d, 12, 0, 0).getDay() === 3;
};
const getLastWednesday = (dStr) => {
  const [y, m, d] = String(dStr || todayStr()).slice(0, 10).split('-').map(Number);
  const cur = new Date(y, m - 1, d, 12, 0, 0);
  const day = cur.getDay();
  const diff = (day - 3 + 7) % 7;
  const target = new Date(cur.getTime() - (diff === 0 ? 0 : diff) * 86400000);
  const ty = target.getFullYear();
  const tm = String(target.getMonth() + 1).padStart(2, '0');
  const td = String(target.getDate()).padStart(2, '0');
  return `${ty}-${tm}-${td}`;
};
const isBlank = (v) => v === '' || v === null || v === undefined;
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const round = (n) => Math.round(n * 100) / 100;
const fmtDay = (dStr) => {
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
const fmtRowDate = (dStr) => {
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const emptyLog = () => {
  const log = {
    cleanliness: {},
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
  out.electricity = { ...base.electricity, ...(saved.electricity || {}) };
  return out;
};

const remainingOf = (row, opening) => {
  if (row.manual && !isBlank(row.remaining)) return num(row.remaining);
  if (isBlank(row.used) && isBlank(row.added) && opening === 0) return '';
  return round(opening + num(row.added) - num(row.used));
};

const stockStatus = (remaining, item) => {
  if (isBlank(remaining)) return 'ok';
  return remaining < 0 ? 'neg' : remaining <= item.lowAt ? 'low' : 'ok';
};

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

function NumInput({ value, onChange, placeholder = '—', ...rest }) {
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

function StockRow({ item, row, opening, date, onChange, inputRemainingMode = false }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const adds = addsOf(row);
  const hasInv = opening > 0 || !isBlank(row.added) || adds.length > 0;
  const inventory = hasInv ? round(opening + num(row.added)) : '—';

  // If inputRemainingMode (chemicals, stain removers):
  // manager enters remaining. used = inventory - remaining.
  // If standard mode (packaging, other):
  // manager enters used. remaining = inventory - used.
  const remaining = inputRemainingMode
    ? (!isBlank(row.remaining) ? num(row.remaining) : (hasInv ? inventory : ''))
    : remainingOf(row, opening);

  const calculatedUsed = inputRemainingMode
    ? (!isBlank(row.remaining) && hasInv
        ? round(num(inventory) - num(row.remaining))
        : (!isBlank(row.used) ? row.used : '—'))
    : row.used;

  const status = stockStatus(remaining, item);
  // Days saved before entries existed only have a total.
  const legacy = adds.length === 0 && num(row.added) > 0 ? num(row.added) : 0;

  const setAdds = (next) => {
    const nextAdded = round(next.reduce((t, e) => t + num(e.qty), 0));
    const nextInv = round(opening + nextAdded);
    const patch = { adds: next, added: nextAdded };
    if (inputRemainingMode && !isBlank(row.remaining)) {
      patch.used = round(nextInv - num(row.remaining));
    }
    onChange(patch);
  };

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
        <span className="inv-item col-item">
          <strong>{item.label}</strong>
          <em>{item.unit}</em>
          {status === 'low' && <span className="badge badge-amber">Low</span>}
          {status === 'neg' && <span className="badge badge-red">Check</span>}
        </span>
        <span className="inv-cell col-date" data-label="Date">
          <span className="inv-date-cell">{fmtRowDate(date)}</span>
        </span>
        <span className="inv-cell col-inv" data-label="Inventory">
          <span className="inv-badge-cell">{inventory}</span>
        </span>
        <span className="inv-cell col-used" data-label="Used">
          {inputRemainingMode ? (
            <span className="inv-badge-cell inv-auto-used" title="Auto-calculated (Inventory − Remaining)">
              {calculatedUsed}
            </span>
          ) : (
            <NumInput value={row.used ?? ''} placeholder="—" onChange={(v) => onChange({ used: v })} />
          )}
        </span>
        <span className="inv-cell col-rem" data-label="Remaining">
          {inputRemainingMode ? (
            <NumInput
              value={row.remaining ?? ''}
              className="form-input inv-num"
              placeholder="—"
              title="Enter current physical count / remaining stock."
              onChange={(v) => {
                const invVal = hasInv ? round(opening + num(row.added)) : 0;
                const usedVal = !isBlank(v) ? round(invVal - num(v)) : '';
                onChange({ remaining: v, used: usedVal, manual: true });
              }}
            />
          ) : (
            <NumInput
              value={row.manual ? (row.remaining ?? '') : (remaining !== '' ? remaining : '')}
              className={`form-input inv-num ${row.manual ? 'inv-manual' : 'inv-auto'}`}
              placeholder="—"
              title="Auto-calculated. Type to override after a physical count."
              onChange={(v) => onChange({ remaining: v, manual: v !== '' })}
            />
          )}
        </span>
        <span className="inv-cell inv-plus-cell col-act">
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

function StockSection({ section, rows, openings, date, onChange, inputRemainingMode = false }) {
  return (
    <section className="panel inv-section" id={`inv-${section.key}`}>
      <div className="inv-section-head">
        <div className="panel-title" style={{ marginBottom: 0 }}>{section.label}</div>
        <span className="inv-hint">
          {inputRemainingMode
            ? 'Tap + to log stock added · Enter remaining (Used = inventory − remaining)'
            : 'Tap + to log stock added · Remaining = inventory − used'}
        </span>
      </div>
      <div className="inv-table">
        <div className="inv-tr inv-th">
          <span className="col-item">Item</span>
          <span className="col-date">Date</span>
          <span className="col-inv">Inventory</span>
          <span className="col-used">Used</span>
          <span className="col-rem">Remaining</span>
          <span className="col-act" />
        </div>
        {section.items.map((item) => (
          <StockRow key={item.key} item={item} row={rows[item.key]} opening={openings[item.key] ?? 0}
            date={date} inputRemainingMode={inputRemainingMode}
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
  const [showWeeklyOverride, setShowWeeklyOverride] = useState(false);

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

  // Opening stock = previous day's remaining (or latest previous logged remaining for weekly items).
  const openings = useMemo(() => {
    const out = {};
    STOCK_SECTIONS.forEach((s) => {
      out[s.key] = {};
      const lastLogWithSection = logs.find((l) => l.id < date && l[s.key] && Object.values(l[s.key]).some((it) => !isBlank(it?.remaining)));
      s.items.forEach((it) => {
        out[s.key][it.key] = num(lastLogWithSection?.[s.key]?.[it.key]?.remaining ?? prevLog?.[s.key]?.[it.key]?.remaining);
      });
    });
    return out;
  }, [logs, prevLog, date]);

  const edit = (fn) => { setLog((l) => fn(structuredClone(l))); setDirty(true); };
  const changeDate = (d) => {
    if (!d || d === date) return;
    if (dirty && !window.confirm('You have unsaved changes for this day. Discard them?')) return;
    setDirty(false);
    setDate(d);
  };

  const wednesday = isWednesday(date);
  const showWeekly = wednesday || showWeeklyOverride;

  // Visible stock sections based on Wednesday rule
  const visibleStockSections = useMemo(() => {
    if (showWeekly) {
      return [
        ...STOCK_SECTIONS.filter((s) => s.key === 'packaging' || s.key === 'other'),
        ...STOCK_SECTIONS.filter((s) => s.key === 'chemicals' || s.key === 'stainRemovers'),
      ];
    }
    return STOCK_SECTIONS.filter((s) => s.key === 'chemicals' || s.key === 'stainRemovers');
  }, [showWeekly]);

  /* summary numbers */
  const lowItems = [];
  visibleStockSections.forEach((s) => s.items.forEach((it) => {
    const isRemMode = s.key === 'chemicals' || s.key === 'stainRemovers';
    const row = log[s.key]?.[it.key] || {};
    const op = openings[s.key]?.[it.key] || 0;
    const hasInv = op > 0 || !isBlank(row.added) || addsOf(row).length > 0;
    const r = isRemMode
      ? (!isBlank(row.remaining) ? num(row.remaining) : (hasInv ? round(op + num(row.added)) : ''))
      : remainingOf(row, op);
    if (!isBlank(r) && stockStatus(r, it) !== 'ok') lowItems.push(it.label);
  }));

  const cleanDone = CLEANLINESS_AREAS.filter((a) => log.cleanliness[a.key] === true).length;
  const elecStart = log.electricity.start;
  const elecEnd = log.electricity.end;
  const units = !isBlank(elecStart) && !isBlank(elecEnd) ? round(num(elecEnd) - num(elecStart)) : null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const data = structuredClone(log);
      STOCK_SECTIONS.forEach((s) => s.items.forEach((it) => {
        const row = data[s.key][it.key];
        row.date = date;
        row.opening = openings[s.key][it.key] ?? 0;
        const hasInv = row.opening > 0 || !isBlank(row.added) || (row.adds && row.adds.length > 0);
        row.inventory = hasInv ? round(row.opening + num(row.added)) : '';
        if (s.key === 'chemicals' || s.key === 'stainRemovers') {
          if (!isBlank(row.remaining)) {
            row.used = hasInv ? round(num(row.inventory) - num(row.remaining)) : '';
          } else {
            row.remaining = !isBlank(row.used) && hasInv ? round(num(row.inventory) - num(row.used)) : '';
          }
        } else {
          row.remaining = remainingOf(row, row.opening);
        }
      }));
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

  const handleClearDay = async () => {
    if (!window.confirm(`Are you sure you want to completely clear and reset all entries for ${fmtDay(date)}?`)) return;
    setSaving(true);
    setError('');
    try {
      if (savedForDate) {
        await deleteInventoryLog(date);
      }
      setLog(emptyLog());
      setDirty(false);
      setSavedAt(null);
    } catch (err) {
      console.error(err);
      setError('Failed to clear day: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('CAUTION: This will delete ALL saved daily inventory logs across all dates in Firestore. Jute bags and B2B/B2C orders will NOT be affected. Are you sure?')) return;
    setSaving(true);
    setError('');
    try {
      await clearAllInventoryLogs();
      setLog(emptyLog());
      setDirty(false);
      setSavedAt(null);
    } catch (err) {
      console.error(err);
      setError('Failed to clear all logs: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const jump = (key) => document.getElementById(`inv-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (loading) {
    return <div className="loading-state"><Loader2 size={22} className="spin" /><span>Loading inventory…</span></div>;
  }

  const isToday = date === todayStr();
  const lastWed = getLastWednesday(date);

  // Jump chips matching the required order
  const chips = [
    ...(showWeekly ? [['packaging', 'Packaging'], ['other', 'Other things']] : []),
    ['chemicals', 'Chemicals'],
    ['stainRemovers', 'Stain removers'],
    ['electricity', 'Electricity'],
    ['cleanliness', 'Cleanliness'],
    ['jutebags', 'Jute bags'],
    ['history', 'History'],
  ];

  return (
    <div className="inv-page">
      {/* date bar */}
      <div className="inv-datebar">
        <div className="inv-date-nav" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button className="icon-btn" onClick={() => changeDate(shiftDate(date, -1))} title="Previous day"><ChevronLeft size={18} /></button>
          <input className="form-input inv-date" type="date" value={date} max={todayStr()} onChange={(e) => changeDate(e.target.value)} />
          <button className="icon-btn" onClick={() => changeDate(shiftDate(date, 1))} disabled={isToday} title="Next day"><ChevronRight size={18} /></button>
          {!isToday && <button className="chip" onClick={() => changeDate(todayStr())}>Today</button>}
          {wednesday ? (
            <span className="badge badge-blue">Wednesday (Weekly Packaging Active)</span>
          ) : (
            <>
              <button type="button" className="chip" onClick={() => changeDate(lastWed)} title="Jump to previous Wednesday">
                Go to Wednesday ({fmtRowDate(lastWed)})
              </button>
              <button type="button" className="chip" onClick={() => setShowWeeklyOverride(!showWeeklyOverride)}>
                {showWeeklyOverride ? 'Hide weekly packaging' : 'Show weekly packaging'}
              </button>
            </>
          )}
        </div>
        <div className="inv-save-wrap" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dirty
            ? <span className="badge badge-amber">Unsaved changes</span>
            : savedAt
              ? <span className="badge badge-green">Saved {savedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
              : <span className="badge badge-gray">Not logged yet</span>}
          <button className="btn-action-primary" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            <span>Save day</span>
          </button>
          <button
            type="button"
            className="btn-ghost"
            title="Reset all inputs for this day"
            onClick={handleClearDay}
            disabled={saving}
          >
            <RotateCcw size={14} />
            <span>Reset day</span>
          </button>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}
      {!prevLog && <div className="inv-note">No earlier log found, so inventory starts at 0. Use the <b>+</b> button on a row to log today's stock.</div>}

      {/* summary: 3 widgets (Low stock, Cleanliness, Electricity) */}
      <div className="overview-widgets-grid ops-grid-3">
        <Widget tone="red" icon={<AlertTriangle size={18} />} label="Low stock" value={lowItems.length}
          sub={lowItems.length ? lowItems.slice(0, 3).join(', ') + (lowItems.length > 3 ? ` +${lowItems.length - 3}` : '') : 'All stocked'} />
        <Widget tone="green" icon={<Sparkles size={18} />} label="Cleanliness" value={`${cleanDone}/${CLEANLINESS_AREAS.length}`} sub="areas cleaned" />
        <Widget tone="blue" icon={<Zap size={18} />} label="Electricity" value={units === null ? '—' : `${units} units`} sub={units !== null ? 'Units consumed' : 'Readings pending'} />
      </div>

      {/* section jump chips */}
      <div className="chip-row scroll inv-chips">
        {chips.map(([k, l]) => <button key={k} className="chip" onClick={() => jump(k)}>{l}</button>)}
      </div>

      {/* DISPLAY ORDER:
          On Wednesday (or when viewing weekly items):
          1. Packaging
          2. Other things
          3. Chemicals
          4. Stain removers
          5. Electricity
          6. Cleanliness log
          7. Jute bag

          On other days:
          1. Chemicals
          2. Stain removers
          3. Electricity
          4. Cleanliness log
          5. Jute bag
      */}

      {/* 1. On Wednesday (or toggle): Packaging and Other things at the very top */}
      {showWeekly && STOCK_SECTIONS.filter((s) => s.key === 'packaging' || s.key === 'other').map((s) => (
        <StockSection key={s.key} section={s} rows={log[s.key]} openings={openings[s.key]} date={date}
          inputRemainingMode={false}
          onChange={(item, patch) => edit((l) => { Object.assign(l[s.key][item], patch); return l; })} />
      ))}

      {/* 2. Chemicals & Stain removers (Manager enters remaining, used is auto-calculated) */}
      {STOCK_SECTIONS.filter((s) => s.key === 'chemicals' || s.key === 'stainRemovers').map((s) => (
        <StockSection key={s.key} section={s} rows={log[s.key]} openings={openings[s.key]} date={date}
          inputRemainingMode={true}
          onChange={(item, patch) => edit((l) => { Object.assign(l[s.key][item], patch); return l; })} />
      ))}

      {/* 3. Electricity log */}
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

      {/* 4. Cleanliness log */}
      <section className="panel inv-section" id="inv-cleanliness">
        <div className="inv-section-head">
          <div className="panel-title" style={{ marginBottom: 0 }}>Cleanliness log</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="chip" onClick={() => edit((l) => { CLEANLINESS_AREAS.forEach((a) => { l.cleanliness[a.key] = true; }); return l; })}>
              Mark all cleaned
            </button>
            <button type="button" className="chip" onClick={() => edit((l) => { l.cleanliness = {}; return l; })}>
              Reset all
            </button>
          </div>
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

      {/* 5. Jute bag */}
      <div id="inv-jutebags">
        <JuteBagsSection />
      </div>

      <section className="panel inv-section">
        <label className="form-label">Notes for the day</label>
        <textarea className="form-input" rows={2} placeholder="Anything else to report"
          value={log.notes} onChange={(e) => { const v = e.target.value; edit((l) => { l.notes = v; return l; }); }} />
      </section>

      {/* history */}
      <section className="panel inv-section" id="inv-history">
        <div className="inv-section-head">
          <div className="panel-title" style={{ marginBottom: 0 }}>Recent days</div>
          {logs.length > 0 && (
            <button type="button" className="btn-ghost btn-ghost-red" onClick={handleClearAll} disabled={saving} style={{ fontSize: 12 }}>
              <Trash2 size={13} />
              <span>Clear all saved logs</span>
            </button>
          )}
        </div>
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
