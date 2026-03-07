import { AnimatePresence, motion } from 'framer-motion';
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

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть диалог"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[4px] android:backdrop-blur-0"
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
              'fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border border-ios-border/50 bg-ios-card/55 p-5 shadow-[0_14px_44px_rgba(0,0,0,0.18)] backdrop-blur-[30px] android:rounded-[24px] android:bg-[#FFFBFE] android:border-[#E7E0EC] android:backdrop-blur-0 android:shadow-[0_4px_12px_rgba(0,0,0,0.2)]',
              className
            )}
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={isAndroid ? { duration: 0.28, ease: [0.2, 0, 0, 1] } : { type: 'spring', stiffness: 380, damping: 30, mass: 1 }}
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
