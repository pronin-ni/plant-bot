import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BarChart3, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';

import { getCalendar, waterPlant } from '@/lib/api';
import { error as hapticError, impactLight, selection, success as hapticSuccess, warning as hapticWarning } from '@/lib/haptics';
import { useOfflineStore, useUiStore } from '@/lib/store';
import { PlatformPullToRefresh } from '@/components/adaptive/PlatformPullToRefresh';
import { DayCard } from '@/components/DayCard';
import { MassWaterButton } from '@/components/MassWaterButton';
import { ConditionsForecast } from '@/components/ConditionsForecast';
import { useMotionGuard } from '@/lib/motion';
import { parseDateOnly, startOfLocalDay, toLocalDateKey } from '@/lib/date';
import type { CalendarEventDto, PlantDto } from '@/types/api';

type CalendarActionFilter = 'all' | 'watering' | 'fertilizer' | 'repotting' | 'cutting';

interface ActionTabItem {
  key: CalendarActionFilter;
  label: string;
  count: number;
}

function startOfDay(value: Date): Date {
  return startOfLocalDay(value);
}

function dayKeyFromDate(value: Date): string {
  return toLocalDateKey(value);
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
    <div className="theme-surface-subtle flex h-full min-h-[82px] flex-col items-center justify-center rounded-2xl border px-3 py-2.5 text-center">
      <p className="text-[11px] leading-4 text-ios-subtext">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-none text-ios-text">{animated}</p>
    </div>
  );
}

function getUpcomingEventStatus(diffDays: number): string {
  if (diffDays < 0) {
    return `Просрочено на ${Math.abs(diffDays)} дн.`;
  }
  if (diffDays === 0) {
    return 'Сегодня';
  }
  if (diffDays === 1) {
    return 'Завтра';
  }
  return `Через ${diffDays} дн.`;
}

function getUpcomingEventTone(diffDays: number): string {
  if (diffDays < 0) {
    return 'theme-badge-danger';
  }
  if (diffDays <= 1) {
    return 'theme-badge-warning';
  }
  return 'theme-badge-success';
}

function mergeWateredPlant(plants: PlantDto[] | undefined, updatedPlant: PlantDto): PlantDto[] {
  const items = plants ?? [];
  return items.map((plant) => (plant.id === updatedPlant.id ? { ...plant, ...updatedPlant } : plant));
}

function updateCalendarAfterWatering(
  events: CalendarEventDto[] | undefined,
  updatedPlant: PlantDto
): CalendarEventDto[] {
  const items = (events ?? []).filter((event) => event.plantId !== updatedPlant.id);
  if (!updatedPlant.nextWateringDate) {
    return items;
  }
  return [
    ...items,
    {
      date: updatedPlant.nextWateringDate.slice(0, 10),
      plantId: updatedPlant.id,
      plantName: updatedPlant.name
    }
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function runWaterBatchWithConcurrency(plantIds: number[], limit: number) {
  const queue = [...new Set(plantIds)];
  const safeLimit = Math.max(1, Math.min(limit, queue.length || 1));
  let successCount = 0;
  let failedCount = 0;

  let cursor = 0;
  const workers = Array.from({ length: safeLimit }, async () => {
    while (cursor < queue.length) {
      const currentIndex = cursor;
      cursor += 1;
      const plantId = queue[currentIndex];
      try {
        await waterPlant(plantId);
        successCount += 1;
      } catch {
        failedCount += 1;
      }
    }
  });

  await Promise.all(workers);
  return { successCount, failedCount, total: queue.length };
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const openPlantDetail = useUiStore((s) => s.openPlantDetail);
  const isOffline = useOfflineStore((s) => s.isOffline);

  const todayBase = useMemo(() => startOfDay(new Date()), []);
  const [filter, setFilter] = useState<CalendarActionFilter>('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => dayKeyFromDate(todayBase));
  const [wateringWavePulse, setWateringWavePulse] = useState(0);
  const { reduceMotion } = useMotionGuard();

  const calendarQuery = useQuery({
    queryKey: ['calendar'],
    queryFn: getCalendar
  });

  const completeMutation = useMutation({
    mutationFn: (plantId: number) => waterPlant(plantId),
    onSuccess: (updatedPlant) => {
      hapticSuccess();
      setWateringWavePulse((prev) => prev + 1);
      queryClient.setQueryData<PlantDto[]>(['plants'], (current) => mergeWateredPlant(current, updatedPlant));
      queryClient.setQueryData<CalendarEventDto[]>(['calendar'], (current) => updateCalendarAfterWatering(current, updatedPlant));
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticError()
  });

  const massCompleteMutation = useMutation({
    mutationFn: (plantIds: number[]) => runWaterBatchWithConcurrency(plantIds, 4),
    onSuccess: async ({ successCount, failedCount }) => {
      if (successCount > 0) {
        hapticSuccess();
        setWateringWavePulse((prev) => prev + 1);
      } else {
        hapticWarning();
      }
      if (failedCount > 0) {
        impactLight();
      }
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticError()
  });

  const now = new Date();
  const today = startOfDay(now);

  const enrichedEvents = useMemo(() => {
    return (calendarQuery.data ?? [])
      .map((event) => {
        const eventDate = startOfDay(parseDateOnly(event.date));
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

  const upcomingEvents = useMemo(() => {
    return filteredByTypeEvents
      .filter((event) => event.diffDays >= 0)
      .slice(0, 5);
  }, [filteredByTypeEvents]);

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
      const eventDate = startOfDay(parseDateOnly(event.date));
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
              <p className="text-sm text-ios-subtext">Сегодня: {todayCount} · Просрочено: {overdueCount}</p>
              <p className="mt-1 text-[11px] text-ios-subtext">Последнее обновление: {lastUpdatedLabel}{isOffline ? ' · оффлайн-кэш' : ''}</p>
            </div>

            <button
              type="button"
              className="theme-surface-subtle touch-target android-ripple inline-flex shrink-0 items-center rounded-full border px-3 text-ios-caption text-ios-subtext"
              onClick={() => {
                impactLight();
                void calendarQuery.refetch();
              }}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Обновить
            </button>
          </div>

          <div className="mt-4 grid grid-cols-[92px_1fr] items-center gap-3">
            <div className="relative h-[92px] w-[92px]">
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
                    <stop offset="0%" stopColor="hsl(var(--primary))" />
                    <stop offset="60%" stopColor="color-mix(in srgb, hsl(var(--accent)) 70%, #f59e0b 30%)" />
                    <stop offset="100%" stopColor="hsl(var(--destructive))" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="text-[22px] font-semibold leading-none text-ios-text">{progress}%</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="theme-surface-subtle rounded-2xl border px-3.5 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.08em] text-ios-subtext">Выполнение</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-ios-text">
                  {progress >= 100 ? 'Все задачи на сегодня закрыты.' : `${progress}% задач уже выполнено.`}
                </p>
              </div>

              <div className="theme-surface-subtle flex items-start gap-2.5 rounded-2xl border px-3.5 py-2.5">
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
            className="theme-banner-danger rounded-2xl border p-3"
            animate={reduceMotion ? { x: 0 } : { x: [0, -4, 4, -2, 2, 0] }}
            transition={{ duration: 0.52, ease: 'easeInOut', repeat: reduceMotion ? 0 : Infinity, repeatDelay: 5.5 }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--destructive))]">
                <AlertTriangle className="h-4 w-4" />
                Срочно: {overdueCount} просроченных задач
              </p>
              <span className="theme-badge-danger rounded-full border px-2 py-0.5 text-[11px]">Требует внимания</span>
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
                      ? 'border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_8px_20px_hsl(var(--primary)/0.25)]'
                      : 'theme-surface-subtle text-ios-subtext hover:text-ios-text'
                  }`}
                  onClick={() => {
                    selection();
                    setFilter(tab.key);
                  }}
                >
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    {tab.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? 'bg-[hsl(var(--primary-foreground)/0.14)] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--primary)/0.12)] text-ios-accent'}`}>
                      {tab.count}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <ConditionsForecast
          plantId={forecastPlant?.plantId ?? null}
          plantName={forecastPlant?.plantName}
        />

        {calendarQuery.isLoading ? <p className="py-6 text-center text-ios-subtext">Загружаем календарь...</p> : null}
        {calendarQuery.isError ? <p className="theme-banner-danger rounded-xl border px-3 py-3 text-center text-sm">Не удалось загрузить календарь.</p> : null}

        {!calendarQuery.isLoading ? (
          <DayCard
            dateKey={selectedDate}
            events={selectedDayEvents}
            pendingPlantId={pendingPlantId}
            onComplete={(plantId) => completeMutation.mutateAsync(plantId)}
            onOpenPlant={(plantId) => openPlantDetail(plantId)}
          />
        ) : null}

        <section className="ios-blur-card overflow-hidden p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-ios-body font-semibold text-ios-text">Ближайшие поливы</p>
              <p className="text-[11px] text-ios-subtext">Следующие задачи ухода без мёртвых контролов и псевдо-таймлайна.</p>
            </div>
            <span className="theme-surface-subtle inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] text-ios-subtext">
              {upcomingEvents.length}
            </span>
          </div>

          {upcomingEvents.length ? (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <button
                  key={`upcoming-${event.date}-${event.plantId}`}
                  type="button"
                  onClick={() => {
                    selection();
                    setSelectedDate(event.dayKey);
                    openPlantDetail(event.plantId);
                  }}
                  className="theme-surface-subtle android-ripple flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:bg-[hsl(var(--foreground)/0.04)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold text-ios-text">{event.plantName}</p>
                    <p className="mt-0.5 text-xs leading-5 text-ios-subtext">
                      {parseDateOnly(event.date).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: 'long',
                        weekday: 'short'
                      })}
                    </p>
                  </div>

                  <span className={`${getUpcomingEventTone(event.diffDays)} inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[11px]`}>
                    {getUpcomingEventStatus(event.diffDays)}
                  </span>

                  <ChevronRight className="h-4 w-4 shrink-0 text-ios-subtext" />
                </button>
              ))}
            </div>
          ) : (
            <div className="theme-surface-subtle flex min-h-[80px] items-center justify-center rounded-2xl border border-dashed px-4 py-3 text-center">
              <p className="text-xs text-ios-subtext">Ближайших поливов пока нет</p>
            </div>
          )}
        </section>
      </section>
    </PlatformPullToRefresh>
  );
}
