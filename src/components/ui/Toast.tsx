'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, X, XCircle } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  dismissing?: boolean;
}

let addToastGlobal: ((message: string, type?: ToastType) => void) | null = null;

/** Imperatively show a toast from anywhere. Giữ API cũ. */
export function showToast(message: string, type: ToastType = 'info') {
  addToastGlobal?.(message, type);
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} aria-hidden="true" />,
  error: <XCircle size={18} aria-hidden="true" />,
  warning: <AlertTriangle size={18} aria-hidden="true" />,
  info: <Info size={18} aria-hidden="true" />,
};

const TOAST_DURATION_MS = 4500;
const EXIT_MS = 280;

let nextId = 0;

export default function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    if (timers.current.has(id)) {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  const scheduleDismiss = useCallback(
    (id: number) => {
      if (timers.current.has(id)) clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_DURATION_MS),
      );
    },
    [dismiss],
  );

  const addToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const text = message.trim();
      if (!text) return;
      const id = ++nextId;
      setToasts((prev) => [...prev.slice(-3), { id, message: text, type }]);
      scheduleDismiss(id);
    },
    [scheduleDismiss],
  );

  useEffect(() => {
    addToastGlobal = addToast;
    return () => {
      addToastGlobal = null;
    };
  }, [addToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || toasts.length === 0) return;
      const active = document.activeElement;
      if (active && active instanceof HTMLElement && active.closest(`.${styles.container}`)) {
        dismiss(toasts[toasts.length - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss, toasts]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} role="region" aria-label="Thông báo">
      {toasts.map((toast) => {
        const assertive = toast.type === 'error' || toast.type === 'warning';
        return (
          <div
            key={toast.id}
            role={assertive ? 'alert' : 'status'}
            aria-live={assertive ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={`${styles.toast} ${styles[toast.type]} ${toast.dismissing ? styles.out : ''}`}
            onMouseEnter={() => {
              if (timers.current.has(toast.id)) {
                clearTimeout(timers.current.get(toast.id));
                timers.current.delete(toast.id);
              }
            }}
            onMouseLeave={() => scheduleDismiss(toast.id)}
            onFocus={() => {
              if (timers.current.has(toast.id)) {
                clearTimeout(timers.current.get(toast.id));
                timers.current.delete(toast.id);
              }
            }}
            onBlur={() => scheduleDismiss(toast.id)}
          >
            <span className={styles.icon} aria-hidden="true">
              {ICONS[toast.type]}
            </span>
            <span className={styles.message}>{toast.message}</span>
            <button
              type="button"
              className={styles.close}
              onClick={() => dismiss(toast.id)}
              aria-label="Đóng thông báo"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
