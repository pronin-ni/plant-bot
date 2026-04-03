import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Sprout } from 'lucide-react';

import { PlantActionItem, type PlantActionEvent } from '@/components/PlantActionItem';
import { parseDateOnly, startOfLocalDay } from '@/lib/date';

interface DayCardProps {
  dateKey: string;
  events: PlantActionEvent[];
  pendingPlantId?: number | null;
  onComplete: (plantId: number) => Promise<unknown> | unknown;
  onOpenPlant: (plantId: number) => void;
}

function getDayHeader(dateKey: string): { title: string; subtitle: string } {
  const target = parseDateOnly(dateKey);
  const now = new Date();

  const start = startOfLocalDay(now);
  const targetStart = startOfLocalDay(target);
  const diff = Math.floor((targetStart.getTime() - start.getTime()) / 86_400_000);

  let title = targetStart.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
  if (diff === 0) {
    title = `Сегодня, ${title}`;
  } else if (diff === 1) {
    title = `Завтра, ${title}`;
  } else if (diff === -1) {
    title = `Вчера, ${title}`;
  } else if (diff > 1) {
    title = `Через ${diff} дн., ${title}`;
  } else {
    title = `${Math.abs(diff)} дн. назад, ${title}`;
  }

  const subtitle = targetStart.toLocaleDateString('ru-RU', { weekday: 'long' });
  return { title, subtitle };
}

export function DayCard({
  dateKey,
  events,
  pendingPlantId = null,
  onComplete,
  onOpenPlant
}: DayCardProps) {
  const header = getDayHeader(dateKey);

  return (
    <motion.section
      layout
      className="ios-blur-card overflow-hidden p-4"
      initial={{ opacity: 0, y: 8, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.995 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-ios-body font-semibold text-ios-text">{header.title}</p>
          <p className="text-[11px] capitalize text-ios-subtext">{header.subtitle}</p>
        </div>

        <span className="theme-surface-subtle inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-ios-subtext">
          <CalendarDays className="h-3.5 w-3.5" />
          {events.length}
        </span>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {events.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="theme-surface-subtle flex min-h-[100px] items-center justify-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-center"
          >
            <motion.span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ios-accent/15 text-ios-accent"
              animate={{ rotate: [0, 8, -8, 0], y: [0, -2, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.2 }}
            >
              <Sprout className="h-4 w-4" />
            </motion.span>
            <div className="text-left">
              <p className="text-xs font-medium text-ios-text">Все счастливы 🌿</p>
              <p className="mt-0.5 text-[11px] text-ios-subtext">Отдохните</p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-2" layout>
            {events.map((event) => (
              <PlantActionItem
                key={`${event.date}-${event.plantId}`}
                event={event}
                pending={pendingPlantId === event.plantId}
                onComplete={onComplete}
                onOpenPlant={onOpenPlant}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
