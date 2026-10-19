import React, { useState } from 'react';
import { Building2, Users, Package, Shirt, BadgeCheck, ChevronDown, ChevronUp, ArrowRight, AlertTriangle, IndianRupee } from 'lucide-react';
import { SERVICE_GROUPS } from '../../lib/orders';
import { fmtKg, fmtDay, Tile, StatusBadge } from './shared';

const SERVICE_TONE = { wash_iron: 'blue', wash_fold: 'green', dry_clean: 'purple', iron: 'amber', other: 'gray' };

function SectionTotals({ kg, clothes, verified, total, unit, revenue, showRevenue = true }) {
  const left = total - verified;
  return (
    <div className={`overview-widgets-grid ${showRevenue ? 'ops-grid-4' : 'ops-grid-3'}`}>
      {showRevenue && (
        <Tile tone="green" icon={<IndianRupee size={16} />} label="Total Revenue" value={`₹${(revenue || 0).toLocaleString('en-IN')}`} />
      )}
      <Tile tone="blue" icon={<Package size={16} />} label="KG processed" value={fmtKg(kg)} />
      <Tile tone="purple" icon={<Shirt size={16} />} label="Clothes processed" value={clothes} />
      <Tile tone={left ? 'amber' : 'green'} icon={<BadgeCheck size={16} />} label={`${unit} verified`}
        value={<>{verified}<span className="ops-of"> / {total}</span></>}
        sub={total === 0 ? 'Nothing for these dates' : left ? `${left} still to verify` : 'All verified ✓'} />
    </div>
  );
}

function ServiceCard({ group, data, onOpen }) {
  const [open, setOpen] = useState(false);
  const tone = SERVICE_TONE[group.id];
  return (
    <div className={`widget-card widget-${tone} ops-tile`}>
      <div className="widget-header">
        <span className="widget-label">{group.label}</span>
        <span className={`badge badge-${tone === 'purple' ? 'blue' : tone}`}>{data.orders} order{data.orders === 1 ? '' : 's'}</span>
      </div>
      <div className="widget-value">{group.byKg ? fmtKg(data.kg) : data.clothes}</div>
      <div className="ops-tile-sub">{group.byKg ? `${data.clothes} clothes` : 'clothes'}</div>
      {data.rows.length > 0 && (
        <button className="history-toggle" onClick={() => setOpen(!open)}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {open ? 'Hide' : 'View'} orders
        </button>
      )}
      {open && (
        <ul className="svc-list">
          {data.rows.map((r) => (
            <li key={r.id} onClick={() => onOpen(r.id)}>
              <div className="svc-list-top"><strong>{r.customer}</strong><StatusBadge status={r.status} locked={r.locked} /></div>
              <div className="svc-items">
                {r.lines.filter((l) => l.group === group.id)
                  .map((l) => (group.byKg ? `${fmtKg(l.kg)} · ${l.qty} pcs` : `${l.name} × ${l.qty}`)).join(', ')}
              </div>
              <div className="ops-muted">{fmtDay(r.pickupDay)} · {r.orderStatus || '—'}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionHead({ icon, title, onOpen, label }) {
  return (
    <div className="ops-section-head">
      <h2 className="ops-h2">{icon} {title}</h2>
      <button className="btn-ghost" onClick={onOpen}>{label} <ArrowRight size={14} /></button>
    </div>
  );
}

export default function OverviewTab({ b2c, b2bSum, onGo }) {
  return (
    <div className="ops-overview">
      <section>
        <SectionHead icon={<Building2 size={18} />} title="B2B Overview" label="Verify B2B" onOpen={() => onGo('b2b')} />
        <SectionTotals kg={b2bSum.kg} clothes={b2bSum.clothes} verified={b2bSum.verified} total={b2bSum.entries} unit="Entries" showRevenue={false} />
      </section>

      <section>
        <SectionHead icon={<Users size={18} />} title="B2C Overview" label="Verify B2C" onOpen={() => onGo('b2c')} />
        <SectionTotals kg={b2c.kg} clothes={b2c.clothes} verified={b2c.verified} total={b2c.orders} unit="Orders" revenue={b2c.totalRevenue} />
        
        {b2c.delayed > 0 && (
          <div className="delayed-banner" style={{ marginTop: 14, cursor: 'pointer' }} onClick={() => onGo('b2c')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={20} />
              <div>
                <div className="delayed-banner-title">{b2c.delayed} Active B2C Order{b2c.delayed === 1 ? '' : 's'} Delayed</div>
                <div className="delayed-banner-sub">Orders from earlier dates that have not been delivered yet. Tap to view and take action.</div>
              </div>
            </div>
            <button type="button" className="btn-ghost btn-ghost-red" style={{ background: '#fff', fontSize: 13 }}>
              View Delayed <ArrowRight size={14} />
            </button>
          </div>
        )}

        <div className="ops-subhead">By service</div>
        <div className="overview-widgets-grid ops-grid-4">
          {SERVICE_GROUPS.filter((g) => g.id !== 'other' || b2c.groups.other.orders > 0).map((g) => (
            <ServiceCard key={g.id} group={g} data={b2c.groups[g.id]} onOpen={(id) => onGo('b2c', id)} />
          ))}
        </div>
      </section>
    </div>
  );
}
