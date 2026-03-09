import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { getPwaPushPublicKey, getPwaPushStatus, subscribePwaPush, unsubscribePwaPush } from '@/lib/api';
import { hapticImpact } from '@/lib/telegram';

import { NOTIFICATION_PATTERN_KEY, NOTIFICATION_TIME_KEY, urlBase64ToArrayBuffer } from './panel-shared';

export function NotificationsPanel() {
  const [time, setTime] = useState(() => localStorage.getItem(NOTIFICATION_TIME_KEY) ?? '09:00');
  const [pattern, setPattern] = useState(() => localStorage.getItem(NOTIFICATION_PATTERN_KEY) ?? 'medium');
  const [pushKey, setPushKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [pushState, setPushState] = useState({ enabled: false, subscribed: false, count: 0 });

  const persist = (nextTime: string, nextPattern: string) => {
    localStorage.setItem(NOTIFICATION_TIME_KEY, nextTime);
    localStorage.setItem(NOTIFICATION_PATTERN_KEY, nextPattern);
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
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setStatus('Push не поддерживается этим браузером.');
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

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(pushKey)
      });

      await subscribePwaPush(subscription.toJSON());
      hapticImpact('medium');
      setStatus('Push подписка успешно включена.');
      await refresh();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось включить push.');
    }
  };

  const unsubscribe = async () => {
    try {
      if (!('serviceWorker' in navigator)) {
        setStatus('Service Worker недоступен.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub?.endpoint) {
        await unsubscribePwaPush(sub.endpoint);
      }
      await sub?.unsubscribe();
      setStatus('Push подписка отключена.');
      await refresh();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось отключить push.');
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
        <p>Статус: {pushState.subscribed ? 'Подписаны' : 'Не подписаны'} · endpoint: {pushState.count}</p>
        <p className="mt-1">Разрешение браузера: {typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={subscribe} disabled={loading || pushState.subscribed || !pushState.enabled}>
          Включить Push
        </Button>
        <Button variant="secondary" onClick={unsubscribe} disabled={loading || !pushState.subscribed}>
          Отключить Push
        </Button>
        <Button variant="ghost" onClick={testPattern}>
          Тест вибрации
        </Button>
        <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>
          Обновить
        </Button>
      </div>

      {status ? <p className="text-xs text-ios-subtext">{status}</p> : null}
    </div>
  );
}
