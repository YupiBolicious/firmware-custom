import { useEffect, useState } from 'react';
import api from '../api/client';

export default function useReviewQueue() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState([]);
  const [selections, setSelections] = useState({});
  const [assistResponses, setAssistResponses] = useState({});
  const [keywordInputs, setKeywordInputs] = useState({});
  const [reviewing, setReviewing] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const load = async () => {
      try {
        const [queueRes, levelsRes] = await Promise.all([
          api.get('/work-orders/review-queue', { params: { page } }),
          api.get('/complexity-levels'),
        ]);
        setItems(queueRes.data.data.items);
        setTotalPages(queueRes.data.data.totalPages);
        setLevels(levelsRes.data.data.filter((level) => /^L[0-5]$/.test(level.code)));
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load review queue');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [page]);

  const review = async (item) => {
    const complexity_level_id = Number(selections[item.item_id]);
    if (!complexity_level_id) return;
    if (item.assist_kb_code && !(assistResponses[item.item_id] || item.assist_response)) return;
    setError('');
    setReviewing(item.item_id);
    try {
      await api.post(`/work-orders/items/${item.item_id}/review`, {
        complexity_level_id,
        keywords: keywordInputs[item.item_id]?.trim() || undefined,
        semantic_assist_response: item.assist_kb_code ? (assistResponses[item.item_id] || item.assist_response || undefined) : undefined,
      });
      setItems((current) => {
        const remaining = current.filter((currentItem) => currentItem.item_id !== item.item_id);
        // ponytail: reviewed page fully drained on page > 1 → step back one page (cheap guard, no refetch needed)
        if (remaining.length === 0 && page > 1) setPage(page - 1);
        return remaining;
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to confirm review');
    } finally {
      setReviewing(null);
    }
  };

  const acceptAssist = (item) => {
    setAssistResponses({ ...assistResponses, [item.item_id]: 'ACCEPTED' });
    if (item.assist_complexity_level_id
      && levels.some((level) => String(level.id) === String(item.assist_complexity_level_id))) {
      setSelections({ ...selections, [item.item_id]: String(item.assist_complexity_level_id) });
    }
  };

  const ignoreAssist = (item) => {
    setAssistResponses({ ...assistResponses, [item.item_id]: 'IGNORED' });
  };

  const assistPending = (item) => !!(item.assist_kb_code && !(assistResponses[item.item_id] || item.assist_response));

  const canConfirm = (item) => !!(selections[item.item_id] && !assistPending(item));

  return {
    items,
    error,
    loading,
    levels,
    selections,
    setSelections,
    assistResponses,
    acceptAssist,
    ignoreAssist,
    assistPending,
    canConfirm,
    keywordInputs,
    setKeywordInputs,
    reviewing,
    review,
    setError,
    page,
    setPage,
    totalPages,
  };
}
