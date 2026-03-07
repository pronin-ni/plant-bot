import { pwaLoginTelegram } from '@/lib/api';
import { getTelegramInitData } from '@/lib/telegram';
import type { PwaAuthDto } from '@/types/api';

export type AuthProviderId = 'telegram' | 'yandex' | 'vk' | 'google' | 'apple';

export interface AuthProvider {
  id: AuthProviderId;
  title: string;
  available: () => boolean;
  login: () => Promise<PwaAuthDto>;
}

const telegramProvider: AuthProvider = {
  id: 'telegram',
  title: 'Telegram',
  available: () => {
    // В PWA разрешаем кнопку всегда, чтобы пользователь мог попробовать авторизоваться
    return true;
  },
  login: async () => {
    const initData = getTelegramInitData();
    if (!initData) {
      // В PWA режиме используем Telegram Login Widget через OAuth
      const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
      if (botUsername) {
        const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
        const authUrl = `https://oauth.telegram.org/auth?bot_id=${botUsername}&origin=${redirectUri}&request_access=write`;
        window.open(authUrl, '_blank');
        throw new Error('Откройте Telegram авторизацию в новом окне');
      }
      throw new Error('Telegram OAuth не настроен. Добавьте VITE_TELEGRAM_BOT_USERNAME в .env');
    }
    return pwaLoginTelegram(initData);
  }
};

function oauthPlaceholder(provider: Exclude<AuthProviderId, 'telegram'>, title: string): AuthProvider {
  return {
    id: provider,
    title,
    available: () => false,
    login: async () => {
      // Этап 1 foundation: только структура провайдеров.
      // Реальный OAuth flow будет добавлен на следующем этапе.
      throw new Error(`OAuth провайдер ${provider} будет подключен на следующем этапе.`);
    }
  };
}

export const authProviders: AuthProvider[] = [
  telegramProvider,
  oauthPlaceholder('yandex', 'Yandex'),
  oauthPlaceholder('vk', 'VK'),
  oauthPlaceholder('google', 'Google'),
  oauthPlaceholder('apple', 'Apple')
];
