import { Link } from 'react-router-dom';
import RelativeTime from '../components/RelativeTime';
import StatusBadge from '../components/StatusBadge';

export const DASHBOARD_WO_COLUMNS = [
  {
    key: 'work-order',
    label: 'Work Order',
    render: (workOrder) => (
      <Link to={`/work-orders/${workOrder.id}`}>
        <strong>{workOrder.wo_number}</strong>
      </Link>
    ),
  },
  { key: 'customer', label: 'Customer', className: 'text-muted', render: (workOrder) => workOrder.customer || '-' },
  { key: 'status', label: 'Status', render: (workOrder) => <StatusBadge status={workOrder.status} /> },
  {
    key: 'open-items',
    label: 'Open Items',
    render: (workOrder) => Number(workOrder.open_count) > 0
      ? <span className="badge badge-warning">{workOrder.open_count} of {workOrder.item_count}</span>
      : <span className="text-muted">{workOrder.done_count ?? workOrder.items_classified ?? 0}/{workOrder.item_count ?? 0}</span>,
  },
  {
    key: 'hours',
    label: 'Hours',
    render: (workOrder) => {
      const hours = Number(workOrder.total_hours ?? workOrder.total_estimated_hours) || 0;
      return hours > 0 ? `${hours.toFixed(1)}h` : '-';
    },
  },
  {
    key: 'updated',
    label: 'Updated',
    className: 'text-muted',
    render: (workOrder) => {
      const updatedAt = workOrder.last_activity || workOrder.updated_at;
      return updatedAt ? <RelativeTime date={updatedAt} /> : '-';
    },
  },
];

export default function WoDashboardList({
  title = 'Work Orders',
  rows = [],
  total = 0,
  page = 1,
  totalPages = 1,
  onPageChange,
  columns = [],
  filterControls,
  hasActiveFilters = false,
  emptyMessage = 'No work orders yet.',
}) {
  return (
    <div className="panel mb-16">
      <h3 className="mb-16">
        {title}
        {total > 0 && (
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            {total} total
          </span>
        )}
      </h3>

      {filterControls}

      {rows.length === 0 ? (
        <div className="text-muted">
          {hasActiveFilters ? 'No work orders match the current filters.' : emptyMessage}
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {columns.map((column) => (
                      <td key={column.key} className={column.className}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-between align-center" style={{ marginTop: 12 }}>
              <span className="text-muted" style={{ fontSize: 13 }}>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-8">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                >
                  Prev
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}