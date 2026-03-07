import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BarChart3, Bell, Brain, CalendarSync, Copy, ExternalLink, MapPin, Smartphone, BellRing } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HomeAssistantSetup } from '@/app/Settings/HomeAssistantSetup';
import { BackupRestore } from '@/app/Settings/BackupRestore';
import { OpenRouterModelSettings } from '@/app/Settings/OpenRouterModelSettings';
import { AchievementsView } from '@/app/Achievements/AchievementsView';
import {
  getCalendarSync,
  getLearning,
  getPwaPushPublicKey,
  getPwaPushStatus,
  getStats,
  subscribePwaPush,
  unsubscribePwaPush,
  updateCalendarSync,
  updateCity,
  validateTelegramAuth
} from '@/lib/api';
import { ensurePushSubscription, removePushSubscription } from '@/lib/pwa';
import { hapticImpact, hapticNotify, hapticSelectionChanged } from '@/lib/telegram';
import { useAuthStore } from '@/lib/store';

export function SettingsScreen() {
  const username = useAuthStore((s) => s.username);
  const isReady = useAuthStore((s) => s.isReady);
  const isAuthorized = useAuthStore((s) => s.isAuthorized);
  const savedCity = useAuthStore((s) => s.city);
  const [city, setCity] = useState(savedCity ?? '');

  useEffect(() => {
    setCity(savedCity ?? '');
  }, [savedCity]);

  const cityMutation = useMutation({
    mutationFn: (value: string) => updateCity(value),
    onSuccess: (_payload, value) => {
      useAuthStore.getState().setAuth({
        isAuthorized: true,
        telegramUserId: useAuthStore.getState().telegramUserId,
        username: useAuthStore.getState().username,
        city: value,
        isAdmin: useAuthStore.getState().isAdmin
      });
      setCity(value);
      hapticNotify('success');
    },
    onError: () => hapticNotify('error')
  });

  const validateAuthMutation = useMutation({
    mutationFn: validateTelegramAuth,
    onSuccess: (payload) => {
      useAuthStore.getState().setAuth({
        isAuthorized: payload.ok,
        telegramUserId: Number(payload.userId),
        username: payload.username,
        city: payload.city,
        isAdmin: payload.isAdmin
      });
      hapticNotify('success');
    },
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

  const pushKeyQuery = useQuery({
    queryKey: ['pwa-push-key'],
    queryFn: getPwaPushPublicKey
  });

  const pushStatusQuery = useQuery({
    queryKey: ['pwa-push-status'],
    queryFn: getPwaPushStatus,
    enabled: pushKeyQuery.data?.enabled === true
  });

  const pushEnableMutation = useMutation({
    mutationFn: async () => {
      const keyData = pushKeyQuery.data;
      if (!keyData?.enabled || !keyData.publicKey) {
        throw new Error('Web Push не настроен на сервере');
      }
      const subscription = await ensurePushSubscription(keyData.publicKey);
      if (!subscription) {
        throw new Error('Разрешение на уведомления не выдано');
      }
      return subscribePwaPush(subscription.toJSON());
    },
    onSuccess: async () => {
      hapticNotify('success');
      await pushStatusQuery.refetch();
    },
    onError: () => hapticNotify('error')
  });

  const pushDisableMutation = useMutation({
    mutationFn: async () => {
      const endpoint = await removePushSubscription();
      if (!endpoint) {
        return null;
      }
      return unsubscribePwaPush(endpoint);
    },
    onSuccess: async () => {
      hapticNotify('success');
      await pushStatusQuery.refetch();
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
        <p className="text-ios-title-2">Статус авторизации</p>
        <p className="mt-1 text-ios-body text-ios-subtext">
          {isReady ? 'Telegram WebApp инициализирован.' : 'Инициализация Telegram WebApp...'}
        </p>
        <p className="mt-1 text-ios-caption text-ios-subtext">
          {isAuthorized ? `Подтверждено для @${username ?? 'пользователь'}` : 'Пока не подтверждено на сервере'}
        </p>
        <Button
          variant="secondary"
          className="mt-2 w-full"
          disabled={validateAuthMutation.isPending}
          onClick={() => {
            hapticImpact('light');
            validateAuthMutation.mutate();
          }}
        >
          {validateAuthMutation.isPending ? 'Проверяем...' : 'Перепроверить авторизацию'}
        </Button>
      </div>

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


      <HomeAssistantSetup />
      <OpenRouterModelSettings />
      <BackupRestore />
      <AchievementsView />

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
          <BellRing className="h-4 w-4 text-ios-accent" />
          <p className="text-ios-body font-medium">Web Push для PWA</p>
        </div>
        {!pushKeyQuery.data?.enabled ? (
          <p className="text-ios-caption text-ios-subtext">
            На сервере не настроены VAPID-ключи. Укажите `WEB_PUSH_VAPID_PUBLIC_KEY` и `WEB_PUSH_VAPID_PRIVATE_KEY`.
          </p>
        ) : (
          <>
            <p className="text-ios-caption text-ios-subtext">
              Статус: {pushStatusQuery.data?.subscribed ? 'подписка активна' : 'подписка отключена'}.
              Уведомления придут, даже когда PWA закрыта.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                disabled={pushEnableMutation.isPending || pushStatusQuery.data?.subscribed}
                onClick={() => {
                  hapticImpact('light');
                  pushEnableMutation.mutate();
                }}
              >
                Включить
              </Button>
              <Button
                variant="secondary"
                disabled={pushDisableMutation.isPending || !pushStatusQuery.data?.subscribed}
                onClick={() => {
                  hapticImpact('light');
                  pushDisableMutation.mutate();
                }}
              >
                Отключить
              </Button>
            </div>
          </>
        )}
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
