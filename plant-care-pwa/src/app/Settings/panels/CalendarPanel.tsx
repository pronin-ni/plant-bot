import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Apple,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  RefreshCcw,
  Smartphone,
  Sparkles,
  TriangleAlert
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getCalendarSync, updateCalendarSync } from '@/lib/api';
import { impactLight, impactMedium, impactHeavy } from '@/lib/haptics';
import type { CalendarSyncDto } from '@/types/api';

type StatusTone = 'success' | 'warning' | 'neutral';

function getToneClasses(tone: StatusTone): string {
  switch (tone) {
    case 'success':
      return 'theme-banner-success';
    case 'warning':
      return 'theme-banner-warning';
    default:
      return 'theme-surface-subtle text-ios-subtext';
  }
}

function PlatformCard({
  icon,
  title,
  description,
  children
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="theme-surface-2 rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        <span className="theme-surface-subtle inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-ios-accent">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ios-text">{title}</p>
          <p className="mt-1 text-xs leading-5 text-ios-subtext">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function CalendarPanel() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [sync, setSync] = useState<CalendarSyncDto | null>(null);
  const [googleHelpOpen, setGoogleHelpOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const load = async () => {
    setLoading(true);
    try {
      const response = await getCalendarSync();
      setSync(response);
      setStatus(
        response.enabled
          ? 'Календарь поливов готов к подключению. Это подписка, а не разовый экспорт.'
          : 'Подписка на календарь пока выключена. Сначала включите её, затем выберите Apple Calendar, Google Calendar или другое приложение.'
      );
    } catch (error) {
      console.error(error);
      setStatus('Не удалось загрузить состояние календарной подписки.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleSync = async () => {
    if (!sync) {
      return;
    }
    setLoading(true);
    try {
      const response = await updateCalendarSync(!responseEnabled(sync));
      setSync(response);
      setStatus(
        response.enabled
          ? 'Подписка включена. Теперь можно открыть Apple Calendar или скопировать ссылку для Google Calendar и других приложений.'
          : 'Подписка выключена. Ссылки календаря больше не будут доступны внешним приложениям.'
      );
      setCopyState('idle');
      impactLight();
    } catch (error) {
      console.error(error);
      setStatus('Не удалось обновить настройку календаря.');
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = async () => {
    if (!sync?.httpsUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(sync.httpsUrl);
      setCopyState('copied');
      setStatus('Ссылка календарной подписки скопирована. Её можно вставить в Google Calendar или другое приложение с поддержкой ICS/webcal.');
      impactLight();
    } catch (error) {
      console.error(error);
      setCopyState('error');
      setStatus('Не удалось скопировать ссылку. Попробуйте вручную выделить и скопировать URL ниже.');
    }
  };

  const openAppleCalendar = () => {
    if (!sync?.webcalUrl) {
      return;
    }
    window.location.href = sync.webcalUrl;
    setStatus('Открываем подписку через Apple Calendar. После добавления календарь будет обновляться автоматически по этой ссылке.');
    impactLight();
  };

  const openSubscriptionLink = () => {
    if (!sync?.httpsUrl) {
      return;
    }
    window.open(sync.httpsUrl, '_blank', 'noopener,noreferrer');
    setStatus('Открываем HTTPS-ссылку подписки. Используйте её для приложений, которые поддерживают ICS-подписки по URL.');
    impactLight();
  };

  const summaryTone: StatusTone = useMemo(() => {
    if (sync?.enabled) {
      return 'success';
    }
    if (sync) {
      return 'warning';
    }
    return 'neutral';
  }, [sync]);

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl border p-4 ${getToneClasses(summaryTone)}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ios-text">Календарь поливов</p>
              <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium theme-surface-1 text-ios-text">
                {sync?.enabled ? 'Подписка включена' : 'Подписка выключена'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-ios-subtext">
              {sync?.enabled
                ? 'Это подписка на календарь, а не разовый экспорт. Когда даты полива меняются, ваше календарное приложение подтягивает обновления по той же ссылке.'
                : 'Включите календарную подписку, чтобы добавить поливы в Apple Calendar, Google Calendar или другое приложение с поддержкой ICS/webcal.'}
            </p>
            <p className="mt-2 text-xs font-medium text-ios-text">
              {sync?.enabled
                ? 'Следующий шаг: выберите нужное календарное приложение ниже.'
                : 'Следующий шаг: включите календарь, затем выберите способ подключения.'}
            </p>
          </div>
          <span className="theme-surface-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-ios-accent">
            {sync?.enabled ? <CheckCircle2 className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={toggleSync} disabled={loading || !sync}>
            {loading ? 'Обновляем...' : sync?.enabled ? 'Выключить подписку' : 'Включить календарь'}
          </Button>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Обновить
          </Button>
        </div>
      </section>

      {sync?.enabled ? (
        <>
          <PlatformCard
            icon={<Apple className="h-5 w-5" />}
            title="iPhone / Apple Calendar"
            description="Откройте подписку прямо в Apple Calendar. После добавления календарь будет обновляться автоматически."
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={openAppleCalendar}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Открыть в Apple Calendar
              </Button>
              <Button variant="ghost" onClick={() => void copyUrl()}>
                <Copy className="mr-2 h-4 w-4" />
                Скопировать ссылку
              </Button>
            </div>
          </PlatformCard>

          <PlatformCard
            icon={<Globe className="h-5 w-5" />}
            title="Google Calendar"
            description="Google Calendar обычно удобнее подключать по URL. После добавления календарь тоже будет обновляться автоматически, но частота зависит от самого Google Calendar."
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void copyUrl()}>
                <Copy className="mr-2 h-4 w-4" />
                Скопировать ссылку
              </Button>
              <Button
                variant="ghost"
                onClick={() => setGoogleHelpOpen((current) => !current)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {googleHelpOpen ? 'Скрыть инструкцию' : 'Как подключить'}
              </Button>
            </div>

            {googleHelpOpen ? (
              <div className="theme-surface-subtle rounded-xl border px-3 py-3 text-xs leading-5 text-ios-subtext">
                <p className="font-medium text-ios-text">Как добавить в Google Calendar</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Откройте Google Calendar в браузере, лучше на компьютере.</li>
                  <li>Найдите пункт добавления календаря по URL.</li>
                  <li>Вставьте скопированную ссылку подписки и сохраните календарь.</li>
                </ol>
              </div>
            ) : null}
          </PlatformCard>

          <PlatformCard
            icon={<Smartphone className="h-5 w-5" />}
            title="Другие приложения"
            description="Подходит для системного календаря телефона и других приложений, которые умеют подписываться на ICS / webcal URL."
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void copyUrl()}>
                <Copy className="mr-2 h-4 w-4" />
                Скопировать ссылку
              </Button>
              <Button variant="ghost" onClick={openSubscriptionLink}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Открыть ссылку подписки
              </Button>
            </div>
          </PlatformCard>

          <section className="theme-surface-subtle rounded-2xl border p-4 text-xs text-ios-subtext">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-ios-accent" />
              <div>
                <p className="font-medium text-ios-text">Как работает автообновление</p>
                <p className="mt-1 leading-5">
                  Plant Bot отдаёт одну и ту же ссылку подписки, а обновление выполняет само календарное приложение. Обычно изменения подтягиваются автоматически, но скорость зависит от Apple Calendar, Google Calendar или другого клиента.
                </p>
              </div>
            </div>
          </section>

          <section className="theme-surface-2 rounded-2xl border p-4">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ios-subtext">Ссылка подписки</p>
            <div className="theme-field mt-2 rounded-xl border px-3 py-3 text-xs leading-5 text-ios-text break-all">
              {sync.httpsUrl}
            </div>
            <p className="mt-2 text-[11px] text-ios-subtext">
              {copyState === 'copied'
                ? 'Ссылка скопирована.'
                : copyState === 'error'
                  ? 'Не удалось скопировать автоматически.'
                  : 'Эта HTTPS-ссылка нужна для Google Calendar и большинства других клиентов.'}
            </p>
          </section>
        </>
      ) : null}

      <section className="theme-surface-subtle rounded-2xl border px-3 py-3 text-xs text-ios-subtext">
        {status}
      </section>
    </div>
  );
}

function responseEnabled(sync: CalendarSyncDto | null): boolean {
  return Boolean(sync?.enabled);
}
