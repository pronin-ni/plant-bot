import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FlaskConical, TriangleAlert } from 'lucide-react';

interface GuestModeButtonProps {
  onActivate: () => Promise<void> | void;
  isOffline?: boolean;
}

export function GuestModeButton({ onActivate, isOffline = false }: GuestModeButtonProps) {
  const [isActivating, setIsActivating] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={async () => {
          setIsActivating(true);
          try {
            await onActivate();
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          } finally {
            setIsActivating(false);
          }
        }}
        disabled={isActivating}
        className="theme-surface-success android-ripple w-full rounded-[22px] border px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ios-text">
          <FlaskConical className="h-4 w-4" />
          {isActivating ? 'Запускаем демо...' : 'Попробовать без входа'}
        </span>
        <span className="mt-1 block text-xs text-ios-subtext">
          {isOffline ? 'Вы офлайн — демо доступно без сети' : 'Создаст временный демо-профиль с 3 растениями'}
        </span>
      </button>

      <div className="theme-surface-warning rounded-2xl border px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <TriangleAlert className="h-3.5 w-3.5" />
          Данные демо-режима не сохранятся
        </span>
      </div>

      <AnimatePresence>
        {done ? (
          <motion.div
            key="guest-done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="theme-surface-success rounded-xl border px-3 py-2 text-xs"
          >
            Демо готово. Добро пожаловать в ваш временный сад.
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
