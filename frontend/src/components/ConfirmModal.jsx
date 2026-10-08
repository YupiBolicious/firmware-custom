import { useEffect } from 'react';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
  disabled = false,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!loading) onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const confirmClass = confirmVariant === 'danger' ? 'btn btn-danger' : 'btn';

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="modal-content panel" style={{ maxWidth: 420, width: '92%' }}>
        <div className="modal-header">
          <h3 id="confirm-modal-title" style={{ margin: 0 }}>
            {title}
          </h3>
        </div>
        <div className="modal-body" style={{ marginTop: 8, marginBottom: 16 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>{message}</p>
        </div>
        <div className="modal-footer flex justify-end gap-8">
          <button className="btn btn-secondary" type="button" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            className={confirmClass}
            type="button"
            onClick={onConfirm}
            disabled={loading || disabled}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}