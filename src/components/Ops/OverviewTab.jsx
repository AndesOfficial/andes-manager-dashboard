import React from 'react';
import { Building2, Users, Package, Shirt, IndianRupee, AlertTriangle, ArrowRight, Sigma } from 'lucide-react';
import { fmtKg, Tile } from './shared';

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

export default function OverviewTab({ b2c, b2bSum, onGo }) {
  const overallKg = Math.round(((b2bSum.kg || 0) + (b2c.kg || 0)) * 100) / 100;
  const overallClothes = (b2bSum.clothes || 0) + (b2c.clothes || 0);
  const overallRevenue = (b2bSum.totalRevenue || 0) + (b2c.totalRevenue || 0);

  return (
    <div className="ops-overview">
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
