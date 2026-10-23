import { useEffect, useState } from 'react';
import api from '../api/client';

const PAGE_SIZE = 10;

export default function useDashboardWoList() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/work-orders', {
          params: { page, limit: PAGE_SIZE, search, status },
        });
        const result = res.data?.data;
        if (!Array.isArray(result?.items)) throw new Error('Invalid work-order list response');
        if (!cancelled) {
          setRows(result.items);
          setTotal(Number(result.total) || 0);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || err.message || 'Failed to load work orders');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [page, search, status]);

  const changeStatus = (value) => {
    setStatus(value);
    setPage(1);
  };

  return {
    rows,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    setPage,
    searchInput,
    setSearchInput,
    status,
    setStatus: changeStatus,
    loading,
    error,
    hasActiveFilters: Boolean(search || status !== 'ALL'),
  };
}
