import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const quarterStart = () => {
  const now = new Date();
  return iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1));
};

const todayIso = () => iso(new Date());

export default function useQuarterlyReport() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [draftFrom, setDraftFrom] = useState(quarterStart());
  const [draftTo, setDraftTo] = useState(todayIso());

  const fetchReport = useCallback(async (from, to) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/reports/quarterly', { params: { from, to } });
      setReport(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load quarterly report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(quarterStart(), todayIso());
  }, [fetchReport]);

  const apply = useCallback(() => {
    fetchReport(draftFrom, draftTo);
  }, [fetchReport, draftFrom, draftTo]);

  const quarters = report?.quarters || [];
  const totals = quarters.reduce(
    (acc, q) => {
      acc.work_orders += q.work_orders;
      acc.custom_items += q.custom_items;
      acc.hours.queued += q.hours.queued;
      acc.hours.in_progress += q.hours.in_progress;
      acc.hours.completed += q.hours.completed;
      acc.hours.total += q.hours.total;
      return acc;
    },
    { work_orders: 0, custom_items: 0, hours: { queued: 0, in_progress: 0, completed: 0, total: 0 } }
  );

  return {
    report,
    error,
    loading,
    quarters,
    totals,
    draftFrom,
    draftTo,
    setDraftFrom,
    setDraftTo,
    apply,
  };
}