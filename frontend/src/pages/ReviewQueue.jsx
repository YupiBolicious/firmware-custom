import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function ReviewQueue() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [levels, setLevels] = useState([]);
  const [selections, setSelections] = useState({});
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

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const review = async (item) => {
    const complexity_level_id = Number(selections[item.item_id]);
    if (!complexity_level_id) return;
    setError('');
    setReviewing(item.item_id);
    try {
      await api.post(`/work-orders/items/${item.item_id}/review`, { complexity_level_id });
      setItems((current) => current.filter((currentItem) => currentItem.item_id !== item.item_id));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to confirm review');
    } finally {
      setReviewing(null);
    }
  };

  return (
    <div>
      <h1>Coder Review Queue</h1>
      {items.length === 0 ? (
        <div className="panel text-muted">No items waiting for coder review.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Work Order</th>
              <th>Item</th>
              <th>Title</th>
              <th>Reason</th>
              <th>Complexity</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.item_id}>
                <td><Link to={`/work-orders/${item.work_order_id}`}>{item.wo_number}</Link></td>
                <td>{item.item_number}</td>
                <td>{item.title}</td>
                <td>{item.classification_reason}</td>
                <td>
                  <select
                    value={selections[item.item_id] || ''}
                    onChange={(event) => setSelections({ ...selections, [item.item_id]: event.target.value })}
                  >
                    <option value="">Select L0-L5</option>
                    {levels.map((level) => <option key={level.id} value={level.id}>{level.code} - {level.name}</option>)}
                  </select>
                </td>
                <td>
                  <Link className="btn btn-secondary btn-sm" to={`/work-orders/${item.work_order_id}`}>Open</Link>{' '}
                  <button className="btn btn-sm" onClick={() => review(item)} disabled={!selections[item.item_id] || reviewing === item.item_id}>
                    {reviewing === item.item_id ? 'Saving...' : 'Confirm'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}