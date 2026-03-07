import { cloudStorageSet, getTelegramInitData, getTelegramWebApp } from '@/lib/telegram';

const PWA_URL = import.meta.env.VITE_PWA_URL ?? '';
const MIGRATION_STORAGE_KEY = 'plant_pwa_migration_init_data';

function normalizePwaUrl(raw: string): string | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  try {
    const url = new URL(raw.trim());
    return url.toString();
  } catch {
    return null;
  }
}

export function getConfiguredPwaUrl(): string | null {
  const configured = normalizePwaUrl(PWA_URL);
  if (configured) {
    return configured;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return normalizePwaUrl(`${window.location.origin}/pwa/`);
  }
  return null;
}

export async function openPwaMigrationFlow(): Promise<void> {
  const pwaUrl = getConfiguredPwaUrl();
  if (!pwaUrl) {
    throw new Error('PWA URL не настроен');
  }

  const initData = getTelegramInitData();
  if (!initData) {
    throw new Error('Telegram initData не найден');
  }

  // Сохраняем копию в CloudStorage на случай повторного запуска из Telegram.
  await cloudStorageSet(MIGRATION_STORAGE_KEY, initData);

  const url = new URL(pwaUrl);
  const hashParams = new URLSearchParams();
  hashParams.set('tg_init_data', initData);
  hashParams.set('source', 'tma');
  hashParams.set('ts', String(Date.now()));
  url.hash = hashParams.toString();

  const webApp = getTelegramWebApp() as (ReturnType<typeof getTelegramWebApp> & {
    openLink?: (link: string, options?: Record<string, unknown>) => void;
  }) | null;
  if (webApp?.openLink) {
    webApp.openLink(url.toString(), { try_instant_view: false });
    return;
  }

  window.open(url.toString(), '_blank', 'noopener,noreferrer');
}
