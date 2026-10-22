import { useEffect, useState } from 'react';
import api from '../api/client';

export default function usePendingReview() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/work-orders/pending-review', { params: { page } });
        setItems(res.data.data.items);
        setTotalPages(res.data.data.totalPages);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load pending review items');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page]);

  return { items, error, loading, page, setPage, totalPages };
}
