import { useEffect, useMemo, useState } from 'react';
import {
  subscribeB2cOrders, subscribeVerifications, subscribeB2bEntries, fetchServiceCategories,
} from '../firebase';
import { buildB2cRow, isCancelledOrder, b2cTotals, b2bTotals } from '../lib/orders';

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
      subscribeB2cOrders(from, to, (list) => setOrders(list.filter((o) => !isCancelledOrder(o))), onError),
      subscribeVerifications(from, to, setVerifications, onError),
      subscribeB2bEntries(from, to, setB2b, onError),
    ];
    return () => unsubs.forEach((u) => u());
  }, [from, to, enabled]);

  const b2cRows = useMemo(() => (orders && verifications
    ? orders.map((o) => buildB2cRow(o, verifications[o.id], categories))
      .filter((r) => r.pickupDay >= from && r.pickupDay <= to)
      .sort((a, b) => b.pickupDay.localeCompare(a.pickupDay) || a.customer.localeCompare(b.customer))
    : []), [orders, verifications, categories, from, to]);

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
