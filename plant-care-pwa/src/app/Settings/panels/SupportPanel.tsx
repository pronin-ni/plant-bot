import { useState } from 'react';

import { hapticImpact } from '@/lib/telegram';

export function SupportPanel() {
  const supportEmail = 'support@plant-bot.app';
  const [status, setStatus] = useState('');

  return (
    <div className="space-y-4">
      <p className="text-sm text-ios-text">Если что-то работает нестабильно, отправьте скриншот и шаги воспроизведения.</p>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(supportEmail);
            setStatus('Email скопирован в буфер обмена.');
            hapticImpact('light');
          } catch {
            window.location.href = `mailto:${supportEmail}`;
            setStatus('Копирование недоступно, открываем почтовое приложение.');
          }
        }}
        className="touch-target w-full rounded-ios-button border border-ios-border/60 bg-white/80 px-4 text-left text-sm text-ios-text transition-colors duration-200 ease-out active:bg-black/[0.03] dark:active:bg-white/[0.04]"
      >
        {supportEmail}
      </button>
      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
