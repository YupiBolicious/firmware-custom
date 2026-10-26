// Maps classification status to a badge
const MAP = {
  CLASSIFIED: { label: 'Classified', cls: 'badge-success' },
  NON_FIRMWARE: { label: 'Non-Firmware', cls: 'badge-muted' },
  CODER_REVIEW: { label: 'Pending Review', cls: 'badge-warning' },
  PENDING: { label: 'Pending', cls: 'badge-info' },
  DRAFT: { label: 'Draft', cls: 'badge-muted' },
  ANALYZED: { label: 'Open - Analyze', cls: 'badge-danger' },
  FINALIZED: { label: 'Open - Ready', cls: 'badge-danger' },
  PRODUCTION: { label: 'On-Going', cls: 'badge-warning' },
  READY_TO_CLOSE: { label: 'Final', cls: 'badge-info' },
  COMPLETED: { label: 'Close', cls: 'badge-success' },
};

export const statusBadgeMeta = (status) => MAP[status] || { label: status || 'Unknown', cls: 'badge-muted' };

export default function StatusBadge({ status, stale }) {
  const item = statusBadgeMeta(status);
  return (
    <span
      className={`badge ${item.cls}${stale ? ' badge-stale' : ''}`}
      title={stale ? 'Stale — item text changed after last analysis' : undefined}
    >
      {item.label}{stale ? ' · stale' : ''}
    </span>
  );
}
