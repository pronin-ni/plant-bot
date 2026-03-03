import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BarChart3, Bell, Brain, CalendarSync, Copy, ExternalLink, MapPin, Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getCalendarSync, getLearning, getStats, updateCalendarSync, updateCity } from '@/lib/api';
import { hapticImpact, hapticNotify, hapticSelectionChanged } from '@/lib/telegram';
import { useAuthStore } from '@/lib/store';

export function SettingsScreen() {
  const username = useAuthStore((s) => s.username);
  const [city, setCity] = useState('');

  const cityMutation = useMutation({
    mutationFn: (value: string) => updateCity(value),
    onSuccess: () => hapticNotify('success'),
    onError: () => hapticNotify('error')
  });

  const statsQuery = useQuery({
    queryKey: ['stats'],
    queryFn: getStats
  });

  const learningQuery = useQuery({
    queryKey: ['learning'],
    queryFn: getLearning
  });

  const calendarSyncQuery = useQuery({
    queryKey: ['calendar-sync'],
    queryFn: getCalendarSync
  });

  const calendarSyncMutation = useMutation({
    mutationFn: (enabled: boolean) => updateCalendarSync(enabled),
    onSuccess: () => {
      hapticNotify('success');
      void calendarSyncQuery.refetch();
    },
    onError: () => hapticNotify('error')
  });

  const overdueCount = useMemo(
    () => (statsQuery.data ?? []).filter((item) => item.overdue).length,
    [statsQuery.data]
  );


  const isApplePlatform = useMemo(() => {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod|Macintosh/i.test(ua);
  }, []);

  const openGoogleCalendarImport = () => {
    const httpsUrl = calendarSyncQuery.data?.httpsUrl;
    if (!httpsUrl) {
      return;
    }

    // Универсальный deep-link на подписку по URL в веб-версии Google Calendar.
    const encoded = encodeURIComponent(httpsUrl);
    const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encoded}`;
    hapticImpact('light');
    window.open(googleUrl, '_blank');
  };

  const openAppleCalendarImport = () => {
    const webcalUrl = calendarSyncQuery.data?.webcalUrl;
    if (!webcalUrl) {
      return;
    }

    // На iOS/macOS webcal:// откроет системный диалог подписки в Календаре.
    hapticImpact('light');
    window.open(webcalUrl, '_blank');
  };

  const openBestCalendarImport = () => {
    hapticSelectionChanged();
    if (isApplePlatform) {
      openAppleCalendarImport();
      return;
    }
    openGoogleCalendarImport();
  };

  return (
    <section className="space-y-3">
      <div className="ios-blur-card p-4">
        <p className="text-ios-caption text-ios-subtext">Пользователь</p>
        <p className="mt-1 text-ios-title-2">@{username ?? 'не указан'}</p>
      </div>

      <div className="ios-blur-card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-medium">Город для погоды</p>
        </div>
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Например, Санкт-Петербург"
          className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
        />
        <Button
          className="w-full"
          disabled={city.trim().length < 2 || cityMutation.isPending}
          onClick={() => {
            hapticImpact('light');
            cityMutation.mutate(city.trim());
          }}
        >
          {cityMutation.isPending ? 'Сохраняем...' : 'Сохранить город'}
        </Button>
      </div>

      <div className="ios-blur-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-medium">Статистика поливов</p>
        </div>
        {statsQuery.isLoading ? <p className="text-ios-caption text-ios-subtext">Загружаем статистику...</p> : null}
        {statsQuery.data ? (
          <>
            <p className="text-ios-caption text-ios-subtext">Просроченных растений: {overdueCount}</p>
            <div className="mt-2 space-y-1 text-[12px] text-ios-subtext">
              {statsQuery.data.slice(0, 5).map((item) => (
                <p key={item.plantId}>
                  {item.plantName}: {item.averageIntervalDays ? `${item.averageIntervalDays.toFixed(1)} дн.` : 'нет данных'}, поливов {item.totalWaterings}
                </p>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="ios-blur-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Brain className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-medium">Адаптивное обучение</p>
        </div>
        {learningQuery.isLoading ? <p className="text-ios-caption text-ios-subtext">Загружаем обучение...</p> : null}
        {learningQuery.data ? (
          <div className="space-y-1 text-[12px] text-ios-subtext">
            {learningQuery.data.slice(0, 5).map((item) => (
              <p key={item.plantId}>
                {item.plantName}: итог {item.finalIntervalDays.toFixed(1)} дн. ({item.lookupSource ?? 'источник не указан'})
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="ios-blur-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <CalendarSync className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-medium">Синхронизация календаря</p>
        </div>
        <p className="mb-3 text-ios-caption text-ios-subtext">
          Опционально: можно подписаться в Google/Apple/другом календаре по ссылке. События будут обновляться динамически.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              hapticImpact('light');
              const enabled = !(calendarSyncQuery.data?.enabled ?? false);
              calendarSyncMutation.mutate(enabled);
            }}
            disabled={calendarSyncMutation.isPending}
          >
            {(calendarSyncQuery.data?.enabled ?? false) ? 'Отключить' : 'Включить'}
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              const url = calendarSyncQuery.data?.httpsUrl;
              if (!url) {
                return;
              }
              await navigator.clipboard.writeText(url);
              hapticNotify('success');
            }}
            disabled={!calendarSyncQuery.data?.httpsUrl}
          >
            <Copy className="mr-1.5 h-4 w-4" />
            Копировать URL
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            onClick={openBestCalendarImport}
            disabled={!(calendarSyncQuery.data?.enabled ?? false)}
          >
            <ExternalLink className="mr-1.5 h-4 w-4" />
            {isApplePlatform ? 'Открыть Apple Calendar' : 'Открыть Google Calendar'}
          </Button>
          <Button
            variant="secondary"
            onClick={openGoogleCalendarImport}
            disabled={!calendarSyncQuery.data?.httpsUrl || !(calendarSyncQuery.data?.enabled ?? false)}
          >
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Google Calendar
          </Button>
          <Button
            variant="secondary"
            onClick={openAppleCalendarImport}
            disabled={!calendarSyncQuery.data?.webcalUrl || !(calendarSyncQuery.data?.enabled ?? false)}
          >
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Apple Calendar
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              void calendarSyncQuery.refetch();
            }}
          >
            Обновить ссылку
          </Button>
        </div>
      </div>

      <div className="ios-blur-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Bell className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-medium">Уведомления</p>
        </div>
        <p className="text-ios-caption text-ios-subtext">
          Уведомления о поливе приходят через Telegram и синхронизируются с ботом.
        </p>
      </div>

      <div className="ios-blur-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-medium">Тактильный отклик</p>
        </div>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            hapticImpact('heavy');
          }}
        >
          Проверить haptic
        </Button>
      </div>
    </section>
  );
}
