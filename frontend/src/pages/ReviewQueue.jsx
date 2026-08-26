import { Link } from 'react-router-dom';
import useReviewQueue from './useReviewQueue';

export default function ReviewQueue() {
  const {
    items, error, loading, levels,
    selections, setSelections,
    keywordInputs, setKeywordInputs,
    reviewing, review,
  } = useReviewQueue();

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

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
              <th>Keywords</th>
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
                  <input
                    placeholder="optional keywords"
                    value={keywordInputs[item.item_id] || ''}
                    onChange={(event) => setKeywordInputs({ ...keywordInputs, [item.item_id]: event.target.value })}
                  />
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
