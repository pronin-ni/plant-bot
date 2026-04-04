import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface DialogProps extends PropsWithChildren {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, className, children }: DialogProps) {
  const isAndroid = typeof document !== 'undefined' && document.documentElement.classList.contains('android');

  useEffect(() => {
    if (open) {
      document.body.classList.add('sheet-open');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.classList.remove('sheet-open');
      document.body.style.overflow = '';
    }
    return () => {
      document.body.classList.remove('sheet-open');
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть диалог"
            className="theme-overlay-scrim fixed inset-0 z-40 android:backdrop-blur-0"
            onClick={() => onOpenChange(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={isAndroid ? { duration: 0.2, ease: [0.2, 0, 0, 1] } : { type: 'spring', stiffness: 330, damping: 28, mass: 1 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn(
              // Mobile: full-screen modal with safe-areas.
              'fixed inset-0 z-50 h-[100dvh] w-full max-w-full overflow-y-auto overflow-x-hidden border border-[hsl(var(--border)/0.45)] bg-[hsl(var(--card)/0.95)] p-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+16px)] text-[hsl(var(--card-foreground))] shadow-[0_16px_50px_rgb(0_0_0/0.28)]',
              'md:left-1/2 md:top-1/2 md:h-auto md:w-[min(92vw,720px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[26px] md:bg-[hsl(var(--card)/0.84)] md:p-5 md:pb-6 md:pt-5 md:shadow-[0_14px_44px_rgb(0_0_0/0.18)] md:backdrop-blur-[30px]',
              'android:rounded-[24px] android:backdrop-blur-0',
              className
            )}
            initial={{ opacity: 0, scale: 0.98, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={isAndroid ? { duration: 0.28, ease: [0.2, 0, 0, 1] } : { type: 'spring', stiffness: 360, damping: 30, mass: 1 }}
          >
            {title ? <h3 className="text-ios-title-2 font-semibold">{title}</h3> : null}
            {description ? <p className="mt-1 text-ios-caption text-ios-subtext">{description}</p> : null}
            <div className={cn(title || description ? 'mt-4' : '')}>{children}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
