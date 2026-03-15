import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { impactLight, selection } from '@/lib/haptics';
import { useMotionGuard } from '@/lib/motion';
import { startOfLocalDay, toLocalDateKey } from '@/lib/date';

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
  const { reduceMotion } = useMotionGuard();
  const today = new Date();
  const todayStart = startOfLocalDay(today);

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
      const dayKey = toLocalDateKey(date);
      const dayEvents = eventsByDay.get(dayKey) ?? [];
      const dayStart = startOfLocalDay(date);
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
            className="theme-surface-subtle touch-target android-ripple inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full border p-3.5 text-ios-subtext shadow-[0_2px_8px_rgba(15,23,42,0.10)]"
            onClick={() => {
              selection();
              onShiftWindow(-7);
            }}
            aria-label="Предыдущие дни"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="theme-surface-subtle touch-target android-ripple inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full border p-3.5 text-ios-subtext shadow-[0_2px_8px_rgba(15,23,42,0.10)]"
            onClick={() => {
              selection();
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
          key={toLocalDateKey(anchorDate)}
          className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1.5"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_, info) => {
            if (info.offset.x <= -64) {
              impactLight();
              onShiftWindow(7);
            } else if (info.offset.x >= 64) {
              impactLight();
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
                  selection();
                  onSelectDate(day.dayKey);
                }}
                className={`relative min-w-[78px] shrink-0 overflow-hidden rounded-2xl border p-2.5 text-left transition ${
                  day.isSelected
                    ? 'theme-pill-active shadow-[0_8px_22px_rgba(52,199,89,0.18)]'
                    : day.overdue
                      ? 'theme-surface-danger'
                      : day.isToday
                        ? 'theme-surface-warning'
                        : 'theme-surface-subtle'
                }`}
              >
                {day.overdue ? (
                  <motion.span
                    className="pointer-events-none absolute inset-0 bg-[hsl(var(--destructive)/0.08)]"
                    animate={
                      reduceMotion
                        ? { opacity: 0.35 }
                        : { opacity: [0.25, 0.65, 0.25], scale: [1, 1.03, 1], x: [0, -1.2, 1.2, 0] }
                    }
                    transition={{
                      duration: 2,
                      ease: 'easeInOut',
                      repeat: reduceMotion ? 0 : Infinity
                    }}
                  />
                ) : null}

                <p className="relative z-10 text-[11px] capitalize leading-4 text-ios-subtext">{weekDay}</p>
                <p className="relative z-10 mt-1 text-base font-semibold leading-none text-ios-text">{dayNumber}</p>

                <div className="relative z-10 mt-2.5 flex -space-x-1">
                  {day.dayEvents.slice(0, 3).map((event) => (
                    <span
                      key={`${day.dayKey}-${event.plantId}`}
                      className="theme-surface-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-semibold text-ios-text"
                      title={event.plantName}
                    >
                      {event.plantName.slice(0, 1).toUpperCase()}
                    </span>
                  ))}
                  {day.dayEvents.length > 3 ? (
                    <span className="theme-surface-1 inline-flex h-5 min-w-[18px] items-center justify-center rounded-full border px-1 text-[9px] font-semibold text-ios-subtext">
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
