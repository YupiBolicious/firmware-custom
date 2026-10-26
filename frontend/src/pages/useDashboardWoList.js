import { useEffect, useState } from 'react';
import api from '../api/client';

const PAGE_SIZE = 10;

export default function useDashboardWoList({
  rows: suppliedRows,
  total: suppliedTotal,
  page: suppliedPage,
  setPage: suppliedSetPage,
  totalPages: suppliedTotalPages,
  hasActiveFilters: suppliedHasActiveFilters,
} = {}) {
  const isControlled = Array.isArray(suppliedRows);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isControlled) return undefined;
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [isControlled, searchInput]);

  useEffect(() => {
    if (isControlled) return undefined;
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
  }, [isControlled, page, search, status]);

  const changeStatus = (value) => {
    setStatus(value);
    setPage(1);
  };

  const currentPage = isControlled ? suppliedPage : page;
  const currentTotal = isControlled ? suppliedTotal : total;
  const currentRows = isControlled ? suppliedRows : rows;

  return {
    rows: currentRows || [],
    total: currentTotal || 0,
    page: currentPage || 1,
    totalPages: isControlled
      ? (suppliedTotalPages || Math.max(1, Math.ceil((currentTotal || 0) / PAGE_SIZE)))
      : Math.max(1, Math.ceil(total / PAGE_SIZE)),
    setPage: isControlled ? suppliedSetPage : setPage,
    searchInput,
    setSearchInput,
    status,
    setStatus: changeStatus,
    loading: isControlled ? false : loading,
    error: isControlled ? '' : error,
    hasActiveFilters: isControlled
      ? Boolean(suppliedHasActiveFilters)
      : Boolean(search || status !== 'ALL'),
  };
}
