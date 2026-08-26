import { useEffect, useState } from 'react';
import api from '../api/client';

const ACTION_LABELS = {
  ITEM_REVIEWED: 'Classification confirmed',
  WORK_ORDER_ANALYZED: 'Work order analyzed',
  WORK_ORDER_FINALIZED: 'Work order finalized',
  WORK_ORDER_CREATED: 'Work order created',
  ITEM_ADDED: 'Custom item added',
};

function formatAction(action, details) {
  const label = ACTION_LABELS[action] || action;
  if (details?.complexity_code) return `${label} (${details.complexity_code})`;
  if (details?.wo_number) return `${label} — ${details.wo_number}`;
  if (details?.item_number) return `${label} — ${details.item_number}`;
  return label;
}

export default function useCoderDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/coder-dashboard');
        setData(res.data.data);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { data, error, loading, formatAction };
}
