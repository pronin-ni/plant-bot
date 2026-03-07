import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { isPwaStandalone, requestPwaInstall, subscribeInstallAvailability } from '@/lib/pwa';

export function InstallPrompt() {
  const [canInstall, setCanInstall] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (isPwaStandalone()) {
      setCanInstall(false);
      return;
    }
    const savedDismiss = localStorage.getItem('plant-pwa-install-dismissed') === '1';
    setDismissed(savedDismiss);
    return subscribeInstallAvailability(setCanInstall);
  }, []);

  if (!canInstall || dismissed) {
    return null;
  }

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
          <p className="text-ios-body font-semibold">Установить как приложение</p>
          <button
            type="button"
            aria-label="Закрыть"
            className="rounded-full p-1 text-ios-subtext"
            onClick={() => {
              localStorage.setItem('plant-pwa-install-dismissed', '1');
              setDismissed(true);
              hapticImpact('light');
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-ios-caption text-ios-subtext">
          Установите PWA на главный экран: быстрее запуск, оффлайн-кеш и пуш-уведомления.
        </p>
        <Button
          className="mt-3 w-full"
          disabled={installing}
          onClick={async () => {
            setInstalling(true);
            hapticImpact('medium');
            const outcome = await requestPwaInstall();
            if (outcome === 'accepted') {
              hapticNotify('success');
            } else if (outcome === 'dismissed') {
              hapticNotify('warning');
            } else {
              hapticNotify('error');
            }
            setInstalling(false);
          }}
        >
          <Download className="mr-2 h-4 w-4" />
          {installing ? 'Открываем диалог...' : 'Установить PWA'}
        </Button>
      </motion.section>
    </AnimatePresence>
  );
}
