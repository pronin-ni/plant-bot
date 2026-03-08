import type { ComponentType } from 'react';
import { CircleDashed, Chrome, Send } from 'lucide-react';

import { LoginButton } from '@/components/LoginButton';
import { authProviders, type AuthProviderId } from '@/lib/auth/authProviders';

const visibleProviderIds: AuthProviderId[] = ['telegram', 'yandex', 'google'];

const providerUi: Record<AuthProviderId, {
  icon: ComponentType<{ className?: string }>;
  gradientClassName: string;
  subtitle: string;
}> = {
  telegram: {
    icon: Send,
    gradientClassName: 'bg-gradient-to-br from-[#1B8FD1] via-[#229ED9] to-[#2cb6e8]',
    subtitle: 'Быстрый вход через Telegram'
  },
  yandex: {
    icon: CircleDashed,
    gradientClassName: 'bg-gradient-to-br from-[#ff4b2f] via-[#FC3F1D] to-[#e93513]',
    subtitle: 'OAuth через Yandex ID'
  },
  google: {
    icon: Chrome,
    gradientClassName: 'bg-gradient-to-br from-[#4f9dff] via-[#4285F4] to-[#3367d6]',
    subtitle: 'OAuth через Google Account'
  },
  vk: {
    icon: CircleDashed,
    gradientClassName: 'bg-gradient-to-br from-[#0a84ff] to-[#005fd1]',
    subtitle: 'Отключено на этом этапе'
  },
  apple: {
    icon: CircleDashed,
    gradientClassName: 'bg-gradient-to-br from-[#3c3c3c] to-[#121212]',
    subtitle: 'Отключено на этом этапе'
  }
};

export function AuthProvidersList({
  loadingProvider,
  onLogin,
  disabledAll = false
}: {
  loadingProvider?: AuthProviderId | null;
  onLogin: (provider: AuthProviderId) => void;
  disabledAll?: boolean;
}) {
  const providers = authProviders.filter((provider) => visibleProviderIds.includes(provider.id));

  return (
    <div className="space-y-2.5">
      {providers.map((provider) => {
        const ui = providerUi[provider.id];
        const disabled = disabledAll || !provider.available() || Boolean(loadingProvider && loadingProvider !== provider.id);
        return (
          <LoginButton
            key={provider.id}
            icon={ui.icon}
            title={provider.title}
            subtitle={ui.subtitle}
            gradientClassName={ui.gradientClassName}
            disabled={disabled}
            loading={loadingProvider === provider.id}
            onClick={() => onLogin(provider.id)}
          />
        );
      })}
    </div>
  );
}
