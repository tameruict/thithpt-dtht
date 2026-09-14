'use client';

import { useEffect, useSyncExternalStore, ViewTransition } from 'react';
import ToastProvider from '@/components/ui/Toast';
import { useExamStore } from '@/store/useExamStore';

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const theme = useExamStore((state) => state.theme);
  const zoom = useExamStore((state) => state.zoom);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = mounted ? theme : 'light';
    document.body.style.setProperty(
      '--answer-font',
      `${Math.round((17 * (mounted ? zoom : 100)) / 100)}px`,
    );
  }, [mounted, theme, zoom]);

  return (
    <>
      <a href="#main" className="skip-link">
        Bỏ qua tới nội dung chính
      </a>
      <div id="app" role="presentation">
        <ViewTransition
          enter={{
            default: 'route-enter',
            'nav-forward': 'route-forward-enter',
            'nav-back': 'route-back-enter',
          }}
          exit={{
            default: 'route-exit',
            'nav-forward': 'route-forward-exit',
            'nav-back': 'route-back-exit',
          }}
          default="route-update"
        >
          {children}
        </ViewTransition>
      </div>
      <ToastProvider />
    </>
  );
}
