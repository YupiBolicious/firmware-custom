import { useEffect, useState } from 'react';
import api from '../api/client';

const PAGE_SIZE = 10;
const EMPTY_FILTERS = {
  search: '',
  statusFilter: 'ALL',
  modelFilter: 'ALL',
  complexityFilter: 'ALL',
  classificationStatusFilter: 'ALL',
  dateFrom: '',
  dateTo: '',
};

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
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [search, setSearch] = useState('');
  const [models, setModels] = useState([]);
  const [complexities, setComplexities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isControlled) return undefined;
    const timer = setTimeout(() => {
      setSearch(filters.search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [isControlled, filters.search]);

  useEffect(() => {
    if (isControlled) return undefined;
    let cancelled = false;
    Promise.allSettled([api.get('/machine-models'), api.get('/complexity-levels')]).then(([modelsResult, complexitiesResult]) => {
      if (cancelled) return;
      if (modelsResult.status === 'fulfilled') setModels(modelsResult.value.data?.data || []);
      if (complexitiesResult.status === 'fulfilled') {
        setComplexities((complexitiesResult.value.data?.data || []).map((level) => level.code));
      }
    });
    return () => { cancelled = true; };
  }, [isControlled]);

  useEffect(() => {
    if (isControlled) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/work-orders', {
          params: {
            page,
            limit: PAGE_SIZE,
            search,
            status: filters.statusFilter,
            machine_model_code: filters.modelFilter === 'ALL' ? '' : filters.modelFilter,
            complexity: filters.complexityFilter,
            classification_status: filters.classificationStatusFilter,
            from: filters.dateFrom,
            to: filters.dateTo,
          },
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
  }, [isControlled, page, search, filters.statusFilter, filters.modelFilter, filters.complexityFilter, filters.classificationStatusFilter, filters.dateFrom, filters.dateTo]);

  const setFilter = (key, value) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearch('');
    setPage(1);
  };

  const hasLocalFilters = Boolean(filters.search.trim()
    || filters.statusFilter !== 'ALL'
    || filters.modelFilter !== 'ALL'
    || filters.complexityFilter !== 'ALL'
    || filters.classificationStatusFilter !== 'ALL'
    || filters.dateFrom || filters.dateTo);

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
    filters,
    setFilter,
    clearFilters,
    showAdvanced,
    setShowAdvanced,
    uniqueModels: models,
    uniqueComplexities: complexities,
    loading: isControlled ? false : loading,
    error: isControlled ? '' : error,
    hasActiveFilters: isControlled
      ? Boolean(suppliedHasActiveFilters)
      : hasLocalFilters,
  };
}
