import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

import { hapticSelectionChanged } from '@/lib/telegram';

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
    <section className="ios-blur-card relative p-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-ios-subtext">
        <Sparkles className="h-3.5 w-3.5 text-ios-accent" />
        Примеры быстрых вопросов
      </p>

      <div className="no-scrollbar flex w-full min-w-0 gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <motion.button
            key={item}
            type="button"
            whileTap={{ scale: 0.97 }}
            className="touch-target android-ripple h-11 max-w-[76vw] shrink-0 truncate rounded-2xl border border-ios-border/55 bg-white/65 px-3.5 text-left text-xs text-ios-text dark:bg-zinc-900/55"
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
              hapticSelectionChanged();
              onPick(item);
            }}
          >
            {item}
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
            className="pointer-events-none absolute inset-x-3 top-[calc(100%+6px)] z-20 rounded-xl border border-ios-border/70 bg-white/95 px-3 py-2 text-xs leading-5 text-ios-text shadow-[0_10px_28px_rgba(0,0,0,0.14)] dark:bg-zinc-900/95"
          >
            {expandedQuestion}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
