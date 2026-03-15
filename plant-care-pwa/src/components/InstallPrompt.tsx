import { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { error as hapticError, impactLight, impactMedium, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import { detectInstallPlatform, isPwaStandalone, requestPwaInstall, subscribeInstallAvailability } from '@/lib/pwa';

export function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const platform = useMemo(() => detectInstallPlatform(), []);

  useEffect(() => {
    if (isPwaStandalone()) {
      setCanInstall(false);
      return;
    }
    const raw = localStorage.getItem('plant-pwa-install-dismissed-at');
    const dismissedAt = raw ? Number(raw) : 0;
    const now = Date.now();
    // Блокируем показ только временно, чтобы подсказка не исчезала навсегда.
    const suppressWindowMs = 3 * 24 * 60 * 60 * 1000;
    setDismissed(Boolean(dismissedAt) && now - dismissedAt < suppressWindowMs);
    return subscribeInstallAvailability(setCanInstall);
  }, []);

  if (dismissed || isPwaStandalone()) {
    return null;
  }

  const manualSteps = (() => {
    if (platform === 'ios') {
      return [
        'Откройте меню «Поделиться» в Safari.',
        'Выберите «На экран Домой».',
        'Подтвердите установку кнопкой «Добавить».'
      ];
    }
    if (platform === 'android') {
      return [
        'Откройте меню браузера (⋮).',
        'Нажмите «Установить приложение» или «Добавить на главный экран».',
        'Подтвердите установку.'
      ];
    }
    return [
      'Откройте сайт в Chrome/Edge/Safari.',
      'В меню браузера выберите «Install app / Установить приложение».'
    ];
  })();

  const title = platform === 'ios'
    ? 'Установка PWA на iPhone'
    : platform === 'android'
      ? 'Установка PWA на Android'
      : 'Установка PWA';

  return (
    <AnimatePresence>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ type: 'spring', stiffness: 360, damping: 28, mass: 1 }}
        className="ios-blur-card mb-3 p-4"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-ios-body font-semibold">{title}</p>
          <button
            type="button"
            aria-label="Закрыть"
            className="touch-target inline-flex w-11 items-center justify-center rounded-full text-ios-subtext transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ios-accent/60"
            onClick={() => {
              localStorage.setItem('plant-pwa-install-dismissed-at', String(Date.now()));
              setDismissed(true);
              impactLight();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-ios-caption text-ios-subtext">
          Установите PWA на главный экран: быстрее запуск, оффлайн-кеш и пуш-уведомления.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-[12px] text-ios-subtext">
          {manualSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {canInstall ? (
          <Button
            className="mt-3 w-full"
            disabled={installing}
            onClick={async () => {
              setInstalling(true);
              impactMedium();
              const outcome = await requestPwaInstall();
              if (outcome === 'accepted') {
                hapticSuccess();
              } else if (outcome === 'dismissed') {
                hapticWarning();
              } else {
                hapticError();
              }
              setInstalling(false);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            {installing ? 'Открываем диалог...' : 'Установить PWA'}
          </Button>
        ) : null}
      </motion.section>
    </AnimatePresence>
  );
}
