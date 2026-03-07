import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Leaf } from 'lucide-react';

import { AuthProvidersList } from '@/components/auth/AuthProvidersList';
import { authProviders, type AuthProviderId } from '@/lib/auth/authProviders';
import { pwaLoginTelegram } from '@/lib/api';
import { hapticNotify } from '@/lib/telegram';
import { useAuthStore } from '@/lib/store';

function getMigrationInitDataFromUrl(): string | null {
  const queryValue = new URLSearchParams(window.location.search).get('tg_init_data');
  if (queryValue) {
    return queryValue;
  }

  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) {
    return null;
  }
  const hashParams = new URLSearchParams(hash);
  return hashParams.get('tg_init_data');
}

function clearMigrationInitDataFromUrl() {
  if (!window.location.hash.includes('tg_init_data') && !window.location.search.includes('tg_init_data')) {
    return;
  }
  window.history.replaceState(null, '', window.location.pathname);
}

export function LoginScreen() {
  const [activeProvider, setActiveProvider] = useState<AuthProviderId | null>(null);
  const [migrationState, setMigrationState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const migrationInitData = useMemo(() => getMigrationInitDataFromUrl(), []);

  const loginMutation = useMutation({
    mutationFn: async (providerId: AuthProviderId) => {
      const provider = authProviders.find((item) => item.id === providerId);
      if (!provider) {
        throw new Error('Провайдер не найден');
      }
      setActiveProvider(providerId);
      return provider.login();
    },
    onSuccess: (session) => {
      useAuthStore.getState().setAuth({
        isAuthorized: true,
        accessToken: session.accessToken,
        telegramUserId: session.user.telegramId,
        username: session.user.username,
        firstName: session.user.firstName,
        email: session.user.email,
        roles: session.user.roles,
        isAdmin: session.user.roles.includes('ROLE_ADMIN')
      });
      hapticNotify('success');
      setActiveProvider(null);
    },
    onError: () => {
      hapticNotify('error');
      setActiveProvider(null);
    }
  });

  const migrationMutation = useMutation({
    mutationFn: (initData: string) => pwaLoginTelegram(initData),
    onSuccess: (session) => {
      useAuthStore.getState().setAuth({
        isAuthorized: true,
        accessToken: session.accessToken,
        telegramUserId: session.user.telegramId,
        username: session.user.username,
        firstName: session.user.firstName,
        email: session.user.email,
        roles: session.user.roles,
        isAdmin: session.user.roles.includes('ROLE_ADMIN')
      });
      setMigrationState('done');
      clearMigrationInitDataFromUrl();
      hapticNotify('success');
    },
    onError: () => {
      setMigrationState('error');
      hapticNotify('error');
    }
  });

  useEffect(() => {
    if (!migrationInitData || migrationState !== 'idle') {
      return;
    }
    setMigrationState('running');
    migrationMutation.mutate(migrationInitData);
  }, [migrationInitData, migrationState, migrationMutation]);

  return (
    <section className="mx-auto w-full max-w-[430px] space-y-4 px-2 pb-24">
      <div className="ios-blur-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Leaf className="h-5 w-5 text-ios-accent" />
          <h1 className="text-ios-title-1">Вход в Мои Растения</h1>
        </div>
        <p className="text-ios-body text-ios-subtext">
          Foundation-этап миграции: Telegram + модульная структура OAuth (Yandex/VK/Google/Apple).
        </p>
        {migrationInitData ? (
          <p className="mt-2 text-xs text-ios-subtext">
            {migrationState === 'running' ? 'Переносим аккаунт из Telegram Mini App...' : null}
            {migrationState === 'error' ? 'Не удалось автоматически перенести сессию. Выполните вход вручную.' : null}
          </p>
        ) : null}
      </div>

      <div className="ios-blur-card p-4">
        <AuthProvidersList
          loadingProvider={activeProvider}
          onLogin={(providerId) => loginMutation.mutate(providerId)}
        />
        {loginMutation.isError ? (
          <p className="mt-3 text-xs text-red-500">
            Ошибка входа. Проверьте провайдер и настройки backend.
          </p>
        ) : null}
      </div>
    </section>
  );
}
