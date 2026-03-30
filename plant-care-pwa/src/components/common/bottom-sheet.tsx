import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type PropsWithChildren } from 'react';

interface BottomSheetProps extends PropsWithChildren {
  open: boolean;
  onClose: () => void;
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const isAndroid = typeof document !== 'undefined' && document.documentElement.classList.contains('android');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 bg-black/28 backdrop-blur-[3px]"
            aria-label="Закрыть лист"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 1 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[430px] rounded-t-[30px] border border-ios-border/50 bg-ios-card/58 p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_36px_rgba(0,0,0,0.14)] backdrop-blur-[30px] android:rounded-t-[28px] android:bg-[#FFFBFE] android:border-[#E7E0EC] android:backdrop-blur-0 android:shadow-[0_-2px_10px_rgba(0,0,0,0.18)]"
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
            transition={isAndroid ? { duration: 0.28, ease: [0.2, 0, 0, 1] } : { type: 'spring', stiffness: 390, damping: 31, mass: 1 }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-ios-border/70" />
              <button
                type="button"
                aria-label="Закрыть карточку"
                className="touch-target inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ios-subtext transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ios-accent/60"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div ref={contentRef} className="overflow-y-auto pr-1">
              {children}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
