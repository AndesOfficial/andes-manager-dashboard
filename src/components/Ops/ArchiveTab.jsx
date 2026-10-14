import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { subscribeB2bArchive, subscribeB2cArchive } from '../../firebase';
import { fmtKg, EmptyState } from './shared';

/** Old hand-typed records from before rider-order sync. Read-only, never in totals. */
export default function ArchiveTab() {
  const [kind, setKind] = useState('b2b');
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    const sub = kind === 'b2b' ? subscribeB2bArchive : subscribeB2cArchive;
    return sub(setData, () => setData([]));
  }, [kind]);

  return (
    <div>
      <p className="inv-note">Old records typed in before B2C orders came from the rider app. Read-only — not included in any totals.</p>
      <div className="chip-row">
        <button className={`chip ${kind === 'b2b' ? 'chip-active' : ''}`} onClick={() => setKind('b2b')}>Old B2B batches</button>
        <button className={`chip ${kind === 'b2c' ? 'chip-active' : ''}`} onClick={() => setKind('b2c')}>Old B2C orders</button>
      </div>
      {data === null ? (
        <div className="loading-state"><Loader2 size={22} className="spin" /><span>Loading…</span></div>
      ) : data.length === 0 ? (
        <EmptyState title="Nothing archived" sub="" />
      ) : (
        <table className="ops-lines ops-archive">
          <thead><tr><th>{kind === 'b2b' ? 'Hostel' : 'Customer'}</th><th>Date</th><th className="ops-num">KG</th></tr></thead>
          <tbody>
            {data.map((x) => (
              <tr key={x.id}>
                <td>{kind === 'b2b' ? x.hostel : x.customerName}</td>
                <td>{kind === 'b2b' ? x.pickupDate : x.date}</td>
                <td className="ops-num">{fmtKg(kind === 'b2b' ? x.totalKg : x.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
