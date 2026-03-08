import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';

const TIPS = [
  'Знаете ли вы? Фикусы любят рассеянный свет.',
  'Лучше недолить, чем перелить: проверяйте верхний слой почвы.',
  'Утренний полив обычно безопаснее для корней, чем вечерний.',
  'Для большинства комнатных растений важнее стабильность, чем частота.'
] as const;

export function QuickTip() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  const tip = useMemo(() => TIPS[index], [index]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % TIPS.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="ios-blur-card border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-100">
      <div className="mb-1 inline-flex items-center gap-1.5 text-emerald-200">
        <Lightbulb className="h-3.5 w-3.5" />
        Быстрый совет
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={tip}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.28 }}
        >
          {tip}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
