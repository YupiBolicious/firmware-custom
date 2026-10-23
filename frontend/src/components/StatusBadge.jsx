// Maps classification status to a badge
export default function StatusBadge({ status, stale }) {
  const map = {
    CLASSIFIED: { label: 'Classified', cls: 'badge-success' },
    NON_FIRMWARE: { label: 'Non-Firmware', cls: 'badge-muted' },
    CODER_REVIEW: { label: 'Pending Review', cls: 'badge-warning' },
    PENDING: { label: 'Pending', cls: 'badge-info' },
    DRAFT: { label: 'Open', cls: 'badge-danger' },
    ANALYZED: { label: 'Open', cls: 'badge-danger' },
    FINALIZED: { label: 'On-going', cls: 'badge-warning' },
    PRODUCTION: { label: 'On-Going', cls: 'badge-warning' },
    COMPLETED: { label: 'Completed', cls: 'badge-info' },
    READY_TO_CLOSE: {label: 'Close', cls: 'badge-success'}
    
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
