import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { selection } from '@/lib/haptics';

interface QuickQuestionsCarouselProps {
  items: string[];
  onPick: (question: string) => void;
}

export function QuickQuestionsCarousel({ items, onPick }: QuickQuestionsCarouselProps) {
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressActivatedRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (item: string) => {
    clearLongPressTimer();
    longPressActivatedRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressActivatedRef.current = true;
      setExpandedQuestion(item);
    }, 430);
  };

  useEffect(() => {
    if (!expandedQuestion) {
      return;
    }
    const timer = window.setTimeout(() => {
      setExpandedQuestion(null);
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [expandedQuestion]);

  useEffect(() => () => clearLongPressTimer(), []);

  return (
    <section className="relative space-y-2">
      <h3 className="text-sm font-medium text-ios-text">Быстрые вопросы</h3>

      <div className="flex w-full min-w-0 flex-wrap gap-2 pb-1">
        {items.map((item) => (
          <motion.button
            key={item}
            type="button"
            whileTap={{ scale: 0.97 }}
            className="theme-surface-subtle touch-target android-ripple min-h-11 max-w-full rounded-full border px-3.5 py-2 text-left text-xs leading-5 text-ios-text shadow-sm sm:max-w-[calc(50%-0.25rem)]"
            title={item}
            onPointerDown={() => startLongPress(item)}
            onPointerUp={clearLongPressTimer}
            onPointerLeave={clearLongPressTimer}
            onPointerCancel={clearLongPressTimer}
            onContextMenu={(event) => {
              event.preventDefault();
              clearLongPressTimer();
              setExpandedQuestion(item);
            }}
            onClick={() => {
              if (longPressActivatedRef.current) {
                longPressActivatedRef.current = false;
                return;
              }
              setExpandedQuestion(null);
              selection();
              onPick(item);
            }}
          >
            <span className="line-clamp-2 break-words">{item}</span>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {expandedQuestion ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="theme-surface-1 pointer-events-none absolute inset-x-0 top-[calc(100%+4px)] z-20 rounded-xl border px-3 py-2 text-xs leading-5 text-ios-text shadow-[0_10px_28px_rgb(0_0_0/0.14)]"
          >
            {expandedQuestion}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
