import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getPwaPushPublicKey, getPwaPushStatus, sendAdminPushTest, subscribePwaPush, unsubscribePwaPush } from '@/lib/api';
import { waitForServiceWorkerRegistration } from '@/lib/pwa';
import { useAuthStore } from '@/lib/store';
import { hapticImpact } from '@/lib/telegram';

import { NOTIFICATION_PATTERN_KEY, NOTIFICATION_TIME_KEY, urlBase64ToArrayBuffer } from './panel-shared';

export function NotificationsPanel() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [time, setTime] = useState(() => localStorage.getItem(NOTIFICATION_TIME_KEY) ?? '09:00');
  const [pattern, setPattern] = useState(() => localStorage.getItem(NOTIFICATION_PATTERN_KEY) ?? 'medium');
  const [pushKey, setPushKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<'subscribe' | 'unsubscribe' | null>(null);
  const [status, setStatus] = useState<string>('');
  const [pushState, setPushState] = useState({ enabled: false, subscribed: false, count: 0 });
  const [pushTestUserId, setPushTestUserId] = useState('');
  const [pushTestPending, setPushTestPending] = useState(false);

  const persist = (nextTime: string, nextPattern: string) => {
    localStorage.setItem(NOTIFICATION_TIME_KEY, nextTime);
    localStorage.setItem(NOTIFICATION_PATTERN_KEY, nextPattern);
  };

  const getPushErrorMessage = (error: unknown, fallback: string) => {
    const code = error instanceof Error ? error.message : '';
    if (code === 'SERVICE_WORKER_TIMEOUT') {
      return 'Service Worker для push ещё не готов. Перезагрузите страницу или откройте установленную PWA.';
    }
    if (code === 'SERVICE_WORKER_UNAVAILABLE') {
      return 'Service Worker недоступен в этом браузере.';
    }
    return fallback;
  };

  const shouldSilencePushError = (error: unknown) => {
    const code = error instanceof Error ? error.message : '';
    return code === 'SERVICE_WORKER_TIMEOUT' || code === 'SERVICE_WORKER_UNAVAILABLE';
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const [keyRes, stateRes] = await Promise.all([getPwaPushPublicKey(), getPwaPushStatus()]);
      setPushKey(keyRes.publicKey ?? '');
      setPushState({
        enabled: Boolean(stateRes.enabled),
        subscribed: Boolean(stateRes.subscribed),
        count: Number(stateRes.subscriptionsCount ?? 0)
      });
      setStatus(stateRes.subscribed ? 'Push уже активирован на этом устройстве.' : 'Push пока не активирован.');
    } catch (error) {
      console.error(error);
      setStatus('Не удалось получить статус push.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const testPattern = () => {
    const patternMap: Record<string, number[]> = {
      light: [40],
      medium: [80, 40, 80],
      heavy: [150, 60, 150]
    };
    navigator.vibrate?.(patternMap[pattern] ?? [80, 40, 80]);
  };

  const subscribe = async () => {
    if (loading || action !== null) {
      return;
    }
    setAction('subscribe');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('Push не поддерживается этим браузером.');
        return;
      }
      if (typeof Notification === 'undefined') {
        setStatus('Notification API недоступен в этом браузере.');
        return;
      }
      if (!pushState.enabled) {
        setStatus('Push отключён на сервере: настройте VAPID-ключи в backend.');
        return;
      }
      if (!pushKey) {
        setStatus('Публичный VAPID-ключ пока недоступен.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('Разрешение на уведомления не выдано.');
        return;
      }

      const registration = await waitForServiceWorkerRegistration();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(pushKey)
      });

      await subscribePwaPush(subscription.toJSON());
      hapticImpact('medium');
      setStatus('Push подписка успешно включена.');
      await refresh();
    } catch (error) {
      if (!shouldSilencePushError(error)) {
        console.error(error);
      }
      setStatus(getPushErrorMessage(error, 'Не удалось включить push.'));
    } finally {
      setAction(null);
    }
  };

  const unsubscribe = async () => {
    if (loading || action !== null) {
      return;
    }
    setAction('unsubscribe');
    try {
      if (!('serviceWorker' in navigator)) {
        setStatus('Service Worker недоступен.');
        return;
      }
      const registration = await waitForServiceWorkerRegistration();
      const sub = await registration.pushManager.getSubscription();
      if (sub?.endpoint) {
        await unsubscribePwaPush(sub.endpoint);
      }
      await sub?.unsubscribe();
      setStatus('Push подписка отключена.');
      await refresh();
    } catch (error) {
      if (!shouldSilencePushError(error)) {
        console.error(error);
      }
      setStatus(getPushErrorMessage(error, 'Не удалось отключить push.'));
    } finally {
      setAction(null);
    }
  };

  const isBusy = loading || action !== null;

  const runAdminPushTest = async () => {
    if (!isAdmin) {
      return;
    }
    if (!pushTestUserId.trim()) {
      setStatus('Укажите ID пользователя для push-теста.');
      return;
    }
    setPushTestPending(true);
    setStatus('Отправляем тестовое push-уведомление...');
    try {
      const res = await sendAdminPushTest({
        userId: Number(pushTestUserId),
        title: 'Push-тест Plant Bot',
        body: 'Это тестовое уведомление для проверки канала.'
      });
      if (res.ok) {
        setStatus(`Push доставлен: ${res.delivered}/${res.subscriptions}. ${res.message}`);
        hapticImpact('medium');
      } else {
        setStatus(res.message || 'Push-тест не доставлен.');
        hapticImpact('light');
      }
    } catch (error) {
      console.error(error);
      setStatus('Не удалось выполнить push-тест (admin).');
    } finally {
      setPushTestPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[12px] text-ios-subtext">Время напоминаний</span>
          <input
            type="time"
            value={time}
            onChange={(event) => {
              const next = event.target.value;
              setTime(next);
              persist(next, pattern);
            }}
            className="touch-target w-full rounded-ios-button border border-ios-border/60 bg-white/80 px-3 text-sm outline-none"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[12px] text-ios-subtext">Вибро-паттерн</span>
          <select
            value={pattern}
            onChange={(event) => {
              const next = event.target.value;
              setPattern(next);
              persist(time, next);
            }}
            className="touch-target w-full rounded-ios-button border border-ios-border/60 bg-white/80 px-3 text-sm outline-none"
          >
            <option value="light">Лёгкий</option>
            <option value="medium">Средний</option>
            <option value="heavy">Сильный</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-ios-border/60 bg-white/70 p-4 text-xs text-ios-subtext dark:bg-zinc-900/50">
        <p>Статус: {pushState.subscribed ? 'Подписаны' : 'Не подписаны'} · активных подписок: {pushState.count}</p>
        <p className="mt-1">Push на сервере: {pushState.enabled ? 'включён' : 'выключен'}</p>
        <p className="mt-1">Разрешение браузера: {typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={subscribe} disabled={isBusy || pushState.subscribed}>
          {action === 'subscribe' ? 'Подключаем Push...' : 'Включить Push'}
        </Button>
        <Button variant="secondary" onClick={unsubscribe} disabled={isBusy || !pushState.subscribed}>
          {action === 'unsubscribe' ? 'Отключаем Push...' : 'Отключить Push'}
        </Button>
        <Button variant="ghost" onClick={testPattern} disabled={isBusy}>
          Тест вибрации
        </Button>
        <Button variant="ghost" onClick={() => void refresh()} disabled={isBusy}>
          {loading ? 'Обновляем...' : 'Обновить'}
        </Button>
      </div>

      {isAdmin ? (
        <div className="space-y-2 rounded-xl border border-ios-border/60 bg-white/70 p-3 text-xs text-ios-subtext dark:bg-zinc-900/50">
          <p className="font-medium text-ios-text">Админ: тест push по userId</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={pushTestUserId}
              onChange={(event) => setPushTestUserId(event.target.value)}
              placeholder="ID пользователя"
              className="h-11 min-w-[140px] flex-1 rounded-ios-button border border-ios-border/60 bg-white/80 px-3 text-sm outline-none"
            />
            <Button variant="secondary" onClick={runAdminPushTest} disabled={isBusy || pushTestPending}>
              {pushTestPending ? 'Отправляем...' : 'Тест push'}
            </Button>
          </div>
          <p className="text-[11px] text-ios-subtext">Укажите внутренний ID пользователя для отправки тестового push.</p>
        </div>
      ) : null}

      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
  const getPushErrorMessage = (error: unknown, fallback: string) => {
    const code = error instanceof Error ? error.message : '';
    if (code === 'SERVICE_WORKER_TIMEOUT') {
      return 'Service Worker для push ещё не готов. Перезагрузите страницу или откройте установленную PWA.';
    }
    if (code === 'SERVICE_WORKER_UNAVAILABLE') {
      return 'Service Worker недоступен в этом браузере.';
    }
    return fallback;
  };
