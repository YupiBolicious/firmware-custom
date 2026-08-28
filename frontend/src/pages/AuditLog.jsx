import { Link } from 'react-router-dom';
import RelativeTime from '../components/RelativeTime';
import useAuditLog from './useAuditLog';

const ACTION_BADGE = {
  DOCUMENTS_UPLOADED: 'badge-muted',
  ITEM_ADDED: 'badge-info',
  ITEM_DELETED: 'badge-muted',
  ITEM_REVIEWED: 'badge-success',
  ITEM_UPDATED: 'badge-info',
  WORK_ORDER_ANALYZED: 'badge-info',
  WORK_ORDER_COMPLETED: 'badge-success',
  WORK_ORDER_CREATED: 'badge-warning',
  WORK_ORDER_FINALIZED: 'badge-warning',
  WORK_ORDER_PRODUCTION: 'badge-warning',
  WORK_ORDER_RESET_TO_DRAFT: 'badge-muted',
  WORK_ORDER_UPDATED: 'badge-warning',
};

function formatWorkOrder(item) {
  if (item.work_order_id) {
    return {
      workOrderId: item.work_order_id,
      woNumber: item.wo_number,
      woTitle: item.wo_title,
    };
  }
  if (item.entity_type === 'WORK_ORDER') {
    const woNumber = item.details?.wo_number || item.details?.work_order_number;
    if (woNumber) {
      return { workOrderId: item.entity_id, woNumber, woTitle: undefined };
    }
    return null;
  }
  if (item.entity_type === 'WORK_ORDER_ITEM' && item.details?.work_order_id) {
    return {
      workOrderId: item.details.work_order_id,
      woNumber: `WO #${item.details.work_order_id}`,
      woTitle: undefined,
    };
  }
  return null;
}

function formatEntity(item) {
  if (item.entity_type === 'WORK_ORDER_ITEM') {
    if (item.item_number) return `${item.item_number}`;
    if (item.details?.item_number) return `${item.details.item_number}`;
    return `#${item.entity_id}`;
  }
  if (item.entity_type === 'WORK_ORDER') return 'Work Order';
  return `${item.entity_type} #${item.entity_id || '-'}`;
}

function formatDetail(item) {
  const { wo_number, work_order_number, item_number, work_order_id, title, complexity_code, ...rest } = item.details || {};
  const parts = [];
  if (title) parts.push(title);
  if (rest.status) parts.push(`status: ${rest.status}`);
  if (complexity_code) parts.push(`complexity: ${complexity_code}`);
  if (rest.quantity != null) parts.push(`qty: ${rest.quantity}`);
  if (rest.trigger) parts.push(`trigger: ${rest.trigger}`);
  if (rest.fw_related != null) parts.push(`fw: ${rest.fw_related ? 'yes' : 'no'}`);
  return parts.length ? parts.join(', ') : '';
}

export default function AuditLog() {
  const {
    items, filteredItems, paginatedItems, actions, users, uniqueWorkOrders,
    error, loading, filters, setFilter, clearFilters,
    showAdvanced, setShowAdvanced,
    page, setPage, totalPages, PAGE_SIZE,
    matchingCount, hasActiveFilters, formatAction,
  } = useAuditLog();

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div>
      <h1>Audit Log</h1>
      {/* <div className="text-muted mb-16">
        Records every action across the system, including who performed it and when.
      </div> */}

      <div className="panel mb-16">
        <div className="flex justify-between align-center mb-8">
          <h3 style={{ margin: 0 }}>
            Activity
            {hasActiveFilters && (
              <span style={{ fontSize: 13, fontWeight: 400, color: '#aaa', marginLeft: 8 }}>
                {matchingCount} of {items.length} shown
              </span>
            )}
          </h3>
          <div className="flex gap-8">
            {hasActiveFilters && (
              <button className="btn btn-secondary btn-sm" onClick={clearFilters}>Clear Filters</button>
            )}
          </div>
        </div>

        <div className="flex gap-8 mb-8">
          <input
            style={{ flex: 1, padding: '6px 10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#e0e0e0', fontSize: 13 }}
            placeholder="Search action, entity, WO number, item number, user..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
          />
          <button
            className={`btn btn-sm ${showAdvanced ? '' : 'btn-secondary'}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            Advanced Filters {showAdvanced ? '\u25B2' : '\u25BC'}
          </button>
        </div>

        {showAdvanced && (
          <div style={{ padding: 12, background: '#1a1a1a', borderRadius: 6, border: '1px solid #333', marginBottom: 12 }}>
            <div className="flex gap-8" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
              <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Action</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.actionFilter}
                  onChange={(e) => setFilter('actionFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {actions.map((a) => (
                    <option key={a} value={a}>{formatAction(a)}</option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>User</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.userFilter}
                  onChange={(e) => setFilter('userFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 160 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>Work Order</label>
                <select
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.woFilter}
                  onChange={(e) => setFilter('woFilter', e.target.value)}
                >
                  <option value="ALL">All</option>
                  {uniqueWorkOrders.map((wo) => (
                    <option key={wo.work_order_id} value={wo.work_order_id}>
                      {wo.wo_number} - {wo.wo_title || ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>From</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.dateFrom}
                  onChange={(e) => setFilter('dateFrom', e.target.value)}
                />
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
                <label style={{ fontSize: 11, color: '#aaa' }}>To</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: '4px 6px', background: '#222', border: '1px solid #444', borderRadius: 4, color: '#e0e0e0', fontSize: 12 }}
                  value={filters.dateTo}
                  onChange={(e) => setFilter('dateTo', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="text-muted">
            {hasActiveFilters ? 'No audit entries match the current filters.' : 'No audit entries found.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Work Orders</th>
                <th>Entity</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => {
                const wo = formatWorkOrder(item);
                return (
                  <tr key={item.id}>
                    <td className="text-muted"><RelativeTime date={item.created_at} /></td>
                    <td>{item.user_name || <span className="text-muted">System</span>}</td>
                    <td>
                      <span className={`badge ${ACTION_BADGE[item.action] || 'badge-muted'}`}>
                        {formatAction(item.action)}
                      </span>
                    </td>
                    <td>
                      {wo ? (
                        <Link to={`/work-orders/${wo.workOrderId}`}>
                          {wo.woNumber}
                        </Link>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>{formatEntity(item)}</td>
                    <td className="text-muted">{formatDetail(item) || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex justify-between align-center" style={{ marginTop: 12 }}>
            <span className="text-muted" style={{ fontSize: 13 }}>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-8">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                Prev
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}