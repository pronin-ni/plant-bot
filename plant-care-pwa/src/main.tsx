import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '@/app/App';
import { initTelegramWebApp, TelegramSdkProviderBridge } from '@/lib/telegram';
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

function ensureTelegramScriptLoaded(): Promise<void> {
  if (window.Telegram?.WebApp) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-telegram-webapp="1"]');
    if (existing) {
      if (window.Telegram?.WebApp) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => resolve(), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    script.dataset.telegramWebapp = '1';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(script);
  });
}

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

async function bootstrap() {
  applyPlatformClasses(document.documentElement);
  // Инициализируем тему до первого рендера, чтобы минимизировать визуальный "скачок".
  useThemeStore.getState().initializeTheme();
  applyThemeToDocument(useThemeStore.getState().getResolvedTheme());
  initMotionLifecycleFlags();
  initPwa();
  await ensureTelegramScriptLoaded();
  initTelegramWebApp();
  await initOfflineSync();

  // Для PWA режимов без Telegram считаем приложение готовым сразу после bootstrap.
  useAuthStore.getState().setReady(true);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <TelegramSdkProviderBridge>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </TelegramSdkProviderBridge>
    </React.StrictMode>
  );
}

void bootstrap();
