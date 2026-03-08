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

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <motion.button
            key={item}
            type="button"
            whileTap={{ scale: 0.97 }}
            className="android-ripple shrink-0 rounded-2xl border border-ios-border/55 bg-white/65 px-3 py-2 text-left text-xs text-ios-text dark:bg-zinc-900/55"
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
