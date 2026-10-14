import React, { useState } from 'react';
import { Building2, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { SERVICE_GROUPS } from '../../lib/orders';
import { fmtKg, StatusBadge } from './shared';

function Totals({ kg, clothes, verified, total, unit }) {
  return (
    <div className="ops-totals">
      <div><div className="ops-big">{fmtKg(kg)}</div><div className="ops-label">KG processed</div></div>
      <div><div className="ops-big">{clothes}</div><div className="ops-label">Clothes processed</div></div>
      <div>
        <div className="ops-big">{verified}<span className="ops-of">/{total}</span></div>
        <div className="ops-label">{unit} verified</div>
      </div>
    </div>
  );
}

function ServiceCard({ group, data, onOpen }) {
  const [open, setOpen] = useState(false);
  const showList = !group.byKg && data.rows.length > 0;
  return (
    <div className="svc-card">
      <div className="svc-head">
        <span className="svc-name">{group.label}</span>
        <span className="svc-orders">{data.orders} order{data.orders === 1 ? '' : 's'}</span>
      </div>
      <div className="svc-value">{group.byKg ? fmtKg(data.kg) : `${data.clothes} clothes`}</div>
      {group.byKg && data.clothes > 0 && <div className="svc-sub">{data.clothes} clothes</div>}
      {showList && (
        <button className="history-toggle" onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {open ? 'Hide' : 'Show'} orders
        </button>
      )}
      {open && (
        <ul className="svc-list">
          {data.rows.map((r) => (
            <li key={r.id} onClick={() => onOpen(r.id)}>
              <div className="svc-list-top"><strong>{r.customer}</strong><StatusBadge status={r.status} locked={r.locked} /></div>
              <div className="svc-items">
                {r.lines.filter((l) => l.group === group.id).map((l) => `${l.name} × ${l.qty}`).join(', ')}
              </div>
              <div className="svc-sub">Order status: {r.orderStatus || '—'}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function OverviewTab({ b2c, b2bSum, onGo }) {
  return (
    <div className="ops-overview">
      <section className="panel">
        <div className="ops-section-head">
          <div className="panel-title"><Building2 size={16} /> B2B Overview</div>
          <button className="chip" onClick={() => onGo('b2b')}>Open B2B →</button>
        </div>
        <Totals kg={b2bSum.kg} clothes={b2bSum.clothes} verified={b2bSum.verified} total={b2bSum.entries} unit="Entries" />
      </section>

      <section className="panel">
        <div className="ops-section-head">
          <div className="panel-title"><Users size={16} /> B2C Overview</div>
          <button className="chip" onClick={() => onGo('b2c')}>Open B2C →</button>
        </div>
        <Totals kg={b2c.kg} clothes={b2c.clothes} verified={b2c.verified} total={b2c.orders} unit="Orders" />
        <div className="svc-grid">
          {SERVICE_GROUPS.filter((g) => g.id !== 'other' || b2c.groups.other.orders > 0).map((g) => (
            <ServiceCard key={g.id} group={g} data={b2c.groups[g.id]} onOpen={(id) => onGo('b2c', id)} />
          ))}
        </div>
      </section>
    </div>
  );
}
