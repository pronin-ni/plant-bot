import { AnimatePresence, motion } from 'framer-motion';
import type { PropsWithChildren } from 'react';

interface BottomSheetProps extends PropsWithChildren {
  open: boolean;
  onClose: () => void;
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 bg-black/35"
            aria-label="Закрыть"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 1 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[430px] rounded-t-[28px] border border-ios-border/55 bg-white/75 p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-ios backdrop-blur-ios dark:bg-zinc-900/70"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.18}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 800) {
                onClose();
              }
            }}
            transition={{ type: 'spring', stiffness: 350, damping: 29, mass: 1 }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ios-border/70" />
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
