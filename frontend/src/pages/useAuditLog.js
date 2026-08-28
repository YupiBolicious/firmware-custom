import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../api/client';

const ACTION_LABELS = {
  DOCUMENTS_UPLOADED: 'Documents uploaded',
  ITEM_ADDED: 'Item added',
  ITEM_DELETED: 'Item deleted',
  ITEM_REVIEWED: 'Item reviewed',
  ITEM_UPDATED: 'Item updated',
  WORK_ORDER_ANALYZED: 'Work order analyzed',
  WORK_ORDER_COMPLETED: 'Work order completed',
  WORK_ORDER_CREATED: 'Work order created',
  WORK_ORDER_FINALIZED: 'Work order finalized',
  WORK_ORDER_PRODUCTION: 'Work order in production',
  WORK_ORDER_RESET_TO_DRAFT: 'Work order reset to draft',
  WORK_ORDER_UPDATED: 'Work order updated',
};

const initialFilters = {
  search: '',
  actionFilter: 'ALL',
  userFilter: 'ALL',
  woFilter: 'ALL',
  dateFrom: '',
  dateTo: '',
};

const PAGE_SIZE = 15;

export default function useAuditLog() {
  const [items, setItems] = useState([]);
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/audit-log');
        setItems(res.data.data.items || []);
        setActions(res.data.data.actions || []);
        setUsers(res.data.data.users || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load audit log');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
    setPage(1);
  }, []);

  const uniqueWorkOrders = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (!item.work_order_id) return;
      if (!map.has(item.work_order_id)) {
        map.set(item.work_order_id, {
          work_order_id: item.work_order_id,
          wo_number: item.wo_number,
          wo_title: item.wo_title,
        });
      }
    });
    return [...map.values()].sort((a, b) =>
      String(a.wo_number || '').localeCompare(String(b.wo_number || ''))
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const entityRef = `${item.details?.wo_number || ''} ${item.details?.item_number || ''} ${item.entity_id || ''}`.toLowerCase();
        const matchSearch = (item.action || '').toLowerCase().includes(q)
          || (item.entity_type || '').toLowerCase().includes(q)
          || entityRef.includes(q)
          || (item.user_name || '').toLowerCase().includes(q)
          || (item.wo_number || '').toLowerCase().includes(q)
          || (item.wo_title || '').toLowerCase().includes(q);
        if (!matchSearch) return false;
      }
      if (filters.actionFilter !== 'ALL' && item.action !== filters.actionFilter) return false;
      if (filters.userFilter !== 'ALL' && item.user_id !== Number(filters.userFilter)) return false;
      if (filters.woFilter !== 'ALL' && item.work_order_id !== Number(filters.woFilter)) return false;
      if (filters.dateFrom && new Date(item.created_at) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(item.created_at) > new Date(filters.dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [items, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const matchingCount = filteredItems.length;
  const hasActiveFilters = filters.search || filters.actionFilter !== 'ALL'
    || filters.userFilter !== 'ALL' || filters.woFilter !== 'ALL'
    || filters.dateFrom || filters.dateTo;

  return {
    items,
    filteredItems,
    paginatedItems,
    actions,
    users,
    uniqueWorkOrders,
    error,
    loading,
    filters,
    setFilter,
    clearFilters,
    showAdvanced,
    setShowAdvanced,
    page: currentPage,
    setPage,
    totalPages,
    PAGE_SIZE,
    matchingCount,
    hasActiveFilters,
    ACTION_LABELS,
    formatAction: (action) => ACTION_LABELS[action] || action,
  };
}