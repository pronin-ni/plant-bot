import { useEffect, useRef } from 'react';

import type { PwaTelegramWidgetPayloadDto } from '@/types/api';

declare global {
  interface Window {
    onTelegramAuth?: (user: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      auth_date: number;
      hash: string;
    }) => void;
  }
}

export function TelegramWidgetLogin({
  botUsername,
  onAuth,
  onError
}: {
  botUsername: string;
  onAuth: (payload: PwaTelegramWidgetPayloadDto) => void;
  onError: (message: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mountRef.current) {
      return;
    }
    if (!botUsername) {
      onError('Не задан username бота для Telegram Login Widget.');
      return;
    }

    window.onTelegramAuth = (user) => {
      if (!user?.id || !user?.auth_date || !user?.hash) {
        onError('Telegram вернул неполные данные для входа.');
        return;
      }
      onAuth({
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        username: user.username,
        photoUrl: user.photo_url,
        authDate: user.auth_date,
        hash: user.hash
      });
    };

    mountRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-lang', 'ru');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    mountRef.current.appendChild(script);

    return () => {
      if (window.onTelegramAuth) {
        delete window.onTelegramAuth;
      }
    };
  }, [botUsername, onAuth, onError]);

  return <div ref={mountRef} className="mt-2 flex justify-center" />;
}

