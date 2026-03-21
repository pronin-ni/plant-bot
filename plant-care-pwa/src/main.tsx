import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '@/app/App';
import { initPwa } from '@/lib/pwa';
import { initOfflineSync } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { applyPlatformClasses } from '@/lib/theme/platformDetect';
import { applyThemeToDocument, useThemeStore } from '@/lib/theme/themeStore';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

type PortraitOrientationLock = 'portrait';

function initMotionLifecycleFlags() {
  const root = document.documentElement;
  root.dataset.motionState = document.hidden ? 'paused' : 'active';

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncReducedMotion = () => {
    root.classList.toggle('reduced-motion', media.matches);
  };
  syncReducedMotion();
  media.addEventListener('change', syncReducedMotion);

  const onVisibilityChange = () => {
    root.dataset.motionState = document.hidden ? 'paused' : 'active';
  };
  document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
}

function isStandaloneDisplayMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function lockPortraitOrientationIfSupported() {
  if (!isStandaloneDisplayMode()) {
    return;
  }
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: PortraitOrientationLock) => Promise<void>;
    };
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('portrait');
    }
  } catch {
    // На части iOS/Android браузеров lock недоступен или запрещен политикой.
  }
}

function initZoomGestureGuards() {
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (!isTouchDevice) {
    return;
  }

  const preventEvent = (event: Event) => {
    event.preventDefault();
  };

  const preventPinchTouch = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  };

  let lastTouchEnd = 0;
  const preventDoubleTapZoom = (event: TouchEvent) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 320) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  };

  document.addEventListener('gesturestart', preventEvent, { passive: false });
  document.addEventListener('gesturechange', preventEvent, { passive: false });
  document.addEventListener('gestureend', preventEvent, { passive: false });
  document.addEventListener('touchmove', preventPinchTouch, { passive: false });
  document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
}

async function bootstrap() {
  applyPlatformClasses(document.documentElement);
  // Инициализируем тему до первого рендера, чтобы минимизировать визуальный "скачок".
  useThemeStore.getState().initializeTheme();
  applyThemeToDocument(useThemeStore.getState().getResolvedTheme());
  initMotionLifecycleFlags();
  initZoomGestureGuards();
  await lockPortraitOrientationIfSupported();
  initPwa();
  await initOfflineSync();

  // Для PWA режимов без Telegram считаем приложение готовым сразу после bootstrap.
  useAuthStore.getState().setReady(true);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>
  );
}

void bootstrap();
