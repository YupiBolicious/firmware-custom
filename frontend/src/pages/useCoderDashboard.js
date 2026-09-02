import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../api/client';

const ACTION_LABELS = {
  ITEM_REVIEWED: 'Classification confirmed',
  WORK_ORDER_ANALYZED: 'Work order analyzed',
  WORK_ORDER_FINALIZED: 'Work order finalized',
  WORK_ORDER_CREATED: 'Work order created',
  ITEM_ADDED: 'Custom item added',
};

const CLASSIFICATION_STATUS_LABELS = {
  CLASSIFIED: 'Classified',
  NON_FIRMWARE: 'Non-Firmware',
  CODER_REVIEW: 'Coder Review',
  PENDING: 'Pending',
};

const ACTIVITY_PAGE_SIZE = 15;
const NEW_WO_PAGE_SIZE = 15;

const WORK_ORDER_STATUS_LABELS = {
  DRAFT: 'Draft',
  ANALYZED: 'Analyzed',
  FINALIZED: 'Finalized',
  PRODUCTION: 'In Production',
  COMPLETED: 'Completed',
};

function formatAction(action, details) {
  const label = ACTION_LABELS[action] || action;
  if (details?.complexity_code) return `${label} (${details.complexity_code})`;
  if (details?.wo_number) return `${label} — ${details.wo_number}`;
  if (details?.item_number) return `${label} — ${details.item_number}`;
  return label;
}

const initialFilters = {
  search: '',
  complexityFilter: 'ALL',
  // confidenceMin: '',
  // confidenceMax: '',
  classificationStatusFilter: 'ALL',
  workOrderStatusFilter: 'ALL',
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
  const [activityPage, setActivityPage] = useState(1);
  const [newWoPage, setNewWoPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/coder-dashboard', {
          params: { activity_page: activityPage, new_wo_page: newWoPage, limit: ACTIVITY_PAGE_SIZE },
        });
        setData(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activityPage, newWoPage]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
  }, []);

  const reviewQueue = data?.review_queue || [];
  const workQueue = data?.work_queue || [];

  const coderActivity = data?.coder_activity?.items || [];
  const newWorkOrders = data?.new_work_orders?.items || [];
  const coderActivityTotal = data?.coder_activity?.total || 0;
  const newWorkOrdersTotal = data?.new_work_orders?.total || 0;
  const coderActivityTotalPages = Math.max(1, Math.ceil(coderActivityTotal / ACTIVITY_PAGE_SIZE));
  const newWorkOrdersTotalPages = Math.max(1, Math.ceil(newWorkOrdersTotal / NEW_WO_PAGE_SIZE));

  const uniqueComplexities = useMemo(() => {
    const set = new Set(
      [...reviewQueue, ...workQueue].map((r) => r.complexity_code).filter(Boolean)
    );
    return [...set].sort();
  }, [reviewQueue, workQueue]);

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
      if (filters.workOrderStatusFilter !== 'ALL' && r.work_order_status !== filters.workOrderStatusFilter) return false;
      if (filters.dateFrom && new Date(r.created_at) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(r.created_at) > new Date(filters.dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [workQueue, filters]);

  const matchingCount = filteredReviewQueue.length + filteredWorkQueue.length;
  const totalCount = reviewQueue.length + workQueue.length;
  const hasActiveFilters = filters.search || filters.complexityFilter !== 'ALL'
    || filters.confidenceMin || filters.confidenceMax
    || filters.classificationStatusFilter !== 'ALL' || filters.workOrderStatusFilter !== 'ALL'
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

  const filteredTrend = useMemo(() => {
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay() - (i * 7));
      d.setHours(0, 0, 0, 0);
      weeks.push({ week: formatLocalDate(d), items_queued: 0, items_completed: 0, hours_queued: 0, hours_completed: 0 });
    }

    filteredReviewQueue.forEach((r) => {
      if (!r.created_at) return;
      const wk = getWeekStart(r.created_at);
      const bucket = weeks.find((b) => b.week === wk);
      if (bucket) {
        bucket.items_queued += 1;
        bucket.hours_queued += r.estimated_hours;
      }
    });

    filteredWorkQueue.forEach((r) => {
      if (!r.created_at) return;
      const wk = getWeekStart(r.created_at);
      const bucket = weeks.find((b) => b.week === wk);
      if (!bucket) return;
      if (['CLASSIFIED', 'NON_FIRMWARE'].includes(r.classification_status)) {
        bucket.items_completed += 1;
        bucket.hours_completed += r.estimated_hours;
      }
    });

    return weeks;
  }, [filteredReviewQueue, filteredWorkQueue]);

  return {
    data,
    error,
    loading,
    formatAction,
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
    coderActivity,
    newWorkOrders,
    activityPage,
    setActivityPage,
    newWoPage,
    setNewWoPage,
    coderActivityTotalPages,
    newWorkOrdersTotalPages,
    CLASSIFICATION_STATUS_LABELS,
    WORK_ORDER_STATUS_LABELS,
  };
}
