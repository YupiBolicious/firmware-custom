import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';

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
  const [workOrders, setWorkOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/audit-log', {
          params: {
            page,
            limit: PAGE_SIZE,
            search: filters.search,
            action: filters.actionFilter,
            user_id: filters.userFilter,
            work_order_id: filters.woFilter,
            date_from: filters.dateFrom,
            date_to: filters.dateTo,
          },
        });
        setItems(res.data.data.items || []);
        setActions(res.data.data.actions || []);
        setUsers(res.data.data.users || []);
        setWorkOrders(res.data.data.workOrders || []);
        setTotal(res.data.data.total || 0);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load audit log');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page, filters.search, filters.actionFilter, filters.userFilter, filters.woFilter, filters.dateFrom, filters.dateTo]);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(initialFilters);
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const matchingCount = total;
  const hasActiveFilters = filters.search || filters.actionFilter !== 'ALL'
    || filters.userFilter !== 'ALL' || filters.woFilter !== 'ALL'
    || filters.dateFrom || filters.dateTo;

  return {
    items,
    filteredItems: items,
    paginatedItems: items,
    actions,
    users,
    uniqueWorkOrders: workOrders,
    error,
    loading,
    filters,
    setFilter,
    clearFilters,
    showAdvanced,
    setShowAdvanced,
    page,
    setPage,
    totalPages,
    PAGE_SIZE,
    matchingCount,
    hasActiveFilters,
    formatAction: (action) => {
      const s = (action || '').toLowerCase().replace(/_/g, ' ');
      return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    },
  };
}