import { Button } from '@/components/ui/button';
import { authProviders, type AuthProviderId } from '@/lib/auth/authProviders';

export function AuthProvidersList({
  loadingProvider,
  onLogin
}: {
  loadingProvider?: AuthProviderId | null;
  onLogin: (provider: AuthProviderId) => void;
}) {
  return (
    <div className="space-y-2">
      {authProviders.map((provider) => (
        <Button
          key={provider.id}
          variant={provider.id === 'telegram' ? 'default' : 'secondary'}
          className="w-full"
          disabled={!provider.available() || loadingProvider === provider.id}
          onClick={() => onLogin(provider.id)}
        >
          {loadingProvider === provider.id ? 'Выполняем вход...' : `Войти через ${provider.title}`}
        </Button>
      ))}
    </div>
  );
}
