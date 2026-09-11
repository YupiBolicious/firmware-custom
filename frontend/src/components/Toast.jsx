import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const ToastContext = createContext(null);
let toastSeq = 0;

const VARIANT_CLASS = {
  default: '',
  destructive: 'toast-destructive',
  success: 'toast-success',
  warning: 'toast-warning',
  info: 'toast-info',
};

function ToastItem({ entry, onDismiss }) {
  return (
    <div className={['toast', VARIANT_CLASS[entry.variant] || ''].filter(Boolean).join(' ')} role="status">
      <div className="toast-body">
        {entry.title ? <div className="toast-title">{entry.title}</div> : null}
        {entry.description ? <div className="toast-description">{entry.description}</div> : null}
      </div>
      <button className="toast-close" onClick={() => onDismiss(entry.id)} aria-label="Dismiss notification">
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());
  const dismiss = useCallback((id) => {
    setItems((xs) => xs.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);
  const toast = useCallback(
    (opts) => {
      const input = typeof opts === 'string' ? { description: opts } : opts || {};
      const id = ++toastSeq;
      const entry = {
        id,
        title: input.title || '',
        description: input.description || '',
        variant: input.variant || 'default',
        duration: input.duration === undefined ? 6000 : input.duration,
      };
      setItems((xs) => [...xs.slice(-2), entry]);
      if (entry.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), entry.duration)
        );
      }
      return id;
    },
    [dismiss]
  );
  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="toaster-viewport" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <ToastItem key={t.id} entry={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function useValueToast(value, variant = 'destructive') {
  const ctx = useToast();
  const seen = useRef(undefined);
  useEffect(() => {
    if (!value) {
      seen.current = undefined;
      return;
    }
    if (!ctx || seen.current === value) return;
    seen.current = value;
    ctx.toast({ variant, description: value });
  }, [value, variant, ctx]);
}
