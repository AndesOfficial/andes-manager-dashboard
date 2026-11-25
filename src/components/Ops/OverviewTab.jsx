import React from 'react';
import { Building2, Users, Package, Shirt, IndianRupee, AlertTriangle, ArrowRight, Sigma } from 'lucide-react';
import { fmtKg, Tile } from './shared';
import { receiptTotals } from '../../lib/orders';

const rupees = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

/** The three numbers the manager needs, for one side of the business. */
function Totals({ kg, clothes, revenue }) {
  return (
    <div className="overview-widgets-grid ops-grid-3">
      <Tile tone="blue" icon={<Package size={16} />} label="KG processed" value={fmtKg(kg)} />
      <Tile tone="purple" icon={<Shirt size={16} />} label="Clothes processed" value={clothes} />
      <Tile tone="green" icon={<IndianRupee size={16} />} label="Total Revenue" value={rupees(revenue)} />
    </div>
  );
}

function SectionHead({ icon, title }) {
  return (
    <div className="ops-section-head">
      <h2 className="ops-h2">{icon} {title}</h2>
    </div>
  );
}

function BigTile({ tone, label, value, sub, subTone, onClick }) {
  return (
    <button type="button" className={`widget-card widget-${tone} ops-tile ops-tile-btn`} onClick={onClick}>
      <div className="widget-header"><span className="widget-label">{label}</span></div>
      <div className="widget-value">{value}</div>
      <div className={`ops-tile-sub ${subTone === 'bad' ? 'ops-sub-bad' : subTone === 'warn' ? 'ops-sub-warn' : ''}`}>{sub}</div>
    </button>
  );
}

export default function OverviewTab({ b2c, b2bSum, rows = [], range, onGo }) {
  const t = receiptTotals(rows, range || { from: '', to: '' });
  const bagText = t.missingBags > 0 ? ` · ${t.missingBags} bag${t.missingBags === 1 ? '' : 's'} missing` : '';
  const overallKg = Math.round(((b2bSum.kg || 0) + (b2c.kg || 0)) * 100) / 100;
  const overallClothes = (b2bSum.clothes || 0) + (b2c.clothes || 0);
  const overallRevenue = (b2bSum.totalRevenue || 0) + (b2c.totalRevenue || 0);

  return (
    <div className="ops-overview">
      <section>
        <div className="overview-widgets-grid ops-grid-4">
          <BigTile tone="blue" label="Pickups completed" value={t.pickedUp}
            sub={t.awaiting > 0 ? `${t.awaiting} awaiting store confirmation` : 'All confirmed by the store'}
            subTone={t.awaiting > 0 ? 'warn' : ''} onClick={() => onGo('b2c', null, 'pickedup')} />
          <BigTile tone="purple" label="Received at store" value={t.received}
            sub={t.mismatched > 0 ? `${t.mismatched} bag difference${t.mismatched === 1 ? '' : 's'}${bagText}` : t.awaiting > 0 ? `${t.awaiting} still to confirm` : 'Nothing waiting'}
            subTone={t.mismatched > 0 ? 'bad' : t.awaiting > 0 ? 'warn' : ''}
            onClick={() => onGo('b2c', null, t.mismatched > 0 ? 'bagdiff' : 'awaiting')} />
          <BigTile tone="green" label="Deliveries completed" value={t.delivered} sub="Delivered in these dates"
            onClick={() => onGo('b2c', null, 'delivered')} />
          <BigTile tone="amber" label="Money collected" value={`₹${t.collected.toLocaleString('en-IN')}`}
            sub={t.due > 0 ? `₹${t.due.toLocaleString('en-IN')} still due` : 'Nothing due'}
            subTone={t.due > 0 ? 'warn' : ''} onClick={() => onGo('b2c', null, 'all')} />
        </div>
        <p className="ops-receipt-summary">
          <strong>{t.pickedUp}</strong> picked up · <strong>{t.received}</strong> received · <strong>{t.awaiting}</strong> awaiting receipt
          <span className="ops-muted"> — B2C customer orders. B2B batches are below.</span>
        </p>
      </section>

      <section>
        <SectionHead icon={<Building2 size={18} />} title="B2B Overview" />
        <Totals kg={b2bSum.kg} clothes={b2bSum.clothes} revenue={b2bSum.totalRevenue} />
      </section>

      <section>
        <SectionHead icon={<Users size={18} />} title="B2C Overview" />
        <Totals kg={b2c.kg} clothes={b2c.clothes} revenue={b2c.totalRevenue} />

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
      </section>

      <section>
        <SectionHead icon={<Sigma size={18} />} title="Overall Revenue & Processing Summary" />
        <Totals kg={overallKg} clothes={overallClothes} revenue={overallRevenue} />
      </section>
    </div>
  );
}
