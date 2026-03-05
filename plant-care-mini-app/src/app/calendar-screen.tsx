import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

import { getCalendar, waterPlant } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';

export function CalendarScreen() {
  const queryClient = useQueryClient();
  const [pullY, setPullY] = useState(0);

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
    <motion.section
      className="space-y-3"
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDrag={(_, info) => {
        // Rubber-band эффект: ограничиваем визуальное вытягивание.
        const value = Math.max(0, Math.min(62, info.offset.y * 0.45));
        setPullY(value);
      }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 140) {
          hapticImpact('medium');
          void calendarQuery.refetch();
        }
        setPullY(0);
      }}
      animate={{ y: pullY }}
      transition={{ type: 'spring', stiffness: 330, damping: 26, mass: 1 }}
    >
      <div className="flex items-center justify-between">
        <p className="text-ios-caption text-ios-subtext">Потяни вниз для обновления</p>
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
          <motion.div
            key={`${event.date}-${event.plantId}`}
            className={`ios-blur-card relative overflow-hidden p-4 ${isToday ? 'ring-2 ring-ios-accent/60' : ''}`}
            drag="x"
            dragConstraints={{ left: 0, right: 220 }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.x > 120) {
                hapticImpact('rigid');
                completeMutation.mutate(event.plantId);
              }
            }}
            whileTap={{ scale: 0.995 }}
          >
            <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-ios-accent/15">
              <CheckCircle2 className="h-5 w-5 text-ios-accent" />
            </div>
            <div className="relative z-10">
              <p className="text-ios-body font-semibold text-ios-text">{event.plantName}</p>
              <p className="text-ios-caption text-ios-subtext">
                Полив: {new Date(event.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })}
              </p>
              <p className="mt-1 text-[11px] text-ios-subtext">Свайпни вправо, чтобы отметить полив</p>
              {isToday ? <p className="mt-1 text-[11px] font-semibold text-ios-accent">Нужно полить сегодня</p> : null}
            </div>
          </motion.div>
        );
        })}
      </div>
    </motion.section>
  );
}
