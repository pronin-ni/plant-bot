import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BarChart3, RefreshCw, Sparkles } from 'lucide-react';

import { getCalendar, waterPlant } from '@/lib/api';
import { hapticImpact, hapticNotify, hapticSelectionChanged } from '@/lib/telegram';
import { useOfflineStore, useUiStore } from '@/lib/store';
import { PlatformPullToRefresh } from '@/components/adaptive/PlatformPullToRefresh';
import { CalendarStrip } from '@/components/CalendarStrip';
import { DayCard } from '@/components/DayCard';
import { MassWaterButton } from '@/components/MassWaterButton';
import { ConditionsForecast } from '@/components/ConditionsForecast';
import { useMotionGuard } from '@/lib/motion';

type CalendarActionFilter = 'all' | 'watering' | 'fertilizer' | 'repotting' | 'cutting';

interface ActionTabItem {
  key: CalendarActionFilter;
  label: string;
  count: number;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function dayKeyFromDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(input: Date): Date {
  const date = startOfDay(input);
  const day = date.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  return addDays(date, shift);
}

function useAnimatedNumber(value: number, durationMs = 520): number {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const from = display;
    const to = value;
    if (from === to) {
      return;
    }

    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return display;
}

function StatItem({ label, value }: { label: string; value: number }) {
  const animated = useAnimatedNumber(value);
  return (
    <div className="flex h-full min-h-[82px] flex-col items-center justify-center rounded-2xl border border-ios-border/55 bg-white/50 px-3 py-2.5 text-center dark:bg-zinc-900/50">
      <p className="text-[11px] leading-4 text-ios-subtext">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none text-ios-text">{animated}</p>
    </div>
  );
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const openPlantDetail = useUiStore((s) => s.openPlantDetail);
  const isOffline = useOfflineStore((s) => s.isOffline);

  const todayBase = useMemo(() => startOfDay(new Date()), []);
  const [filter, setFilter] = useState<CalendarActionFilter>('all');
  const [stripAnchorDate, setStripAnchorDate] = useState<Date>(() => addDays(todayBase, -3));
  const [selectedDate, setSelectedDate] = useState<string>(() => dayKeyFromDate(todayBase));
  const [wateringWavePulse, setWateringWavePulse] = useState(0);
  const { reduceMotion } = useMotionGuard();

  const calendarQuery = useQuery({
    queryKey: ['calendar'],
    queryFn: getCalendar
  });

  const completeMutation = useMutation({
    mutationFn: (plantId: number) => waterPlant(plantId),
    onSuccess: () => {
      hapticNotify('success');
      navigator.vibrate?.([100, 50, 100]);
      setWateringWavePulse((prev) => prev + 1);
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticNotify('error')
  });

  const massCompleteMutation = useMutation({
    mutationFn: async (plantIds: number[]) => {
      const uniqueIds = Array.from(new Set(plantIds));
      const results = await Promise.allSettled(uniqueIds.map((id) => waterPlant(id)));
      const successCount = results.filter((item) => item.status === 'fulfilled').length;
      const failedCount = results.length - successCount;
      return { successCount, failedCount, total: results.length };
    },
    onSuccess: ({ successCount, failedCount }) => {
      if (successCount > 0) {
        hapticNotify('success');
        navigator.vibrate?.([100, 50, 100]);
        setWateringWavePulse((prev) => prev + 1);
      } else {
        hapticNotify('warning');
      }
      if (failedCount > 0) {
        hapticImpact('rigid');
      }
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticNotify('error')
  });

  const now = new Date();
  const today = startOfDay(now);

  const enrichedEvents = useMemo(() => {
    return (calendarQuery.data ?? [])
      .map((event) => {
        const eventDate = startOfDay(new Date(event.date));
        const diffDays = Math.floor((eventDate.getTime() - today.getTime()) / 86_400_000);
        return {
          ...event,
          dayKey: event.date.slice(0, 10),
          actionType: 'watering' as const,
          diffDays,
          isToday: diffDays === 0,
          isOverdue: diffDays < 0
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [calendarQuery.data, today]);

  const filteredByTypeEvents = useMemo(() => {
    if (filter === 'all' || filter === 'watering') {
      return enrichedEvents;
    }
    // На текущем API есть только полив.
    return [];
  }, [enrichedEvents, filter]);

  const selectedDayEvents = useMemo(() => {
    return filteredByTypeEvents.filter((event) => event.dayKey === selectedDate);
  }, [filteredByTypeEvents, selectedDate]);

  const overdueEvents = useMemo(() => {
    return enrichedEvents.filter((item) => item.isOverdue);
  }, [enrichedEvents]);

  const overdueCount = overdueEvents.length;
  const todayCount = enrichedEvents.filter((item) => item.isToday).length;
  const doneCount = Math.max(0, enrichedEvents.length - overdueCount - todayCount);
  const urgentTodayIds = enrichedEvents
    .filter((item) => item.isOverdue || item.isToday)
    .map((item) => item.plantId);

  const weekStats = useMemo(() => {
    const weekStart = startOfWeekMonday(today);
    const weekEnd = addDays(weekStart, 6);

    const weekEvents = enrichedEvents.filter((event) => {
      const eventDate = startOfDay(new Date(event.date));
      return eventDate.getTime() >= weekStart.getTime() && eventDate.getTime() <= weekEnd.getTime();
    });

    const urgent = weekEvents.filter((event) => event.isOverdue || event.isToday).length;
    const planned = weekEvents.length;
    const safe = Math.max(0, planned - urgent);

    return { planned, urgent, safe };
  }, [enrichedEvents, today]);

  const tabs: ActionTabItem[] = [
    { key: 'all', label: 'Все', count: enrichedEvents.length },
    { key: 'watering', label: 'Полив', count: enrichedEvents.length },
    { key: 'fertilizer', label: 'Удобрение', count: 0 },
    { key: 'repotting', label: 'Пересадка', count: 0 },
    { key: 'cutting', label: 'Черенкование', count: 0 }
  ];

  const progress = enrichedEvents.length > 0
    ? Math.round((doneCount / enrichedEvents.length) * 100)
    : 100;

  const pendingPlantId = completeMutation.isPending
    ? (completeMutation.variables ?? null)
    : null;

  const lastUpdatedLabel = calendarQuery.dataUpdatedAt
    ? new Date(calendarQuery.dataUpdatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const forecastPlant = selectedDayEvents[0] ?? overdueEvents[0] ?? null;

  useEffect(() => {
    hapticImpact('light');
    navigator.vibrate?.(50);
  }, []);

  return (
    <PlatformPullToRefresh onRefresh={() => calendarQuery.refetch()}>
      <section className="calendar-premium-shell relative space-y-3 overflow-hidden pt-[max(12px,env(safe-area-inset-top))] pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {wateringWavePulse > 0 ? (
            <motion.div
              key={`calendar-water-wave-${wateringWavePulse}`}
              className="pointer-events-none absolute inset-0 z-40"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.25 : 1.5, ease: 'easeInOut' }}
            >
              <motion.div
                className="absolute inset-y-0 left-[-35%] w-[48%] rounded-[40%] bg-gradient-to-r from-emerald-400/0 via-emerald-400/28 to-cyan-300/25 blur-[1px]"
                initial={{ x: '-8%' }}
                animate={{ x: '320%' }}
                transition={{ duration: reduceMotion ? 0.3 : 1.5, ease: 'easeInOut' }}
              />
              {!reduceMotion ? (
                <div className="absolute inset-0">
                  {Array.from({ length: 16 }).map((_, index) => (
                    <motion.span
                      key={index}
                      className="absolute h-1.5 w-1.5 rounded-full bg-cyan-300/85"
                      style={{ left: `${8 + index * 5.7}%`, top: `${24 + (index % 5) * 12}%` }}
                      initial={{ opacity: 0, y: 8, scale: 0.7 }}
                      animate={{ opacity: [0, 1, 0], y: [8, -5, -14], scale: [0.7, 1, 0.8] }}
                      transition={{ duration: 0.8, delay: index * 0.02, ease: 'easeOut' }}
                    />
                  ))}
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="ios-blur-card overflow-hidden p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-ios-caption uppercase tracking-wide text-ios-subtext">Календарь ухода</p>
              <h2 className="mt-1 text-[28px] font-semibold leading-[1.05] text-ios-text">Ваши растения ждут</h2>
              <p className="mt-1 text-sm text-ios-subtext">Сегодня: {todayCount} · Просрочено: {overdueCount}</p>
              <p className="mt-1 text-[11px] text-ios-subtext">Последнее обновление: {lastUpdatedLabel}{isOffline ? ' · оффлайн-кэш' : ''}</p>
            </div>

            <button
              type="button"
              className="touch-target android-ripple inline-flex shrink-0 items-center rounded-full border border-ios-border/60 bg-white/60 px-3 text-ios-caption text-ios-subtext dark:bg-zinc-900/55"
              onClick={() => {
                hapticImpact('light');
                void calendarQuery.refetch();
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Обновить
            </button>
          </div>

          <div className="mt-4 grid grid-cols-[84px_1fr] items-center gap-3">
            <div className="relative h-[84px] w-[84px]">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="10" />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="url(#calendar-today-gradient)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={264}
                  initial={{ strokeDashoffset: 264 }}
                  animate={{ strokeDashoffset: 264 - (264 * progress) / 100 }}
                  transition={{ type: 'spring', stiffness: 180, damping: 24 }}
                />
                <defs>
                  <linearGradient id="calendar-today-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#34C759" />
                    <stop offset="60%" stopColor="#F59E0B" />
                    <stop offset="100%" stopColor="#EF4444" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-lg font-semibold text-ios-text">{progress}%</p>
                <p className="text-[10px] text-ios-subtext">выполнено</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-2.5 rounded-2xl border border-ios-border/55 bg-white/45 px-3.5 py-2.5 dark:bg-zinc-900/45">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ios-accent" />
                <p className="text-xs leading-5 text-ios-subtext">
                  {todayCount + overdueCount > 0
                    ? `На сегодня есть ${todayCount + overdueCount} задач(и)`
                    : 'Сегодня все счастливы — задач нет'}
                </p>
              </div>

              {urgentTodayIds.length > 0 ? (
                <MassWaterButton
                  count={urgentTodayIds.length}
                  pending={massCompleteMutation.isPending}
                  onRun={() => massCompleteMutation.mutateAsync(urgentTodayIds)}
                />
              ) : null}
            </div>
          </div>
        </div>

        {overdueCount > 0 ? (
          <motion.section
            className="ios-blur-card border border-red-300/60 bg-red-500/10 p-3"
            animate={reduceMotion ? { x: 0 } : { x: [0, -4, 4, -2, 2, 0] }}
            transition={{ duration: 0.52, ease: 'easeInOut', repeat: reduceMotion ? 0 : Infinity, repeatDelay: 5.5 }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
                Срочно: {overdueCount} просроченных задач
              </p>
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] text-red-600 dark:text-red-300">Требует внимания</span>
            </div>
          </motion.section>
        ) : null}

        <section className="ios-blur-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ios-text">
              <BarChart3 className="h-4 w-4 text-ios-accent" />
              Статистика недели
            </p>
            <span className="text-[11px] text-ios-subtext">Пн–Вс</span>
          </div>
          <div className="grid auto-rows-fr grid-cols-3 gap-2.5">
            <StatItem label="Задач" value={weekStats.planned} />
            <StatItem label="Срочных" value={weekStats.urgent} />
            <StatItem label="Стабильно" value={weekStats.safe} />
          </div>
        </section>

        <div className="ios-blur-card p-1.5">
          <div className="no-scrollbar flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const active = tab.key === filter;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`touch-target android-ripple relative shrink-0 rounded-2xl border px-3.5 text-xs font-semibold transition ${
                    active
                      ? 'border-ios-accent bg-ios-accent text-[#0D2815] shadow-[0_8px_20px_rgba(52,199,89,0.25)]'
                      : 'border-ios-border/60 bg-white/60 text-ios-subtext hover:text-ios-text dark:bg-zinc-900/55'
                  }`}
                  onClick={() => {
                    hapticSelectionChanged();
                    setFilter(tab.key);
                  }}
                >
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    {tab.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-black/15 text-[#0D2815]' : 'bg-ios-accent/12 text-ios-accent'}`}>
                      {tab.count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <CalendarStrip
          events={filteredByTypeEvents}
          anchorDate={stripAnchorDate}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onShiftWindow={(delta) => {
            setStripAnchorDate((prev) => addDays(prev, delta));
          }}
        />

        <ConditionsForecast
          plantId={forecastPlant?.plantId ?? null}
          plantName={forecastPlant?.plantName}
        />

        {calendarQuery.isLoading ? <p className="py-6 text-center text-ios-subtext">Загружаем календарь...</p> : null}
        {calendarQuery.isError ? <p className="py-6 text-center text-red-500">Не удалось загрузить календарь.</p> : null}

        {!calendarQuery.isLoading ? (
          <DayCard
            dateKey={selectedDate}
            events={selectedDayEvents}
            pendingPlantId={pendingPlantId}
            onComplete={(plantId) => completeMutation.mutateAsync(plantId)}
            onOpenPlant={(plantId) => openPlantDetail(plantId)}
          />
        ) : null}
      </section>
    </PlatformPullToRefresh>
  );
}
