import { useEffect, useMemo, useState } from 'react';
import {
  subscribeB2cOrders, subscribeVerifications, subscribeB2bEntries, fetchServiceCategories,
} from '../firebase';
import { buildB2cRow, isCancelledOrder, b2cTotals, b2bTotals } from '../lib/orders';

/** Live B2C rows + B2B entries for one day, with totals. Three listeners per day. */
export default function useDayData(day, enabled) {
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
      subscribeB2cOrders(day, (list) => setOrders(list.filter((o) => !isCancelledOrder(o))), onError),
      subscribeVerifications(day, setVerifications, onError),
      subscribeB2bEntries(day, setB2b, onError),
    ];
    return () => unsubs.forEach((u) => u());
  }, [day, enabled]);

  const b2cRows = useMemo(() => (orders && verifications
    ? orders.map((o) => buildB2cRow(o, verifications[o.id], categories))
      .sort((a, b) => a.customer.localeCompare(b.customer))
    : []), [orders, verifications, categories]);

  return {
    loading: !error && (orders === null || verifications === null || b2b === null),
    error,
    b2cRows,
    b2bEntries: b2b || [],
    b2c: useMemo(() => b2cTotals(b2cRows), [b2cRows]),
    b2bSum: useMemo(() => b2bTotals(b2b || []), [b2b]),
  };
}
