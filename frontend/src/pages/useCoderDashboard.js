import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../api/client';

const CLASSIFICATION_STATUS_LABELS = {
  CLASSIFIED: 'Classified',
  NON_FIRMWARE: 'Non-Firmware',
  CODER_REVIEW: 'Coder Review',
  PENDING: 'Pending',
};

const WORK_ORDER_STATUS_LABELS = {
  DRAFT: 'Draft',
  ANALYZED: 'Analyzed',
  FINALIZED: 'Finalized',
  PRODUCTION: 'Production',
  COMPLETED: 'Completed',
};

const initialFilters = {
  search: '',
  complexityFilter: 'ALL',
  classificationStatusFilter: 'ALL',
  statusFilter: 'ALL',
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

export default function useCoderDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workOrderPage, setWorkOrderPage] = useState(1);

  useEffect(() => {
    setWorkOrderPage(1);
  }, [filters.search, filters.statusFilter, filters.complexityFilter, filters.classificationStatusFilter, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/coder-dashboard', {
          params: {
            work_order_page: workOrderPage,
            work_order_search: filters.search,
            work_order_status: filters.statusFilter,
            complexity: filters.complexityFilter,
            classification_status: filters.classificationStatusFilter,
            date_from: filters.dateFrom,
            date_to: filters.dateTo,
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
  }, [workOrderPage, filters.search, filters.statusFilter, filters.complexityFilter, filters.classificationStatusFilter, filters.dateFrom, filters.dateTo]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'classificationStatusFilter' || key === 'statusFilter') next.complexityFilter = 'ALL';
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
  }, []);

  const reviewQueue = data?.review_queue || [];
  const workQueue = data?.work_queue || [];

  const workOrderQueue = data?.work_order_queue?.items || [];
  const workOrderQueueTotal = data?.work_order_queue?.total || 0;
  const workOrderQueueTotalPages = Math.max(1, Math.ceil(workOrderQueueTotal / 10));

  const uniqueComplexities = useMemo(() => {
    const matches = (r) => {
      const cls = r.classification_status ?? r.status;
      if (filters.classificationStatusFilter !== 'ALL' && cls !== filters.classificationStatusFilter) return false;
      if (filters.statusFilter !== 'ALL' && r.work_order_status !== filters.statusFilter) return false;
      return true;
    };
    const set = new Set(
      [...reviewQueue, ...workQueue].filter(matches).map((r) => r.complexity_code).filter(Boolean)
    );
    return [...set].sort();
  }, [reviewQueue, workQueue, filters.classificationStatusFilter, filters.statusFilter]);

  const filteredReviewQueue = useMemo(() => {
    return reviewQueue.filter((r) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchSearch = r.wo_number.toLowerCase().includes(q)
          || r.title.toLowerCase().includes(q)
          || r.item_number.toLowerCase().includes(q);
        if (!matchSearch) return false;
      }
      if (filters.complexityFilter !== 'ALL' && r.complexity_code !== filters.complexityFilter) return false;
      if (filters.confidenceMin && (r.confidence_score == null || r.confidence_score < Number(filters.confidenceMin))) return false;
      if (filters.confidenceMax && (r.confidence_score == null || r.confidence_score > Number(filters.confidenceMax))) return false;
      if (filters.dateFrom && new Date(r.created_at) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(r.created_at) > new Date(filters.dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [reviewQueue, filters]);

  const filteredWorkQueue = useMemo(() => {
    return workQueue.filter((r) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchSearch = r.wo_number.toLowerCase().includes(q)
          || r.title.toLowerCase().includes(q)
          || r.item_number.toLowerCase().includes(q)
          || (r.description || '').toLowerCase().includes(q);
        if (!matchSearch) return false;
      }
      if (filters.complexityFilter !== 'ALL' && r.complexity_code !== filters.complexityFilter) return false;
      if (filters.classificationStatusFilter !== 'ALL' && r.classification_status !== filters.classificationStatusFilter) return false;
      if (filters.statusFilter !== 'ALL' && r.work_order_status !== filters.statusFilter) return false;
      if (filters.dateFrom && new Date(r.created_at) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(r.created_at) > new Date(filters.dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [workQueue, filters]);

  const matchingCount = filteredReviewQueue.length + filteredWorkQueue.length;
  const totalCount = reviewQueue.length + workQueue.length;
  const hasActiveFilters = filters.search || filters.complexityFilter !== 'ALL'
    || filters.confidenceMin || filters.confidenceMax
    || filters.classificationStatusFilter !== 'ALL' || filters.statusFilter !== 'ALL'
    || filters.dateFrom || filters.dateTo;

  const filteredKpis = useMemo(() => ({
    pending_review: filteredReviewQueue.length,
    pending_hours: filteredReviewQueue.reduce((s, r) => s + r.estimated_hours, 0),
    completed: data?.kpis.completed ?? 0,
    completed_hours: data?.kpis.completed_hours ?? 0,
    overdue: data?.kpis.overdue ?? 0,
  }), [filteredReviewQueue, data]);

  const filteredWorkload = useMemo(() => {
    const queued = filteredWorkQueue.filter((r) => r.work_order_status === 'DRAFT').reduce((s, r) => s + r.estimated_hours, 0);
    const inProgress = filteredWorkQueue.filter((r) => r.work_order_status === 'ANALYZED').reduce((s, r) => s + r.estimated_hours, 0);
    const completed = filteredWorkQueue.filter((r) => ['FINALIZED', 'PRODUCTION', 'COMPLETED'].includes(r.work_order_status)).reduce((s, r) => s + r.estimated_hours, 0);
    return { queued_hours: queued, in_progress_hours: inProgress, completed_hours: completed };
  }, [filteredWorkQueue]);

  const TREND_DAYS = 90;
  const filteredTrend = useMemo(() => {
    const weeks = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() - (i * 7));
      d.setHours(0, 0, 0, 0);
      weeks.push({ week: formatLocalDate(d), items_queued: 0, items_completed: 0, hours_queued: 0, hours_completed: 0 });
    }
    // Alternatively, build 90-day span? But chart is weekly buckets. Using 12 full weeks before current week to cover ~90 days
    const filteredWeeks = [];
    for (let i = 12; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() - (i * 7));
      d.setHours(0, 0, 0, 0);
      filteredWeeks.push({ week: formatLocalDate(d), items_queued: 0, items_completed: 0, hours_queued: 0, hours_completed: 0 });
    }
    filteredWeeks.forEach((w) => weeks.push(w));
    // deduplicate
    const map = new Map();
    weeks.forEach((w) => map.set(w.week, { ...map.get(w.week) || { week: w.week, items_queued: 0, items_completed: 0, hours_queued: 0, hours_completed: 0 }, items_queued: map.get(w.week)?.items_queued || w.items_queued, items_completed: map.get(w.week)?.items_completed || w.items_completed, hours_queued: Number(map.get(w.week)?.hours_queued || 0) + Number(w.hours_queued || 0), hours_completed: Number(map.get(w.week)?.hours_completed || 0) + Number(w.hours_completed || 0) }));
    // simpler
    const wk = [];
    for (let i = 12; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() - (i * 7));
      d.setHours(0, 0, 0, 0);
      wk.push({ week: formatLocalDate(d), items_queued: 0, items_completed: 0, hours_queued: 0, hours_completed: 0 });
    }
    // fill
    const byWeek = new Map(wk.map((x) => [x.week, { ...x }]));
    filteredReviewQueue.forEach((r) => {
      if (!r.created_at) return;
      const ws = getWeekStart(r.created_at);
      if (byWeek.has(ws)) {
        byWeek.get(ws).items_queued += 1;
        byWeek.get(ws).hours_queued += r.estimated_hours || 0;
      }
    });
    filteredWorkQueue.forEach((r) => {
      if (!r.created_at) return;
      const ws = getWeekStart(r.created_at);
      if (byWeek.has(ws) && ['CLASSIFIED', 'NON_FIRMWARE'].includes(r.classification_status)) {
        byWeek.get(ws).items_completed += 1;
        byWeek.get(ws).hours_completed += r.estimated_hours || 0;
      }
    });
    return [...byWeek.values()];
  }, [filteredReviewQueue, filteredWorkQueue]);

  return {
    data,
    error,
    loading,
    filters,
    showAdvanced,
    setShowAdvanced,
    setFilter,
    clearFilters,
    filteredReviewQueue,
    filteredWorkQueue,
    filteredKpis,
    filteredWorkload,
    filteredTrend,
    matchingCount,
    totalCount,
    hasActiveFilters,
    uniqueComplexities,
    workOrderQueue,
    workOrderQueueTotal,
    workOrderQueueTotalPages,
    workOrderPage,
    setWorkOrderPage,
    CLASSIFICATION_STATUS_LABELS,
    WORK_ORDER_STATUS_LABELS,
  };
}
