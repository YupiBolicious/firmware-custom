import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/client';

export const RANGE_PRESETS = [
  { key: '8W', label: '8W', days: 8 * 7 },
  { key: '3M', label: '3M', days: 3 * 30 },
  { key: '6M', label: '6M', days: 6 * 30 },
  { key: '1Y', label: '1Y', days: 365 },
];

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeFromPreset(days) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { from: formatLocalDate(from), to: formatLocalDate(to) };
}

export default function useAdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('8W');
  const [trendRefreshing, setTrendRefreshing] = useState(false);
  const [trendError, setTrendError] = useState('');
  const firstRender = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api.get('/admin-dashboard');
        if (!cancelled) setData(res.data.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let cancelled = false;
    setTrendRefreshing(true);
    setTrendError('');
    const load = async () => {
      try {
        const { from, to } = rangeFromPreset(RANGE_PRESETS.find((p) => p.key === preset)?.days || (8 * 7));
        const res = await api.get(`/admin-dashboard?from=${from}&to=${to}`);
        if (!cancelled) setData((prev) => (prev ? { ...prev, trend: res.data.data.trend } : prev));
      } catch (err) {
        if (!cancelled) setTrendError(err.response?.data?.message || 'Failed to load trend');
      } finally {
        if (!cancelled) setTrendRefreshing(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [preset]);

  const changePreset = useCallback((key) => setPreset(key), []);

  return { data, error, loading, preset, changePreset, trendRefreshing, trendError };
}