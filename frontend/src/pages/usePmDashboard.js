import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../api/client';

const STATUS_LABELS = {
  DRAFT: 'Draft',
  ANALYZED: 'Analyzed',
  FINALIZED: 'Finalized',
  PRODUCTION: 'In Production',
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

function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return formatLocalDate(d);
}

export default function usePmDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/pm-dashboard');
        setData(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'modelFilter') next.versionFilter = 'ALL';
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
  }, []);

  const workQueue = data?.work_queue || [];
  const rawAttention = data?.attention || [];

  const uniqueModels = useMemo(() => {
    const map = new Map();
    workQueue.forEach((w) => {
      if (w.machine_model_id && !map.has(w.machine_model_id)) {
        map.set(w.machine_model_id, { id: w.machine_model_id, code: w.model_code, name: w.machine_model_name });
      }
    });
    return [...map.values()];
  }, [workQueue]);

  const uniqueVersions = useMemo(() => {
    const map = new Map();
    workQueue.forEach((w) => {
      if (w.machine_model_version_id && !map.has(w.machine_model_version_id)) {
        map.set(w.machine_model_version_id, { id: w.machine_model_version_id, code: w.version_code, model_id: w.machine_model_id });
      }
    });
    let versions = [...map.values()];
    if (filters.modelFilter !== 'ALL') {
      versions = versions.filter((v) => v.model_id === Number(filters.modelFilter));
    }
    return versions;
  }, [workQueue, filters.modelFilter]);

  const uniqueComplexities = useMemo(() => {
    const set = new Set(workQueue.map((w) => w.complexity_code).filter(Boolean));
    return [...set].sort();
  }, [workQueue]);

  const filteredQueue = useMemo(() => {
    return workQueue.filter((w) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchSearch = w.wo_number.toLowerCase().includes(q)
          || w.title.toLowerCase().includes(q)
          || (w.customer || '').toLowerCase().includes(q)
          || (w.item_titles || []).some((t) => t.toLowerCase().includes(q));
        if (!matchSearch) return false;
      }
      if (filters.statusFilter !== 'ALL' && w.status !== filters.statusFilter) return false;
      if (filters.modelFilter !== 'ALL' && w.machine_model_id !== Number(filters.modelFilter)) return false;
      if (filters.versionFilter !== 'ALL' && w.machine_model_version_id !== Number(filters.versionFilter)) return false;
      if (filters.complexityFilter !== 'ALL' && w.complexity_code !== filters.complexityFilter) return false;
      if (filters.fwRelatedFilter === 'FW' && !w.all_fw_related) return false;
      if (filters.fwRelatedFilter === 'NON_FW' && w.all_fw_related) return false;
      if (filters.dateFrom && new Date(w.created_at) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(w.created_at) > new Date(filters.dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [workQueue, filters]);

  const matchingCount = filteredQueue.length;
  const hasActiveFilters = filters.search || filters.statusFilter !== 'ALL' || filters.modelFilter !== 'ALL'
    || filters.versionFilter !== 'ALL' || filters.complexityFilter !== 'ALL'
    || filters.fwRelatedFilter !== 'ALL' || filters.dateFrom || filters.dateTo;

  const filteredKpis = useMemo(() => ({
    active_wos: filteredQueue.filter((w) => ['DRAFT', 'ANALYZED'].includes(w.status)).length,
    pending_review: filteredQueue.filter((w) => w.has_pending_review).length,
    in_progress: filteredQueue.filter((w) => w.status === 'ANALYZED').length,
    completed: filteredQueue.filter((w) => ['PRODUCTION', 'COMPLETED'].includes(w.status)).length,
    total_estimated_hours: filteredQueue.reduce((s, w) => s + w.total_estimated_hours, 0),
    overdue: filteredQueue.filter((w) => w.has_overdue).length,
  }), [filteredQueue]);

  const filteredStatusDistribution = useMemo(() => {
    const counts = {};
    filteredQueue.forEach((w) => { counts[w.status] = (counts[w.status] || 0) + 1; });
    return ['DRAFT', 'ANALYZED', 'FINALIZED', 'PRODUCTION', 'COMPLETED']
      .filter((s) => counts[s])
      .map((s) => ({ status: s, count: counts[s] }));
  }, [filteredQueue]);

  const filteredWorkload = useMemo(() => ({
    queued: filteredQueue.filter((w) => w.status === 'DRAFT').reduce((s, w) => s + w.total_estimated_hours, 0),
    in_progress: filteredQueue.filter((w) => ['ANALYZED', 'FINALIZED', 'PRODUCTION'].includes(w.status)).reduce((s, w) => s + w.total_estimated_hours, 0),
    completed: filteredQueue.filter((w) => w.status === 'COMPLETED').reduce((s, w) => s + w.total_estimated_hours, 0),
  }), [filteredQueue]);

  const filteredTrend = useMemo(() => {
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() - (i * 7));
      d.setHours(0, 0, 0, 0);
      weeks.push({ week: formatLocalDate(d), hours_queued: 0, hours_in_progress: 0, hours_completed: 0 });
    }
    filteredQueue.forEach((w) => {
      const refDate = w.status === 'DRAFT' ? w.created_at : w.updated_at;
      if (!refDate) return;
      const wk = getWeekStart(refDate);
      const bucket = weeks.find((b) => b.week === wk);
      if (!bucket) return;
      if (w.status === 'DRAFT') bucket.hours_queued += w.total_estimated_hours;
      else if (['ANALYZED', 'FINALIZED', 'PRODUCTION'].includes(w.status)) bucket.hours_in_progress += w.total_estimated_hours;
      else if (w.status === 'COMPLETED') bucket.hours_completed += w.total_estimated_hours;
    });
    return weeks;
  }, [filteredQueue]);

  const filteredAttention = useMemo(() => {
    if (!hasActiveFilters) return rawAttention;
    const queueIds = new Set(filteredQueue.map((w) => w.id));
    return rawAttention.filter((a) => queueIds.has(a.work_order_id));
  }, [rawAttention, filteredQueue, hasActiveFilters]);

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
    matchingCount,
    hasActiveFilters,
    uniqueModels,
    uniqueVersions,
    uniqueComplexities,
    filteredKpis,
    filteredStatusDistribution,
    filteredWorkload,
    filteredTrend,
    filteredAttention,
  };
}
