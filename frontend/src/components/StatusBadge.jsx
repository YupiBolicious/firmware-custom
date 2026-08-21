// Maps classification status to a badge
export default function StatusBadge({ status }) {
  const map = {
    CLASSIFIED: { label: 'Classified', cls: 'badge-success' },
    NON_FIRMWARE: { label: 'Non-Firmware', cls: 'badge-muted' },
    CODER_REVIEW: { label: 'Coder Review', cls: 'badge-warning' },
    PENDING: { label: 'Pending', cls: 'badge-info' },
  };
  const item = map[status] || { label: status || 'Unknown', cls: 'badge-muted' };
  return <span className={`badge ${item.cls}`}>{item.label}</span>;
}