import { getTelegramInitData } from '@/lib/telegram';

export function getConfiguredPwaUrl(): string {
  return import.meta.env.VITE_PWA_URL || '';
}

/**
 * Возвращает URL для миграции с передачей Telegram initData через параметр `tg_init_data`.
 * Если initData отсутствует (например, пользователь открывает PWA напрямую), возвращает базовый URL без параметра.
 */
export function getMigrationUrl(): string {
  const baseUrl = getConfiguredPwaUrl();
  if (!baseUrl) {
    return '';
  }

  const initData = getTelegramInitData();
  if (!initData) {
    return baseUrl;
  }

  // Передаём initData через hash, чтобы он не попадал в logs сервера
  const hashParam = new URLSearchParams();
  hashParam.set('tg_init_data', initData);
  return `${baseUrl}#${hashParam.toString()}`;
}

export async function openPwaMigrationFlow(): Promise<void> {
  const migrationUrl = getMigrationUrl();
  if (migrationUrl) {
    window.open(migrationUrl, '_blank');
  }
}
