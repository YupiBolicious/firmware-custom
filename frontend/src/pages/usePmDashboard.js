import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const STATUS_LABELS = {
  DRAFT: 'Draft',
  ANALYZED: 'Analyzed',
  FINALIZED: 'Finalized',
  PRODUCTION: 'Production',
  COMPLETED: 'Completed',
};

function formatStatus(status) {
  return STATUS_LABELS[status] || status;
}

const initialFilters = {
  search: '',
  statusFilter: 'ALL',
  modelFilter: 'ALL',
  versionFilter: 'ALL',
  complexityFilter: 'ALL',
  fwRelatedFilter: 'ALL',
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
  const [queuePage, setQueuePage] = useState(1);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get('/pm-dashboard', {
          params: {
            page: queuePage,
            limit: 10,
            search: filters.search || undefined,
            status: filters.statusFilter === 'ALL' ? undefined : filters.statusFilter,
            model: filters.modelFilter === 'ALL' ? undefined : filters.modelFilter,
            version: filters.versionFilter === 'ALL' ? undefined : filters.versionFilter,
            complexity: filters.complexityFilter === 'ALL' ? undefined : filters.complexityFilter,
            fw_related: filters.fwRelatedFilter === 'ALL' ? undefined : filters.fwRelatedFilter,
            date_from: filters.dateFrom || undefined,
            date_to: filters.dateTo || undefined,
          },
        });
        setData(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [queuePage, filters]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'modelFilter') {
        next.versionFilter = 'ALL';
        next.complexityFilter = 'ALL';
      }
      return next;
    });
    setQueuePage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
    setQueuePage(1);
  }, []);

  const workQueue = data?.work_queue || { items: [], total: 0, page: 1, limit: 10, totalPages: 1 };
  const filteredQueue = workQueue.items;
  const matchingCount = workQueue.total;
  const queueTotalPages = workQueue.totalPages;

  const hasActiveFilters = filters.search || filters.statusFilter !== 'ALL' || filters.modelFilter !== 'ALL'
    || filters.versionFilter !== 'ALL' || filters.complexityFilter !== 'ALL'
    || filters.fwRelatedFilter !== 'ALL' || filters.dateFrom || filters.dateTo;

  return {
    data,
    error,
    loading,
    formatStatus,
    filters,
    showAdvanced,
    setShowAdvanced,
    setFilter,
    clearFilters,
    filteredQueue,
    visibleQueue: filteredQueue,
    matchingCount,
    hasActiveFilters,
    queuePage,
    setQueuePage,
    queueTotalPages,
    uniqueModels: data?.options?.models || [],
    uniqueVersions: data?.options?.versions || [],
    uniqueComplexities: (data?.options?.complexities || []).map((c) => c.code),
    filteredKpis: data?.kpis || ZERO_KPIS,
    filteredStatusDistribution: data?.status_distribution || [],
    filteredWorkload: data?.workload || { queued: 0, in_progress: 0, completed: 0 },
    filteredTrend: data?.trend || [],
    trendUnit: data?.trend_unit || 'day',
    trendWindow: data?.trend_window || null,
    filteredAttention: data?.attention || [],
  };
}
