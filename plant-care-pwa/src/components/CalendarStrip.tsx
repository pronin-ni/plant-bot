import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { hapticImpact, hapticSelectionChanged } from '@/lib/telegram';

export interface CalendarStripEvent {
  date: string;
  plantId: number;
  plantName: string;
}

interface CalendarStripProps {
  events: CalendarStripEvent[];
  anchorDate: Date;
  selectedDate: string;
  onSelectDate: (dateIso: string) => void;
  onShiftWindow: (deltaDays: number) => void;
  daysCount?: number;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarStrip({
  events,
  anchorDate,
  selectedDate,
  onSelectDate,
  onShiftWindow,
  daysCount = 14
}: CalendarStripProps) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarStripEvent[]>();
    for (const event of events) {
      const key = event.date.slice(0, 10);
      const current = map.get(key) ?? [];
      current.push(event);
      map.set(key, current);
    }
    return map;
  }, [events]);

  const windowDays = useMemo(() => {
    return Array.from({ length: daysCount }, (_, index) => {
      const date = addDays(anchorDate, index);
      const dayKey = toDayKey(date);
      const dayEvents = eventsByDay.get(dayKey) ?? [];
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const overdue = dayStart.getTime() < todayStart.getTime() && dayEvents.length > 0;
      const isToday = sameDay(dayStart, todayStart);
      return {
        date,
        dayKey,
        dayEvents,
        overdue,
        isToday,
        isSelected: selectedDate === dayKey
      };
    });
  }, [anchorDate, daysCount, eventsByDay, selectedDate, todayStart]);

  return (
    <section className="ios-blur-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-ios-subtext">14-дневный горизонт ухода</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="android-ripple inline-flex h-8 w-8 items-center justify-center rounded-full border border-ios-border/55 bg-white/65 text-ios-subtext dark:bg-zinc-900/60"
            onClick={() => {
              hapticSelectionChanged();
              onShiftWindow(-7);
            }}
            aria-label="Предыдущие дни"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="android-ripple inline-flex h-8 w-8 items-center justify-center rounded-full border border-ios-border/55 bg-white/65 text-ios-subtext dark:bg-zinc-900/60"
            onClick={() => {
              hapticSelectionChanged();
              onShiftWindow(7);
            }}
            aria-label="Следующие дни"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={toDayKey(anchorDate)}
          className="no-scrollbar flex gap-2 overflow-x-auto pb-1"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_, info) => {
            if (info.offset.x <= -64) {
              hapticImpact('light');
              onShiftWindow(7);
            } else if (info.offset.x >= 64) {
              hapticImpact('light');
              onShiftWindow(-7);
            }
          }}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          {windowDays.map((day) => {
            const dayNumber = day.date.getDate();
            const weekDay = day.date.toLocaleDateString('ru-RU', { weekday: 'short' });

            return (
              <button
                key={day.dayKey}
                type="button"
                onClick={() => {
                  hapticSelectionChanged();
                  onSelectDate(day.dayKey);
                }}
                className={`relative min-w-[72px] shrink-0 overflow-hidden rounded-2xl border p-2 text-left transition ${
                  day.isSelected
                    ? 'border-ios-accent/55 bg-ios-accent/12 shadow-[0_8px_22px_rgba(52,199,89,0.18)]'
                    : day.overdue
                      ? 'border-red-300/60 bg-red-500/10'
                      : day.isToday
                        ? 'border-amber-300/60 bg-amber-400/10'
                        : 'border-ios-border/55 bg-white/60 dark:bg-zinc-900/55'
                }`}
              >
                {day.overdue ? (
                  <span className="pointer-events-none absolute inset-0 animate-pulse bg-red-500/5" />
                ) : null}

                <p className="relative z-10 text-[11px] capitalize text-ios-subtext">{weekDay}</p>
                <p className="relative z-10 mt-0.5 text-base font-semibold text-ios-text">{dayNumber}</p>

                <div className="relative z-10 mt-2 flex -space-x-1">
                  {day.dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={`${day.dayKey}-${event.plantId}`}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/65 bg-white/85 text-[9px] font-semibold text-ios-text dark:border-zinc-700 dark:bg-zinc-800"
                      title={event.plantName}
                    >
                      {event.plantName.slice(0, 1).toUpperCase()}
                    </span>
                  ))}
                  {day.dayEvents.length > 3 ? (
                    <span className="inline-flex h-5 min-w-[18px] items-center justify-center rounded-full border border-white/65 bg-white/85 px-1 text-[9px] font-semibold text-ios-subtext dark:border-zinc-700 dark:bg-zinc-800">
                      +{day.dayEvents.length - 3}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
