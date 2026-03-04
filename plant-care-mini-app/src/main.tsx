import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from '@/app/App';
import { initTelegramWebApp, TelegramSdkProviderBridge, getTelegramWebApp } from '@/lib/telegram';
import { useAuthStore } from '@/lib/store';
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

async function bootstrap() {
  await ensureTelegramScriptLoaded();
  initTelegramWebApp();

  const webApp = getTelegramWebApp();
  useAuthStore.getState().setReady(Boolean(webApp));

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
