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
