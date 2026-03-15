import { useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, CheckCircle2, RefreshCcw, Smartphone, TriangleAlert, Waves } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  getPwaPushPublicKey,
  getPwaPushStatus,
  sendAdminPushTest,
  sendPwaPushTest,
  subscribePwaPush,
  unsubscribePwaPush
} from '@/lib/api';
import {
  clearLastPushReceipt,
  ensurePushSubscription,
  getLocalPushSubscription,
  readLastPushReceipt,
  removePushSubscription,
  subscribeToPushReceipts,
  waitForServiceWorkerRegistration,
  type PushReceipt
} from '@/lib/pwa';
import {
  error as hapticError,
  impactHeavy,
  impactLight,
  impactMedium,
  selection,
  success as hapticSuccess,
  warning as hapticWarning
} from '@/lib/haptics';
import { useAuthStore } from '@/lib/store';

import { NOTIFICATION_PATTERN_KEY, NOTIFICATION_TIME_KEY } from './panel-shared';

type PermissionStateLabel = NotificationPermission | 'unsupported';
type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

type PushPanelState = {
  enabled: boolean;
  userSubscribed: boolean;
  currentDeviceSubscribed: boolean;
  subscriptionsCount: number;
  permission: PermissionStateLabel;
  browserSupported: boolean;
  serviceWorkerReady: boolean;
  localSubscriptionExists: boolean;
  localEndpoint: string | null;
  lastReceipt: PushReceipt | null;
};

type PushSummary = {
  title: string;
  body: string;
  nextStep: string;
  tone: StatusTone;
};

const RECEIPT_POLL_TIMEOUT_MS = 10000;
const RECEIPT_POLL_INTERVAL_MS = 500;

function getPermissionState(): PermissionStateLabel {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

function formatPermissionLabel(permission: PermissionStateLabel): string {
  switch (permission) {
    case 'granted':
      return 'Разрешение выдано';
    case 'denied':
      return 'Запрещено в браузере';
    case 'default':
      return 'Ещё не запрашивали';
    default:
      return 'Браузер не поддерживает уведомления';
  }
}

function formatReceiptLabel(receipt: PushReceipt | null): string {
  if (!receipt) {
    return 'Пока нет подтверждённого receipt на этом устройстве';
  }
  return `${new Date(receipt.receivedAt).toLocaleString('ru-RU')} · ${receipt.title}`;
}

function getToneClasses(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'theme-banner-success';
    case 'warning':
      return 'theme-banner-warning';
    case 'danger':
      return 'theme-banner-danger';
    default:
      return 'theme-surface-subtle text-ios-subtext';
  }
}

function buildPushSummary(state: PushPanelState): PushSummary {
  if (!state.browserSupported) {
    return {
      title: 'Web Push не поддерживается',
      body: 'Этот браузер не умеет работать с push-уведомлениями для Plant Bot.',
      nextStep: 'Откройте приложение в поддерживаемом браузере или установленной PWA.',
      tone: 'danger'
    };
  }

  if (!state.enabled) {
    return {
      title: 'Push на сервере выключен',
      body: 'Сервер не готов принимать подписки и отправлять тестовые push-уведомления.',
      nextStep: 'Нужны включённый Web Push и корректные VAPID-ключи на backend.',
      tone: 'danger'
    };
  }

  if (state.permission === 'denied') {
    return {
      title: 'Уведомления запрещены в браузере',
      body: 'Мы не сможем подписать это устройство, пока разрешение заблокировано.',
      nextStep: 'Разрешите уведомления в настройках сайта и вернитесь сюда.',
      tone: 'warning'
    };
  }

  if (state.permission !== 'granted') {
    return {
      title: 'Сначала нужно разрешение браузера',
      body: 'После разрешения мы создадим push-подписку именно для этого устройства.',
      nextStep: 'Нажмите «Разрешить и подключить Web Push».',
      tone: 'warning'
    };
  }

  if (!state.localSubscriptionExists && state.userSubscribed) {
    return {
      title: 'Аккаунт уже подписан, но не это устройство',
      body: `У аккаунта есть ${state.subscriptionsCount} активн. подписк., но текущий браузер ещё не подключён.`,
      nextStep: 'Подключите Web Push для этого устройства отдельно.',
      tone: 'warning'
    };
  }

  if (state.localSubscriptionExists && !state.currentDeviceSubscribed) {
    return {
      title: 'Нужно переподключить текущее устройство',
      body: 'Локальная подписка браузера есть, но сервер ещё не привязал её к аккаунту.',
      nextStep: 'Нажмите «Переподключить это устройство».',
      tone: 'warning'
    };
  }

  if (state.currentDeviceSubscribed) {
    return {
      title: 'Push активен на этом устройстве',
      body: 'Теперь можно отправить self-test и подтвердить receipt именно на текущем браузере.',
      nextStep: 'Используйте «Отправить self-test» для проверки доставки.',
      tone: 'success'
    };
  }

  return {
    title: 'Это устройство ещё не подключено',
    body: 'Разрешение уже есть, осталось создать и сохранить подписку для текущего браузера.',
    nextStep: 'Нажмите «Подключить Web Push».',
    tone: 'neutral'
  };
}

async function waitForMatchingReceipt(tag: string): Promise<PushReceipt | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < RECEIPT_POLL_TIMEOUT_MS) {
    const receipt = await readLastPushReceipt();
    if (receipt?.tag === tag) {
      return receipt;
    }
    await new Promise((resolve) => window.setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
  }
  return null;
}

function StatusPill({ tone, children }: { tone: StatusTone; children: string }) {
  const toneClass = tone === 'success'
    ? 'theme-badge-success'
    : tone === 'warning'
      ? 'theme-badge-warning'
      : tone === 'danger'
        ? 'theme-badge-danger'
        : 'theme-surface-subtle text-ios-subtext';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

function DiagnosticItem({
  label,
  value,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  tone?: StatusTone;
}) {
  return (
    <div className="theme-surface-subtle rounded-xl border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-ios-subtext">{label}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-ios-text">{value}</p>
        <StatusPill tone={tone}>
          {tone === 'success' ? 'OK' : tone === 'warning' ? 'Внимание' : tone === 'danger' ? 'Проблема' : 'Info'}
        </StatusPill>
      </div>
    </div>
  );
}

export function NotificationsPanel() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [time, setTime] = useState(() => localStorage.getItem(NOTIFICATION_TIME_KEY) ?? '09:00');
  const [pattern, setPattern] = useState(() => localStorage.getItem(NOTIFICATION_PATTERN_KEY) ?? 'medium');
  const [pushKey, setPushKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<'subscribe' | 'unsubscribe' | 'test' | null>(null);
  const [status, setStatus] = useState('');
  const [panelState, setPanelState] = useState<PushPanelState>({
    enabled: false,
    userSubscribed: false,
    currentDeviceSubscribed: false,
    subscriptionsCount: 0,
    permission: getPermissionState(),
    browserSupported: typeof window !== 'undefined' && 'PushManager' in window && 'serviceWorker' in navigator,
    serviceWorkerReady: false,
    localSubscriptionExists: false,
    localEndpoint: null,
    lastReceipt: null
  });
  const [pushTestUserId, setPushTestUserId] = useState('');
  const [pushTestPending, setPushTestPending] = useState(false);

  const pushSummary = useMemo(() => buildPushSummary(panelState), [panelState]);

  const persist = (nextTime: string, nextPattern: string) => {
    localStorage.setItem(NOTIFICATION_TIME_KEY, nextTime);
    localStorage.setItem(NOTIFICATION_PATTERN_KEY, nextPattern);
    selection();
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
      const browserSupported = 'serviceWorker' in navigator && 'PushManager' in window;
      const permission = getPermissionState();
      let serviceWorkerReady = false;
      let localSubscription = null;

      if (browserSupported) {
        try {
          await waitForServiceWorkerRegistration();
          serviceWorkerReady = true;
          localSubscription = await getLocalPushSubscription();
        } catch (error) {
          if (!shouldSilencePushError(error)) {
            console.error(error);
          }
        }
      }

      const localEndpoint = localSubscription?.endpoint ?? null;
      const [keyRes, stateRes, lastReceipt] = await Promise.all([
        getPwaPushPublicKey(),
        getPwaPushStatus(localEndpoint),
        readLastPushReceipt()
      ]);

      setPushKey(keyRes.publicKey ?? '');
      setPanelState({
        enabled: Boolean(stateRes.enabled),
        userSubscribed: Boolean(stateRes.userSubscribed ?? stateRes.subscribed),
        currentDeviceSubscribed: Boolean(stateRes.currentDeviceSubscribed),
        subscriptionsCount: Number(stateRes.subscriptionsCount ?? 0),
        permission,
        browserSupported,
        serviceWorkerReady,
        localSubscriptionExists: Boolean(localSubscription),
        localEndpoint,
        lastReceipt
      });

      setStatus(buildPushSummary({
        enabled: Boolean(stateRes.enabled),
        userSubscribed: Boolean(stateRes.userSubscribed ?? stateRes.subscribed),
        currentDeviceSubscribed: Boolean(stateRes.currentDeviceSubscribed),
        subscriptionsCount: Number(stateRes.subscriptionsCount ?? 0),
        permission,
        browserSupported,
        serviceWorkerReady,
        localSubscriptionExists: Boolean(localSubscription),
        localEndpoint,
        lastReceipt
      }).nextStep);
    } catch (error) {
      console.error(error);
      setStatus('Не удалось обновить статус Web Push.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToPushReceipts((receipt) => {
      setPanelState((current) => ({ ...current, lastReceipt: receipt }));
      setStatus(`Уведомление получено на этом устройстве: ${receipt.title}`);
      hapticSuccess();
    });
    return unsubscribe;
  }, []);

  const testPattern = () => {
    if (pattern === 'light') {
      impactLight();
      return;
    }
    if (pattern === 'heavy') {
      impactHeavy();
      return;
    }
    impactMedium();
  };

  const subscribe = async () => {
    if (loading || action !== null) {
      return;
    }
    setAction('subscribe');
    try {
      if (!panelState.browserSupported) {
        setStatus('Этот браузер не поддерживает Web Push.');
        return;
      }
      if (panelState.permission === 'unsupported') {
        setStatus('Notification API недоступен в этом браузере.');
        return;
      }
      if (!panelState.enabled) {
        setStatus('Сначала включите Web Push на сервере и настройте VAPID-ключи.');
        return;
      }
      if (!pushKey) {
        setStatus('Публичный VAPID-ключ пока недоступен.');
        return;
      }

      const subscription = await ensurePushSubscription(pushKey);
      if (!subscription) {
        setStatus('Браузер не выдал разрешение на уведомления.');
        return;
      }

      await subscribePwaPush(subscription.toJSON());
      hapticSuccess();
      setStatus('Это устройство подключено к Web Push. Теперь можно отправить self-test.');
      await refresh();
    } catch (error) {
      if (!shouldSilencePushError(error)) {
        console.error(error);
      }
      setStatus(getPushErrorMessage(error, 'Не удалось подключить Web Push на этом устройстве.'));
      hapticError();
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
      const endpoint = await removePushSubscription();
      if (endpoint) {
        await unsubscribePwaPush(endpoint);
      } else if (panelState.localEndpoint) {
        await unsubscribePwaPush(panelState.localEndpoint);
      }
      setStatus('Подписка текущего устройства отключена.');
      selection();
      await refresh();
    } catch (error) {
      if (!shouldSilencePushError(error)) {
        console.error(error);
      }
      setStatus(getPushErrorMessage(error, 'Не удалось отключить Web Push на этом устройстве.'));
      hapticError();
    } finally {
      setAction(null);
    }
  };

  const runSelfPushTest = async () => {
    if (!panelState.localEndpoint) {
      setStatus('Сначала подключите Web Push на этом устройстве.');
      return;
    }
    setAction('test');
    const tag = `pwa-self-test-${Date.now()}`;
    try {
      await clearLastPushReceipt();
      setPanelState((current) => ({ ...current, lastReceipt: null }));
      setStatus('Отправляем self-test и ждём receipt на этом устройстве...');
      const result = await sendPwaPushTest({
        endpoint: panelState.localEndpoint,
        title: 'Plant Bot: тест уведомлений',
        body: 'Если вы видите это уведомление, канал для этого устройства работает.',
        tag
      });
      if (!result.acceptedByProvider) {
        setStatus(result.message || 'Push не принят провайдером.');
        hapticWarning();
        return;
      }
      setStatus('Push принят провайдером. Теперь ждём подтверждение receipt на этом устройстве...');
      const receipt = await waitForMatchingReceipt(result.tag);
      if (receipt) {
        setPanelState((current) => ({ ...current, lastReceipt: receipt }));
        setStatus(`Receipt подтверждён: ${receipt.title}`);
        hapticSuccess();
      } else {
        setStatus('Backend получил acceptance, но это устройство пока не подтвердило receipt. Проверьте фоновые ограничения браузера или stale subscription.');
        hapticWarning();
      }
      await refresh();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось выполнить self-test push для этого устройства.');
      hapticError();
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
      setStatus('Укажите ID пользователя для admin push-теста.');
      return;
    }
    setPushTestPending(true);
    setStatus('Отправляем admin push-тест...');
    try {
      const res = await sendAdminPushTest({
        userId: Number(pushTestUserId),
        title: 'Push-тест Plant Bot',
        body: 'Это тестовое уведомление для проверки канала.'
      });
      if (res.ok) {
        setStatus(`Admin test принят провайдером: ${res.delivered}/${res.subscriptions}. Receipt конкретного устройства проверяйте отдельно.`);
        hapticSuccess();
      } else {
        setStatus(res.message || 'Admin push-тест не был принят провайдером.');
        hapticWarning();
      }
    } catch (error) {
      console.error(error);
      setStatus('Не удалось выполнить admin push-тест.');
      hapticError();
    } finally {
      setPushTestPending(false);
    }
  };

  const subscribeButtonLabel = useMemo(() => {
    if (panelState.permission !== 'granted') {
      return 'Разрешить и подключить Web Push';
    }
    if (panelState.localSubscriptionExists && !panelState.currentDeviceSubscribed) {
      return 'Переподключить это устройство';
    }
    return 'Подключить Web Push';
  }, [panelState.currentDeviceSubscribed, panelState.localSubscriptionExists, panelState.permission]);

  const canSubscribe = panelState.browserSupported && !panelState.currentDeviceSubscribed;
  const canSelfTest = panelState.currentDeviceSubscribed && Boolean(panelState.localEndpoint);

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border p-4 ${getToneClasses(pushSummary.tone)}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ios-text">{pushSummary.title}</p>
              <StatusPill tone={pushSummary.tone}>
                {pushSummary.tone === 'success' ? 'Готово' : pushSummary.tone === 'warning' ? 'Нужно действие' : pushSummary.tone === 'danger' ? 'Не готово' : 'Ожидает'}
              </StatusPill>
            </div>
            <p className="mt-2 text-xs leading-5 text-ios-subtext">{pushSummary.body}</p>
            <p className="mt-2 text-xs font-medium text-ios-text">Следующий шаг: {pushSummary.nextStep}</p>
          </div>
          <span className="theme-surface-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-ios-accent">
            {pushSummary.tone === 'success' ? <CheckCircle2 className="h-5 w-5" /> : pushSummary.tone === 'danger' ? <BellOff className="h-5 w-5" /> : pushSummary.tone === 'warning' ? <TriangleAlert className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          </span>
        </div>
      </section>

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
            className="theme-field touch-target w-full rounded-ios-button border px-3 text-sm outline-none"
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
            className="theme-field touch-target w-full rounded-ios-button border px-3 text-sm outline-none"
          >
            <option value="light">Лёгкий</option>
            <option value="medium">Средний</option>
            <option value="heavy">Сильный</option>
          </select>
        </label>
      </div>

      <section className="space-y-2">
        <p className="text-[12px] font-medium uppercase tracking-wide text-ios-subtext">Состояние канала</p>
        <div className="grid grid-cols-1 gap-2">
          <DiagnosticItem label="Сервер" value={panelState.enabled ? 'Web Push включён' : 'Web Push выключен'} tone={panelState.enabled ? 'success' : 'danger'} />
          <DiagnosticItem label="Разрешение" value={formatPermissionLabel(panelState.permission)} tone={panelState.permission === 'granted' ? 'success' : panelState.permission === 'denied' ? 'danger' : 'warning'} />
          <DiagnosticItem label="Service Worker" value={panelState.serviceWorkerReady ? 'Готов к push-событиям' : 'Пока не готов'} tone={panelState.serviceWorkerReady ? 'success' : 'warning'} />
          <DiagnosticItem label="Текущее устройство" value={panelState.currentDeviceSubscribed ? 'Подключено на сервере' : panelState.localSubscriptionExists ? 'Локальная подписка есть, но сервер её ещё не видит' : 'Ещё не подключено'} tone={panelState.currentDeviceSubscribed ? 'success' : panelState.localSubscriptionExists ? 'warning' : 'neutral'} />
          <DiagnosticItem label="Receipt" value={formatReceiptLabel(panelState.lastReceipt)} tone={panelState.lastReceipt ? 'success' : 'neutral'} />
        </div>
      </section>

      <section className="theme-surface-2 space-y-3 rounded-2xl border p-4">
        <div>
          <p className="text-sm font-semibold text-ios-text">Действия</p>
          <p className="mt-1 text-xs leading-5 text-ios-subtext">Сначала подключите это устройство, затем отправьте self-test. Сообщение о принятии провайдером ещё не означает receipt на вашем браузере.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={subscribe} disabled={isBusy || !canSubscribe}>
            {action === 'subscribe' ? 'Подключаем...' : subscribeButtonLabel}
          </Button>
          <Button variant="secondary" onClick={unsubscribe} disabled={isBusy || !panelState.localSubscriptionExists}>
            {action === 'unsubscribe' ? 'Отключаем...' : 'Отключить это устройство'}
          </Button>
          <Button variant="secondary" onClick={runSelfPushTest} disabled={isBusy || !canSelfTest}>
            {action === 'test' ? 'Проверяем...' : 'Отправить self-test'}
          </Button>
          <Button variant="ghost" onClick={testPattern} disabled={isBusy}>
            <Waves className="mr-2 h-4 w-4" />
            Тест вибрации
          </Button>
          <Button variant="ghost" onClick={() => void refresh()} disabled={isBusy}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            {loading ? 'Обновляем...' : 'Обновить'}
          </Button>
        </div>
      </section>

      <section className="theme-surface-subtle rounded-2xl border px-3 py-3 text-xs text-ios-subtext">
        <div className="flex items-start gap-2">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-ios-accent" />
          <p className="leading-5">{status}</p>
        </div>
      </section>

      {isAdmin ? (
        <div className="theme-surface-2 space-y-2 rounded-xl border p-3 text-xs text-ios-subtext">
          <p className="font-medium text-ios-text">Админ: тест push по userId</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              min={1}
              inputMode="numeric"
              value={pushTestUserId}
              onChange={(event) => setPushTestUserId(event.target.value)}
              placeholder="ID пользователя"
              className="theme-field h-11 min-w-[140px] flex-1 rounded-ios-button border px-3 text-sm outline-none"
            />
            <Button variant="secondary" onClick={runAdminPushTest} disabled={isBusy || pushTestPending}>
              {pushTestPending ? 'Отправляем...' : 'Admin push test'}
            </Button>
          </div>
          <p className="text-[11px] text-ios-subtext">Этот тест полезен для backend acceptance, но не заменяет self-test на конкретном устройстве.</p>
        </div>
      ) : null}
    </div>
  );
}
