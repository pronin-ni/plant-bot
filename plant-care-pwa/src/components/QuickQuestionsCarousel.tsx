import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

import { hapticSelectionChanged } from '@/lib/telegram';

interface QuickQuestionsCarouselProps {
  items: string[];
  onPick: (question: string) => void;
}

export function QuickQuestionsCarousel({ items, onPick }: QuickQuestionsCarouselProps) {
  return (
    <section className="ios-blur-card p-3">
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
            onClick={() => {
              hapticSelectionChanged();
              onPick(item);
            }}
          >
            {item}
          </motion.button>
        ))}
      </div>
    </section>
  );
}
