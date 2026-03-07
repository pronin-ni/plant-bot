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
  available: () => true,
  login: async () => {
    const initData = getTelegramInitData();
    if (initData) {
      return pwaLoginTelegram(initData);
    }

    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'plant_at_home_bot';
    if (botUsername) {
      throw new Error('TELEGRAM_WIDGET_REQUIRED');
    }

    throw new Error('Не удалось определить username Telegram-бота для входа.');
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
