import { useEffect, useMemo, useState } from 'react';
import {
  subscribeB2cOrders, subscribeVerifications, subscribeB2bEntries, fetchServiceCategories,
} from '../firebase';
import { buildB2cRow, b2cTotals, b2bTotals } from '../lib/orders';

/** Live B2C rows + B2B entries whose pickup/entry day is in [from, to], with totals. */
export default function useRangeData({ from, to }, enabled) {
  const [orders, setOrders] = useState(null);
  const [verifications, setVerifications] = useState(null);
  const [b2b, setB2b] = useState(null);
  const [categories, setCategories] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    fetchServiceCategories().then(setCategories).catch((err) => console.error('Service categories failed:', err));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    setOrders(null); setVerifications(null); setB2b(null); setError('');
    const onError = (err) => {
      console.error('Dashboard listener failed:', err);
      setError(err.code === 'permission-denied'
        ? 'This account is not allowed to read this data. Ask an admin to check access.'
        : 'Could not load data. Check your connection and refresh.');
    };
    const unsubs = [
      subscribeB2cOrders(from, to, setOrders, onError),
      subscribeVerifications(from, to, setVerifications, onError),
      subscribeB2bEntries(from, to, setB2b, onError),
    ];
    return () => unsubs.forEach((u) => u());
  }, [from, to, enabled]);

  const b2cRows = useMemo(() => {
    if (!orders || !verifications) return [];
    return orders
      .map((o) => buildB2cRow(o, verifications[o.id], categories))
      .filter((r) => {
        // 1. Orders within the selected pickup date range
        if (r.pickupDay >= from && r.pickupDay <= to) return true;
        // 2. Orders with dropDay in the range
        if (r.dropDay && r.dropDay >= from && r.dropDay <= to) return true;
        // 3. Active old orders that are not delivered yet (delayed)
        if (r.isDelayed) return true;
        return false;
      })
      .sort((a, b) => {
        // Arrange orders strictly from latest to oldest
        // 1. Primary: pickupDay descending (e.g. 2026-10-19 before 2026-10-18 or 2025-10-22)
        const dateCmp = (b.pickupDay || '').localeCompare(a.pickupDay || '');
        if (dateCmp !== 0) return dateCmp;

        // 2. Secondary: order creation timestamp descending
        const getTime = (o) => {
          const t = o?.createdAt || o?.orderTimestamp || o?.updatedAt;
          if (!t) return 0;
          if (typeof t.toMillis === 'function') return t.toMillis();
          if (typeof t.toDate === 'function') return t.toDate().getTime();
          if (t instanceof Date) return t.getTime();
          if (typeof t === 'number') return t;
          const parsed = Date.parse(t);
          return isNaN(parsed) ? 0 : parsed;
        };
        const bTime = getTime(b.order);
        const aTime = getTime(a.order);
        if (bTime !== aTime) return bTime - aTime;

        // 3. Fallback: customer name
        return String(a.customer || '').localeCompare(String(b.customer || ''));
      });
  }, [orders, verifications, categories, from, to]);

  const b2c = useMemo(() => b2cTotals(b2cRows), [b2cRows]);
  const b2bSum = useMemo(() => b2bTotals(b2b || []), [b2b]);

  return {
    loading: !error && (orders === null || verifications === null || b2b === null),
    error,
    b2cRows,
    b2bEntries: b2b || [],
    b2c,
    b2bSum,
  };
}
