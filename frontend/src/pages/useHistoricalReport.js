import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const currentYear = () => new Date().getFullYear();
const currentQuarter = () => String(Math.floor(new Date().getMonth() / 3) + 1);

export const METRICS = {
  work_orders: 'Work Orders',
  custom_items: 'Custom Items',
  estimated_hours: 'Estimated Hours',
  completed_hours: 'Completed Hours',
  coder_reviews: 'Coder Reviews',
};

const emptyMetrics = () => ({
  work_orders: 0,
  custom_items: 0,
  estimated_hours: 0,
  completed_hours: 0,
  coder_reviews: 0,
});

export default function useHistoricalReport() {
  const [year, setYear] = useState(String(currentYear()));
  const [quarter, setQuarter] = useState(currentQuarter());
  const [metric, setMetric] = useState('work_orders');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async (y, q) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/reports/historical', { params: { year: y, quarter: q } });
      setReport(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load historical report');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(year, quarter);
  }, [fetchReport, year, quarter]);

  const quarters = report?.quarters || [];
  const selectedIndex = quarter ? quarters.findIndex((q) => q.quarter === `Q${quarter}`) : -1;
  const rollup = quarters.reduce((acc, q) => {
    acc.work_orders += q.work_orders;
    acc.custom_items += q.custom_items;
    acc.estimated_hours += Number(q.estimated_hours);
    acc.completed_hours += Number(q.completed_hours);
    acc.coder_reviews += q.coder_reviews;
    return acc;
  }, emptyMetrics());

  return {
    report,
    error,
    loading,
    quarters,
    kpi: selectedIndex >= 0 ? quarters[selectedIndex] : rollup,
    selectedIndex,
    year,
    setYear,
    quarter,
    setQuarter,
    metric,
    setMetric,
  };
}