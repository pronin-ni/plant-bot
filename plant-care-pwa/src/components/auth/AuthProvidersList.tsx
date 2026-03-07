import type { ComponentType } from 'react';
import { Apple, Send, CircleDashed, MessagesSquare, Chrome } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { authProviders, type AuthProviderId } from '@/lib/auth/authProviders';

const providerUi: Record<AuthProviderId, { icon: ComponentType<{ className?: string }>; className: string }> = {
  telegram: { icon: Send, className: 'bg-[#229ED9] text-white hover:bg-[#1f8bc0]' },
  yandex: { icon: CircleDashed, className: 'bg-[#FC3F1D] text-white hover:bg-[#e53617]' },
  vk: { icon: MessagesSquare, className: 'bg-[#0077FF] text-white hover:bg-[#0068e0]' },
  google: { icon: Chrome, className: 'bg-[#4285F4] text-white hover:bg-[#3b78dc]' },
  apple: { icon: Apple, className: 'bg-black text-white hover:bg-neutral-800' }
};

export function AuthProvidersList({
  loadingProvider,
  onLogin
}: {
  loadingProvider?: AuthProviderId | null;
  onLogin: (provider: AuthProviderId) => void;
}) {
  return (
    <div className="space-y-2">
      {authProviders.map((provider) => {
        const ui = providerUi[provider.id];
        const Icon = ui.icon;
        const disabled = !provider.available() || loadingProvider === provider.id;
        return (
          <Button
            key={provider.id}
            className={`w-full ${ui.className}`}
            disabled={disabled}
            onClick={() => onLogin(provider.id)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {loadingProvider === provider.id ? 'Выполняем вход...' : `Войти через ${provider.title}`}
          </Button>
        );
      })}
    </div>
  );
}
