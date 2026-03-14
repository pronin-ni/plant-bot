import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Droplets,
  Home,
  LoaderCircle,
  Lock,
  RotateCcw,
  Sprout,
  Sun,
  Thermometer
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getHomeAssistantRoomsAndSensors, saveHomeAssistantConfig } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import type { HaSensor } from '@/types/home-assistant';

const springTransition = {
  type: 'spring',
  stiffness: 360,
  damping: 28,
  mass: 1
} as const;

const cardClass =
  'rounded-ios-button border border-ios-border/60 bg-gradient-to-br from-white/82 via-white/74 to-white/62 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.07)] dark:border-emerald-500/20 dark:bg-gradient-to-br dark:from-zinc-900/72 dark:via-zinc-900/62 dark:to-zinc-900/52';

const HA_SETUP_STEPS = [
  'Откройте Home Assistant: Profile -> Long-Lived Access Tokens.',
  'Создайте новый token с понятным именем (например, Plant Bot).',
  'Скопируйте token сразу после создания.',
  'Укажите URL Home Assistant (локальный или внешний адрес).',
  'Вставьте token и нажмите «Проверить подключение».'
] as const;

const HA_SETUP_INSTRUCTION_TEXT = [
  'Инструкция подключения Home Assistant',
  ...HA_SETUP_STEPS.map((step, index) => `${index + 1}. ${step}`),
  '',
  'Важно: token хранится только для работы интеграции и не отображается в интерфейсе.'
].join('\n');

const HA_SELECTION_STORAGE_KEY = 'ha-selection-preferences';

export function HomeAssistantSetup() {
  type ConnectionState = 'idle' | 'loading' | 'success' | 'error';
  type SummaryState = {
    rooms: number;
    sensors: number;
    hasTemperature: boolean;
    hasHumidity: boolean;
    hasIlluminance: boolean;
    hasSoilMoisture: boolean;
  } | null;

  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedTemperatureSensorId, setSelectedTemperatureSensorId] = useState<string>('');
  const [selectedHumiditySensorId, setSelectedHumiditySensorId] = useState<string>('');
  const [selectedIlluminanceSensorId, setSelectedIlluminanceSensorId] = useState<string>('');
  const [selectedSoilMoistureSensorId, setSelectedSoilMoistureSensorId] = useState<string>('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const tokenInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  const normalizedUrl = useMemo(() => baseUrl.trim().replace(/\/+$/, ''), [baseUrl]);

  const canSubmit = useMemo(() => {
    return normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')
      ? token.trim().length >= 20
      : false;
  }, [normalizedUrl, token]);

  const connectMutation = useMutation({
    mutationFn: () => saveHomeAssistantConfig({
      baseUrl: normalizedUrl,
      token: token.trim()
    }),
    onMutate: () => {
      hapticImpact('light');
      setConnectionState('loading');
      setConnectionMessage('Проверяем подключение к Home Assistant...');
      setSummaryMessage(null);
      setSelectionMessage(null);
    },
    onSuccess: (response) => {
      hapticImpact('medium');
      hapticNotify('success');
      setConnectionState('success');
      setConnectionMessage(response.message || 'Подключение подтверждено. Home Assistant доступен.');
      setToken('');
      setCopyMessage(null);
      void queryClient.invalidateQueries({ queryKey: ['home-assistant-rooms-sensors-for-setup'] });
    },
    onError: (error) => {
      hapticNotify('error');
      const message = error instanceof Error ? error.message : 'Проверка не прошла. Проверьте URL и token.';
      setConnectionState('error');
      setConnectionMessage(message);
      setSelectionMessage(null);
    }
  });

  const roomsSensorsQuery = useQuery({
    queryKey: ['home-assistant-rooms-sensors-for-setup'],
    queryFn: getHomeAssistantRoomsAndSensors,
    enabled: connectionState === 'success'
  });

  const summaryState = useMemo<SummaryState>(() => {
    if (!roomsSensorsQuery.data?.connected) {
      return null;
    }
    const sensors = roomsSensorsQuery.data.sensors;
    const hasKind = (kind: string) => sensors.some((sensor) => sensor.kind === kind);
    return {
      rooms: roomsSensorsQuery.data.rooms.length,
      sensors: sensors.length,
      hasTemperature: hasKind('TEMPERATURE'),
      hasHumidity: hasKind('HUMIDITY'),
      hasIlluminance: hasKind('ILLUMINANCE'),
      hasSoilMoisture: hasKind('SOIL_MOISTURE')
    };
  }, [roomsSensorsQuery.data]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HA_SELECTION_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        roomId?: string;
        temperatureSensorId?: string;
        humiditySensorId?: string;
        illuminanceSensorId?: string;
        soilMoistureSensorId?: string;
      };
      setSelectedRoomId(parsed.roomId ?? '');
      setSelectedTemperatureSensorId(parsed.temperatureSensorId ?? '');
      setSelectedHumiditySensorId(parsed.humiditySensorId ?? '');
      setSelectedIlluminanceSensorId(parsed.illuminanceSensorId ?? '');
      setSelectedSoilMoistureSensorId(parsed.soilMoistureSensorId ?? '');
    } catch {
      window.localStorage.removeItem(HA_SELECTION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (connectionState !== 'success') {
      setSummaryMessage(null);
      return;
    }
    if (roomsSensorsQuery.isError) {
      setSummaryMessage('Подключение выполнено, но не удалось загрузить сводку комнат и датчиков.');
      return;
    }
    if (roomsSensorsQuery.data?.connected) {
      setSummaryMessage(null);
    }
  }, [connectionState, roomsSensorsQuery.data, roomsSensorsQuery.isError]);

  const sensorsByKind = useMemo(() => {
    const sensors = roomsSensorsQuery.data?.sensors ?? [];
    return {
      temperature: sensors.filter((sensor) => sensor.kind === 'TEMPERATURE'),
      humidity: sensors.filter((sensor) => sensor.kind === 'HUMIDITY'),
      illuminance: sensors.filter((sensor) => sensor.kind === 'ILLUMINANCE'),
      soilMoisture: sensors.filter((sensor) => sensor.kind === 'SOIL_MOISTURE')
    };
  }, [roomsSensorsQuery.data?.sensors]);

  const saveSelection = useCallback(() => {
    const payload = {
      roomId: selectedRoomId || undefined,
      temperatureSensorId: selectedTemperatureSensorId || undefined,
      humiditySensorId: selectedHumiditySensorId || undefined,
      illuminanceSensorId: selectedIlluminanceSensorId || undefined,
      soilMoistureSensorId: selectedSoilMoistureSensorId || undefined
    };
    window.localStorage.setItem(HA_SELECTION_STORAGE_KEY, JSON.stringify(payload));
    setSelectionMessage('Выбор сохранен.');
    hapticNotify('success');
  }, [
    selectedRoomId,
    selectedTemperatureSensorId,
    selectedHumiditySensorId,
    selectedIlluminanceSensorId,
    selectedSoilMoistureSensorId
  ]);

  const copyInstruction = async () => {
    try {
      await navigator.clipboard.writeText(HA_SETUP_INSTRUCTION_TEXT);
      hapticNotify('success');
      setCopyMessage('Инструкция скопирована');
    } catch {
      hapticNotify('error');
      setCopyMessage('Не удалось скопировать инструкцию');
    }
  };

  const scrollFieldIntoView = useCallback((element: HTMLInputElement | null) => {
    if (!element) {
      return;
    }
    window.setTimeout(() => {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }, 120);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springTransition}
      className="space-y-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
    >
      <section className={cardClass}>
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-ios-border/60 bg-white/80 text-ios-accent dark:bg-zinc-900/70">
          <Home className="h-4 w-4" />
        </div>
        <h3 className="mt-3 text-lg font-semibold text-ios-text">Home Assistant</h3>
        <p className="mt-1 text-sm text-ios-subtext">Подключите датчики и автоматизации для умного ухода.</p>
        <p className="mt-2 text-xs leading-5 text-ios-subtext">
          Plant Bot сможет учитывать реальную среду и давать более точные рекомендации.
        </p>
      </section>

      <section className={cardClass}>
        <p className="text-sm font-medium text-ios-text">Что даст подключение</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ios-subtext">
          <div className="flex items-center gap-2 rounded-xl border border-ios-border/55 bg-white/75 px-3 py-2 dark:bg-zinc-900/65">
            <Thermometer className="h-4 w-4 text-rose-500" />
            Температура
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-ios-border/55 bg-white/75 px-3 py-2 dark:bg-zinc-900/65">
            <Droplets className="h-4 w-4 text-sky-500" />
            Влажность
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-ios-border/55 bg-white/75 px-3 py-2 dark:bg-zinc-900/65">
            <Sun className="h-4 w-4 text-amber-500" />
            Освещённость
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-ios-border/55 bg-white/75 px-3 py-2 dark:bg-zinc-900/65">
            <Sprout className="h-4 w-4 text-emerald-500" />
            Влажность почвы
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <p className="text-sm font-medium text-ios-text">Безопасность и доступ</p>
        <p className="mt-1 text-xs leading-5 text-ios-subtext">
          Token нужен только для чтения данных Home Assistant и проверки подключения.
          В интерфейсе token не показывается, и вы можете отозвать его в любой момент в настройках Home Assistant.
        </p>
      </section>

      <section className={cardClass}>
        <p className="text-sm font-medium text-ios-text">Форма подключения</p>

        <label className="mt-3 block">
          <span className="mb-1 block text-ios-caption text-ios-subtext">URL</span>
          <input
            ref={urlInputRef}
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            onFocus={() => scrollFieldIntoView(urlInputRef.current)}
            placeholder="https://homeassistant.local:8123"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="url"
            inputMode="url"
            className="h-12 w-full rounded-ios-button border border-ios-border/70 bg-white/80 px-4 text-[16px] leading-6 text-ios-text outline-none backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-900/60"
          />
          <span className="mt-1.5 block text-[12px] leading-4 text-ios-subtext">
            Полный адрес Home Assistant, обязательно с `http://` или `https://`.
          </span>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-ios-caption text-ios-subtext">Long-Lived Access Token</span>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-subtext" />
            <input
              ref={tokenInputRef}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onFocus={() => scrollFieldIntoView(tokenInputRef.current)}
              type="password"
              placeholder="Вставьте long-lived token"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className="h-12 w-full rounded-ios-button border border-ios-border/70 bg-white/80 pl-10 pr-4 font-mono text-[16px] leading-6 text-ios-text outline-none backdrop-blur-ios dark:border-emerald-500/20 dark:bg-zinc-900/60"
            />
          </div>
          <span className="mt-1.5 block text-[12px] leading-4 text-ios-subtext">
            Токен не показывается в UI и нужен только для проверки и подключения.
          </span>
        </label>

        <Button
          className="mt-4 w-full active:scale-[0.99] transition-transform"
          disabled={!canSubmit || connectMutation.isPending}
          onClick={() => connectMutation.mutate()}
        >
          {connectMutation.isPending ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Проверка подключения...
            </span>
          ) : (
            'Проверить подключение'
          )}
        </Button>
        <span className="mt-1.5 block text-[12px] leading-4 text-ios-subtext">
          Кнопка станет активной, когда URL валиден и токен не короче 20 символов.
        </span>

        <AnimatePresence mode="wait" initial={false}>
          {connectionState === 'idle' ? (
            <motion.div
              key="state-idle"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-3 rounded-xl border border-ios-border/60 bg-white/70 px-3 py-2 text-[12px] leading-5 text-ios-subtext dark:bg-zinc-900/55"
            >
              Заполните URL и token, затем запустите проверку подключения.
            </motion.div>
          ) : null}

          {connectionState === 'loading' ? (
            <motion.div
              key="state-loading"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-3 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-[12px] leading-5 text-sky-700 dark:text-sky-200"
            >
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {connectionMessage ?? 'Выполняем проверку подключения...'}
              </span>
            </motion.div>
          ) : null}

          {connectionState === 'success' ? (
            <motion.div
              key="state-success"
              initial={{ opacity: 0, y: 6, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] leading-5 text-emerald-700 dark:text-emerald-300"
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {connectionMessage ?? 'Подключение успешно подтверждено.'}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {connectionState === 'success' ? (
          <div className="mt-3 rounded-xl border border-ios-border/60 bg-white/75 px-3 py-3 text-[12px] leading-5 text-ios-subtext dark:border-emerald-500/20 dark:bg-zinc-900/60">
            <p className="text-sm font-medium text-ios-text">Подключено успешно</p>
            {roomsSensorsQuery.isLoading || roomsSensorsQuery.isFetching ? (
              <p className="mt-1 inline-flex items-center gap-1.5">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Загружаем сводку комнат и датчиков...
              </p>
            ) : null}

            {summaryState ? (
              <>
                <div className="mt-2">
                  <p className="text-xs font-medium text-ios-text">Найдено:</p>
                  <ul className="mt-1 list-inside list-disc">
                    <li>{summaryState.rooms} комнат(ы)</li>
                    <li>{summaryState.sensors} датчиков</li>
                  </ul>
                </div>
                <div className="mt-2">
                  <p className="text-xs font-medium text-ios-text">Доступные типы:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {summaryState.hasTemperature ? <li>температура</li> : null}
                    {summaryState.hasHumidity ? <li>влажность</li> : null}
                    {summaryState.hasIlluminance ? <li>освещённость</li> : null}
                    {summaryState.hasSoilMoisture ? <li>влажность почвы</li> : null}
                    {!summaryState.hasTemperature && !summaryState.hasHumidity && !summaryState.hasIlluminance && !summaryState.hasSoilMoisture ? (
                      <li>типы датчиков пока не определены</li>
                    ) : null}
                  </ul>
                </div>
              </>
            ) : null}

            {summaryMessage ? (
              <p className="mt-2 text-amber-700 dark:text-amber-200">{summaryMessage}</p>
            ) : null}
          </div>
        ) : null}

        {connectionState === 'success' ? (
          <div className="mt-3 rounded-xl border border-ios-border/60 bg-white/75 px-3 py-3 text-[12px] leading-5 text-ios-subtext dark:border-emerald-500/20 dark:bg-zinc-900/60">
            <p className="text-sm font-medium text-ios-text">Выбор комнат и датчиков</p>
            <p className="mt-1">
              Выберите, какие данные Home Assistant использовать в Plant Bot.
            </p>

            {!roomsSensorsQuery.data?.connected ? (
              <p className="mt-2 text-amber-700 dark:text-amber-200">
                {roomsSensorsQuery.data?.message ?? 'Home Assistant не подключен.'}
              </p>
            ) : null}

            {roomsSensorsQuery.isLoading ? (
              <p className="mt-2 inline-flex items-center gap-1.5">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Загружаем комнаты и датчики...
              </p>
            ) : null}

            {roomsSensorsQuery.isError ? (
              <p className="mt-2 text-amber-700 dark:text-amber-200">
                Не удалось загрузить список комнат и датчиков.
              </p>
            ) : null}

            {roomsSensorsQuery.data?.connected ? (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-ios-caption text-ios-subtext">Комната</span>
                  <select
                    value={selectedRoomId}
                    onChange={(event) => setSelectedRoomId(event.target.value)}
                    className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/80 px-3 text-[16px] text-ios-text outline-none dark:border-emerald-500/20 dark:bg-zinc-900/60"
                  >
                    <option value="">Не выбрано</option>
                    {roomsSensorsQuery.data.rooms.map((room) => (
                      <option key={room.id} value={room.id}>{room.name}</option>
                    ))}
                  </select>
                  {roomsSensorsQuery.data.rooms.length === 0 ? (
                    <span className="mt-1 block text-[12px] text-ios-subtext">Комнаты не найдены.</span>
                  ) : null}
                </label>

                <SensorSelect
                  label="Температура"
                  value={selectedTemperatureSensorId}
                  onChange={setSelectedTemperatureSensorId}
                  options={sensorsByKind.temperature}
                />
                <SensorSelect
                  label="Влажность"
                  value={selectedHumiditySensorId}
                  onChange={setSelectedHumiditySensorId}
                  options={sensorsByKind.humidity}
                />
                <SensorSelect
                  label="Освещённость"
                  value={selectedIlluminanceSensorId}
                  onChange={setSelectedIlluminanceSensorId}
                  options={sensorsByKind.illuminance}
                />
                <SensorSelect
                  label="Влажность почвы"
                  value={selectedSoilMoistureSensorId}
                  onChange={setSelectedSoilMoistureSensorId}
                  options={sensorsByKind.soilMoisture}
                />

                <Button className="w-full active:scale-[0.99] transition-transform" onClick={saveSelection}>
                  Сохранить выбор
                </Button>
                {selectionMessage ? (
                  <p className="text-[12px] text-emerald-700 dark:text-emerald-300">{selectionMessage}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {connectionState === 'error' ? (
          <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-800 dark:text-amber-200">
            <div className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              {connectionMessage ?? 'Не удалось подключиться. Проверьте URL, token и доступность Home Assistant.'}
            </div>
            <Button
              variant="secondary"
              className="mt-2 w-full active:scale-[0.99] transition-transform"
              disabled={!canSubmit || connectMutation.isPending}
              onClick={() => connectMutation.mutate()}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Повторить проверку
            </Button>
          </div>
        ) : null}
      </section>

      <section className={`${cardClass} overflow-hidden p-0`}>
        <button
          type="button"
          onClick={() => setIsHelpOpen((prev) => !prev)}
          className="android-ripple flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:scale-[0.995] transition-transform"
        >
          <span className="text-sm font-medium text-ios-text">Как получить token в Home Assistant</span>
          <ChevronDown className={`h-4 w-4 text-ios-subtext transition-transform ${isHelpOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence initial={false}>
          {isHelpOpen ? (
            <motion.div
              key="help-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.85 }}
              className="overflow-hidden border-t border-ios-border/55 dark:border-emerald-500/15"
            >
              <div className="px-4 pb-4 pt-3">
            <div className="space-y-2 text-xs leading-5 text-ios-subtext">
              {HA_SETUP_STEPS.map((step, index) => (
                <div key={step} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ios-border/60 bg-white/80 text-[11px] font-semibold text-ios-accent dark:bg-zinc-900/70">
                    {index + 1}
                  </span>
                  <p>{step}</p>
                </div>
              ))}
            </div>

            <Button variant="secondary" className="mt-3 w-full active:scale-[0.99] transition-transform" onClick={copyInstruction}>
              <ClipboardCopy className="mr-1.5 h-4 w-4" />
              Скопировать шаги подключения
            </Button>
            {copyMessage ? (
              <p className="mt-2 text-[12px] leading-4 text-ios-subtext">{copyMessage}</p>
            ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </motion.div>
  );
}

function SensorSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: HaSensor[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-ios-caption text-ios-subtext">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/80 px-3 text-[16px] text-ios-text outline-none dark:border-emerald-500/20 dark:bg-zinc-900/60"
      >
        <option value="">Не выбрано</option>
        {options.map((sensor) => (
          <option key={sensor.entityId} value={sensor.entityId}>
            {sensor.friendlyName} ({sensor.entityId})
          </option>
        ))}
      </select>
      {options.length === 0 ? (
        <span className="mt-1 block text-[12px] text-ios-subtext">Датчики этого типа не найдены.</span>
      ) : null}
    </label>
  );
}
