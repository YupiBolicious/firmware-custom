import { useEffect, useState } from 'react';
import api from '../api/client';

export default function useReviewQueue() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState([]);
  const [selections, setSelections] = useState({});
  const [keywordInputs, setKeywordInputs] = useState({});
  const [reviewing, setReviewing] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [queueRes, levelsRes] = await Promise.all([
          api.get('/work-orders/review-queue'),
          api.get('/complexity-levels'),
        ]);
        setItems(queueRes.data.data);
        setLevels(levelsRes.data.data.filter((level) => /^L[0-5]$/.test(level.code)));
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load review queue');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const review = async (item) => {
    const complexity_level_id = Number(selections[item.item_id]);
    if (!complexity_level_id) return;
    setError('');
    setReviewing(item.item_id);
    try {
      await api.post(`/work-orders/items/${item.item_id}/review`, {
        complexity_level_id,
        keywords: keywordInputs[item.item_id]?.trim() || undefined,
      });
      setItems((current) => current.filter((currentItem) => currentItem.item_id !== item.item_id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to confirm review');
    } finally {
      setReviewing(null);
    }
  };

  return {
    items,
    error,
    loading,
    levels,
    selections,
    setSelections,
    keywordInputs,
    setKeywordInputs,
    reviewing,
    review,
    setError,
  };
}
