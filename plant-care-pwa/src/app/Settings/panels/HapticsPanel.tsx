import { useMemo, useState } from 'react';
import { CheckCircle2, Smartphone, VibrateOff, Waves } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { impactMedium, isHapticsEnabled, isHapticsSupported, selection, setHapticsEnabled } from '@/lib/haptics';

export function HapticsPanel() {
  const [enabled, setEnabled] = useState(() => isHapticsEnabled());
  const supported = useMemo(() => isHapticsSupported(), []);
  const [status, setStatus] = useState<string | null>(null);

  const handleToggle = () => {
    if (!supported) {
      setStatus('На этом устройстве браузер не поддерживает web vibration. Настройка сохранена как no-op.');
      return;
    }

    if (enabled) {
      selection();
      setHapticsEnabled(false);
      setEnabled(false);
      setStatus('Виброотклик отключён для этого устройства.');
      return;
    }

    setHapticsEnabled(true);
    setEnabled(true);
    selection();
    setStatus('Виброотклик включён для этого устройства.');
  };

  const handlePreview = () => {
    impactMedium();
    setStatus('Тестовый виброотклик отправлен.');
  };

  return (
    <div className="space-y-4">
      <section className="theme-surface-2 rounded-2xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ios-text">Виброотклик интерфейса</p>
            <p className="mt-1 text-xs leading-5 text-ios-subtext">
              Haptic feedback включается только для значимых действий: подтверждений, ошибок, важных переключений и шагов wizard-а.
            </p>
          </div>
          <span className="theme-surface-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-ios-accent">
            {enabled ? <Waves className="h-5 w-5" /> : <VibrateOff className="h-5 w-5" />}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ios-text">Включить виброотклик</p>
            <p className="mt-1 text-xs leading-5 text-ios-subtext">
              {supported
                ? 'Настройка применяется сразу и хранится локально на этом устройстве.'
                : 'Браузер не поддерживает vibration API, поэтому отклик останется выключенным без ошибок.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={handleToggle}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors ${enabled ? 'border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary))]' : 'theme-surface-subtle'}`}
          >
            <span
              className={`inline-block h-6 w-6 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-7' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </section>

      <section className="theme-surface-2 rounded-2xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ios-text">Состояние</p>
            <p className="mt-1 text-xs leading-5 text-ios-subtext">
              {supported
                ? enabled
                  ? 'Виброотклик активен для PWA на этом устройстве.'
                  : 'Виброотклик отключён пользователем.'
                : 'На этой платформе web vibration недоступен, поэтому используется тихий fallback.'}
            </p>
          </div>
          <span className="theme-badge-success inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]">
            <Smartphone className="h-3.5 w-3.5" />
            {supported ? 'PWA device' : 'No-op'}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={handlePreview} disabled={!enabled || !supported}>
            Тестовый отклик
          </Button>
          <span className="theme-surface-subtle inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] text-ios-subtext">
            <CheckCircle2 className="h-3.5 w-3.5 text-ios-accent" />
            Без вибрации на каждый tap и ввод
          </span>
        </div>

        {status ? (
          <p className="mt-3 text-xs leading-5 text-ios-subtext">{status}</p>
        ) : null}
      </section>
    </div>
  );
}
