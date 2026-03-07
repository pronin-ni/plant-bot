import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw } from 'lucide-react';

import { getCalendar, waterPlant } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { Button } from '@/components/ui/button';
import { PlatformPullToRefresh } from '@/components/adaptive/PlatformPullToRefresh';

export function CalendarScreen() {
  const queryClient = useQueryClient();

  const calendarQuery = useQuery({
    queryKey: ['calendar'],
    queryFn: getCalendar
  });

  const completeMutation = useMutation({
    mutationFn: (plantId: number) => waterPlant(plantId),
    onSuccess: () => {
      hapticNotify('success');
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
    },
    onError: () => hapticNotify('error')
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return (
    <PlatformPullToRefresh onRefresh={() => calendarQuery.refetch()}>
      <section className="space-y-3 pb-28">
      <div className="flex items-center justify-between">
        <p className="text-ios-caption text-ios-subtext">События полива на ближайшие даты</p>
        <button
          type="button"
          className="inline-flex items-center text-ios-caption text-ios-subtext"
          onClick={() => {
            hapticImpact('light');
            void calendarQuery.refetch();
          }}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Обновить
        </button>
      </div>

      {calendarQuery.isLoading ? <p className="py-6 text-center text-ios-subtext">Загружаем календарь...</p> : null}
      {calendarQuery.isError ? <p className="py-6 text-center text-red-500">Не удалось загрузить календарь.</p> : null}

      <div className="space-y-2">
        {(calendarQuery.data ?? []).map((event) => {
          const eventDate = new Date(event.date);
          eventDate.setHours(0, 0, 0, 0);
          const isToday = eventDate.getTime() === todayStart.getTime();
          return (
          <div
            key={`${event.date}-${event.plantId}`}
            className={`ios-blur-card relative overflow-hidden p-4 ${isToday ? 'ring-2 ring-ios-accent/60' : ''}`}
          >
            <div className="relative z-10 space-y-2">
              <p className="text-ios-body font-semibold text-ios-text">{event.plantName}</p>
              <p className="text-ios-caption text-ios-subtext">
                Полив: {new Date(event.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}
              </p>
              {isToday ? <p className="mt-1 text-[11px] font-semibold text-ios-accent">Нужно полить сегодня</p> : null}
              <Button
                variant="secondary"
                className="w-full"
                disabled={completeMutation.isPending}
                onClick={() => {
                  hapticImpact('rigid');
                  completeMutation.mutate(event.plantId);
                }}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Отметить полив
              </Button>
            </div>
          </div>
        );
        })}
      </div>
      </section>
    </PlatformPullToRefresh>
  );
}
