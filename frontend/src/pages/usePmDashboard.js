import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const initialFilters = {
  search: '',
  statusFilter: 'ALL',
  modelFilter: 'ALL',
  complexityFilter: 'ALL',
  dateFrom: '',
  dateTo: '',
};

const ZERO_KPIS = {
  active_wos: 0,
  pending_review: 0,
  in_progress: 0,
  production: 0,
  completed: 0,
  total_estimated_hours: 0,
  overdue: 0,
};

export default function usePmDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workOrderPage, setWorkOrderPage] = useState(1);

  useEffect(() => {
    setWorkOrderPage(1);
  }, [filters.search, filters.statusFilter, filters.modelFilter, filters.complexityFilter, filters.classificationFilter, filters.dateFrom, filters.dateTo]);
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/pm-dashboard', {
          params: {
            page: workOrderPage,
            search: filters.search,
            status: filters.statusFilter === 'ALL' ? '' : filters.statusFilter,
            model: filters.modelFilter === 'ALL' ? '' : filters.modelFilter,
            complexity: filters.complexityFilter === 'ALL' ? '' : filters.complexityFilter,
            date_from: filters.dateFrom,
            date_to: filters.dateTo,
            limit: 10,
          },
        });
        setData(res.data?.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workOrderPage, filters.search, filters.statusFilter, filters.modelFilter, filters.versionFilter, filters.complexityFilter, filters.classificationFilter, filters.dateFrom, filters.dateTo]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'statusFilter') {
        next.modelFilter = 'ALL';
        next.modelFilter = 'ALL';
      }
      return next;
    });
    setWorkOrderPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
    setWorkOrderPage(1);
  }, []);

  const workQueue = data?.work_queue || { items: [], total: 0, page: 1, limit: 10, totalPages: 1 };
  const filteredQueue = workQueue.items;
  const matchingCount = workQueue.total;
  const queueTotalPages = workQueue.totalPages;

  const hasActiveFilters = filters.search || filters.statusFilter !== 'ALL'
    || filters.modelFilter !== 'ALL' || filters.complexityFilter !== 'ALL' 
    || filters.dateFrom || filters.dateTo;

  return {
    data,
    error,
    loading,
    filters,
    showAdvanced,
    setShowAdvanced,
    setFilter,
    clearFilters,
    filteredQueue,
    visibleQueue: filteredQueue,
    matchingCount,
    hasActiveFilters,
    workOrderPage, setWorkOrderPage,
    queueTotalPages,
    uniqueModels: data?.options?.models || [],
    uniqueComplexities: (data?.options?.complexities || []).map((c) => c.code),
    filteredKpis: data?.kpis || ZERO_KPIS,
    filteredStatusDistribution: data?.status_distribution || [],
    filteredWorkload: data?.workload || { queued: 0, in_progress: 0, completed: 0 },
    filteredTrend: data?.trend || [],
    trendUnit: data?.trend_unit || 'day',
    trendWindow: data?.trend_window || null
  };
}
