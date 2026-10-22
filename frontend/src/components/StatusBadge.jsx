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
  const map = {
    CLASSIFIED: { label: 'Classified', cls: 'badge-success' },
    NON_FIRMWARE: { label: 'Non-Firmware', cls: 'badge-muted' },
    CODER_REVIEW: { label: 'Pending Review', cls: 'badge-warning' },
    PENDING: { label: 'Pending', cls: 'badge-info' },
    DRAFT: { label: 'Draft', cls: 'badge-muted' },
    ANALYZED: { label: 'Analyzed', cls: 'badge-info' },
    FINALIZED: { label: 'Finalize', cls: 'badge-info' },
    PRODUCTION: { label: 'Production', cls: 'badge-production' },
    COMPLETED: { label: 'Completed', cls: 'badge-success' },
    ON_GOING: {label: 'On-Going', cls:'badge-warning'},
    CLOSE: {label:'Close', cls:'badge-info'}
  };
  const item = map[status] || { label: status || 'Unknown', cls: 'badge-muted' };
  return (
    <span
      className={`badge ${item.cls}${stale ? ' badge-stale' : ''}`}
      title={stale ? 'Stale — item text changed after last analysis' : undefined}
    >
      {item.label}{stale ? ' · stale' : ''}
    </span>
  );
}
