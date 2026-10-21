import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';

export default function useWOComments(workOrderId) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!workOrderId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/work-orders/${workOrderId}/comments`);
      setComments(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    load();
  }, [load]);

  const addComment = useCallback(async (content) => {
    if (!workOrderId) return;
    const trimmed = String(content || '').trim();
    if (!trimmed) return;
    setPosting(true);
    setError('');
    try {
      const res = await api.post(`/work-orders/${workOrderId}/comments`, { content: trimmed });
      setComments((prev) => [...prev, res.data?.data]);
      return res.data?.data;
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add comment');
      throw err;
    } finally {
      setPosting(false);
    }
  }, [workOrderId]);

  const deleteComment = useCallback(async (commentId) => {
    if (!workOrderId || !commentId) return;
    setError('');
    try {
      await api.delete(`/work-orders/${workOrderId}/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => Number(c.id) !== Number(commentId)));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete comment');
      throw err;
    }
  }, [workOrderId]);

  return { comments, loading, posting, error, load, addComment, deleteComment, setComments };
}
