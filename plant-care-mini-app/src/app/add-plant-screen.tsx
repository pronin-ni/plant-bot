import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { RoomAndSensorSelector } from '@/components/RoomAndSensorSelector';
import { PlantPhotoCapture } from '@/app/AddPlant/PlantPhotoCapture';
import { createPlant, searchPlants, suggestPlantProfile } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';
import { useUiStore } from '@/lib/store';
import type { OpenRouterIdentifyResult } from '@/types/api';

type Placement = 'INDOOR' | 'OUTDOOR';
type PlantType = 'DEFAULT' | 'TROPICAL' | 'FERN' | 'SUCCULENT' | 'CONIFER';
type OutdoorSoilType = 'SANDY' | 'LOAMY' | 'CLAY';
type SunExposure = 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE';

type StepKey = 'name' | 'placement' | 'indoor' | 'outdoor' | 'type' | 'summary';

const STEP_META: Record<StepKey, { title: string; hint: string }> = {
  name: { title: 'Шаг 1. Название растения', hint: 'Введите вручную или используйте AI по фото.' },
  placement: { title: 'Шаг 2. Размещение', hint: 'Выберите: домашнее или уличное растение.' },
  indoor: { title: 'Шаг 3. Параметры домашнего', hint: 'Укажите объём горшка. Интервал и тип подберём автоматически.' },
  outdoor: { title: 'Шаг 3. Параметры уличного', hint: 'Укажите площадь, почву, свет и сезонность.' },
  type: { title: 'Шаг 4. Проверка параметров', hint: 'Покажем, что определили автоматически.' },
  summary: { title: 'Шаг 5. Подтверждение', hint: 'Проверьте данные и сохраните растение.' }
};

const TYPE_LABELS: Record<PlantType, string> = {
  DEFAULT: 'Обычное',
  TROPICAL: 'Тропическое',
  FERN: 'Папоротник',
  SUCCULENT: 'Суккулент',
  CONIFER: 'Хвойное'
};

export function AddPlantScreen() {
  const queryClient = useQueryClient();
  const openPlantDetail = useUiStore((s) => s.openPlantDetail);
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  const [name, setName] = useState('');
  const [potVolumeLiters, setPotVolumeLiters] = useState('2');
  const [baseIntervalDays, setBaseIntervalDays] = useState('7');
  const [placement, setPlacement] = useState<Placement>('INDOOR');
  const [type, setType] = useState<PlantType>('DEFAULT');

  const [outdoorAreaM2, setOutdoorAreaM2] = useState('3');
  const [outdoorSoilType, setOutdoorSoilType] = useState<OutdoorSoilType>('LOAMY');
  const [sunExposure, setSunExposure] = useState<SunExposure>('PARTIAL_SHADE');
  const [mulched, setMulched] = useState<boolean>(false);
  const [perennial, setPerennial] = useState<boolean>(true);
  const [winterDormancyEnabled, setWinterDormancyEnabled] = useState<boolean>(true);

  const [searchHint, setSearchHint] = useState<string[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [createdPlantId, setCreatedPlantId] = useState<number | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [identifiedName, setIdentifiedName] = useState<string | null>(null);
  const [profileSource, setProfileSource] = useState<string | null>(null);
  const [manualProfileEdit, setManualProfileEdit] = useState(false);

  const steps = useMemo<StepKey[]>(() => {
    return placement === 'OUTDOOR'
      ? ['name', 'placement', 'outdoor', 'type', 'summary']
      : ['name', 'placement', 'indoor', 'type', 'summary'];
  }, [placement]);

  const currentStep = steps[stepIndex] ?? 'name';

  const createMutation = useMutation({
    mutationFn: () =>
      createPlant({
        name: name.trim(),
        potVolumeLiters: placement === 'INDOOR' ? Number(potVolumeLiters) : 1,
        baseIntervalDays: Number(baseIntervalDays),
        placement,
        type,
        outdoorAreaM2: placement === 'OUTDOOR' ? Number(outdoorAreaM2) : null,
        outdoorSoilType: placement === 'OUTDOOR' ? outdoorSoilType : null,
        sunExposure: placement === 'OUTDOOR' ? sunExposure : null,
        mulched: placement === 'OUTDOOR' ? mulched : null,
        perennial: placement === 'OUTDOOR' ? perennial : null,
        winterDormancyEnabled: placement === 'OUTDOOR' ? winterDormancyEnabled : null
      }),
    onSuccess: (createdPlant) => {
      hapticNotify('success');
      setCreatedPlantId(createdPlant.id);
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setActiveTab('home');
      openPlantDetail(createdPlant.id);
    },
    onError: () => {
      hapticNotify('error');
    }
  });

  const searchMutation = useMutation({
    mutationFn: (q: string) => searchPlants(q),
    onSuccess: (data) => {
      setSearchHint(data.slice(0, 4).map((plant) => plant.name));
    }
  });

  const suggestProfileMutation = useMutation({
    mutationFn: (plantName: string) => suggestPlantProfile(plantName),
    onSuccess: (suggested) => {
      if (suggested.intervalDays > 0) {
        setBaseIntervalDays(String(suggested.intervalDays));
      }
      if (suggested.type && ['DEFAULT', 'TROPICAL', 'FERN', 'SUCCULENT', 'CONIFER'].includes(suggested.type)) {
        setType(suggested.type as PlantType);
      }
      setProfileSource(suggested.source ?? null);
    }
  });

  const canSubmit =
    name.trim().length > 1
    && Number(baseIntervalDays) > 0
    && (placement === 'OUTDOOR' ? Number(outdoorAreaM2) > 0 : Number(potVolumeLiters) > 0);

  const canGoNext = (() => {
    if (currentStep === 'name') {
      return name.trim().length > 1;
    }
    if (currentStep === 'indoor') {
      return Number(potVolumeLiters) > 0 && Number(baseIntervalDays) > 0;
    }
    if (currentStep === 'outdoor') {
      return Number(outdoorAreaM2) > 0;
    }
    return true;
  })();

  const onNext = () => {
    hapticImpact('light');
    if (currentStep === 'name' && name.trim().length > 1 && !suggestProfileMutation.isPending) {
      suggestProfileMutation.mutate(name.trim());
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const onPrev = () => {
    hapticImpact('light');
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const applyIdentify = (result: OpenRouterIdentifyResult) => {
    if (result.russianName && result.russianName.trim()) {
      const russian = result.russianName.trim();
      setName(russian);
      setIdentifiedName(russian);
    }
    if (result.wateringIntervalDays > 0) {
      setBaseIntervalDays(String(result.wateringIntervalDays));
    }
    if (result.russianName && !suggestProfileMutation.isPending) {
      suggestProfileMutation.mutate(result.russianName);
    }
    const latin = result.latinName ? ` (${result.latinName})` : '';
    if (result.confidence < 60) {
      setAiHint(`Низкая уверенность (${result.confidence}%). Проверьте вручную.${latin}`);
      return;
    }
    setAiHint(`Определено: ${result.russianName ?? 'без названия'}${latin}, уверенность ${result.confidence}%`);
  };

  return (
    <section className="space-y-3">
      <PlantPhotoCapture onIdentified={applyIdentify} />
      {aiHint ? <p className="text-xs text-ios-subtext">{aiHint}</p> : null}

      {identifiedName && currentStep === 'name' ? (
        <div className="ios-blur-card p-3">
          <p className="text-sm text-ios-subtext">AI определил: <b>{identifiedName}</b></p>
          <Button
            className="mt-2 w-full"
            onClick={() => {
              hapticImpact('medium');
              onNext();
            }}
          >
            <Check className="mr-2 h-4 w-4" />
            Да, продолжить
          </Button>
        </div>
      ) : null}

      <div className="ios-blur-card p-4">
        <p className="text-ios-caption text-ios-subtext">Шаг {stepIndex + 1} из {steps.length}</p>
        <h3 className="mt-1 text-ios-title-2">{STEP_META[currentStep].title}</h3>
        <p className="mt-1 text-ios-caption text-ios-subtext">{STEP_META[currentStep].hint}</p>

        <div className="mt-4 space-y-4">
          {currentStep === 'name' ? (
            <div>
              <label className="mb-1 block text-ios-caption text-ios-subtext">Название растения</label>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Например, Фикус"
                  className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-11 px-3"
                  onClick={() => {
                    hapticImpact('light');
                    if (name.trim().length > 1) {
                      searchMutation.mutate(name.trim());
                    }
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {searchHint.length ? (
                <p className="mt-2 text-ios-caption text-ios-subtext">Похожие: {searchHint.join(', ')}</p>
              ) : null}
            </div>
          ) : null}

          {currentStep === 'placement' ? (
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton active={placement === 'INDOOR'} onClick={() => setPlacement('INDOOR')} label="Домашнее" />
              <ToggleButton active={placement === 'OUTDOOR'} onClick={() => setPlacement('OUTDOOR')} label="Уличное" />
            </div>
          ) : null}

          {currentStep === 'indoor' ? (
            <div className="grid grid-cols-1 gap-3">
              <Field label="Объём горшка (л)">
                <input
                  value={potVolumeLiters}
                  onChange={(event) => setPotVolumeLiters(event.target.value)}
                  type="number"
                  step="0.1"
                  className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
                />
              </Field>
            </div>
          ) : null}

          {currentStep === 'outdoor' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Площадь (м²)">
                  <input
                    value={outdoorAreaM2}
                    onChange={(event) => setOutdoorAreaM2(event.target.value)}
                    type="number"
                    step="0.1"
                    className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
                  />
                </Field>
              </div>

              <Field label="Тип почвы">
                <SelectGroup
                  value={outdoorSoilType}
                  onChange={(value) => setOutdoorSoilType(value as OutdoorSoilType)}
                  options={[
                    { value: 'SANDY', label: 'Песчаная' },
                    { value: 'LOAMY', label: 'Суглинистая' },
                    { value: 'CLAY', label: 'Глинистая' }
                  ]}
                />
              </Field>

              <Field label="Освещённость">
                <SelectGroup
                  value={sunExposure}
                  onChange={(value) => setSunExposure(value as SunExposure)}
                  options={[
                    { value: 'FULL_SUN', label: 'Полное солнце' },
                    { value: 'PARTIAL_SHADE', label: 'Полутень' },
                    { value: 'SHADE', label: 'Тень' }
                  ]}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <ToggleButton active={mulched} onClick={() => setMulched((v) => !v)} label={`Мульча: ${mulched ? 'Да' : 'Нет'}`} />
                <ToggleButton active={perennial} onClick={() => setPerennial((v) => !v)} label={`Многолетнее: ${perennial ? 'Да' : 'Нет'}`} />
              </div>

              {perennial ? (
                <ToggleButton
                  active={winterDormancyEnabled}
                  onClick={() => setWinterDormancyEnabled((v) => !v)}
                  label={`Зимняя пауза: ${winterDormancyEnabled ? 'Да' : 'Нет'}`}
                />
              ) : null}
            </div>
          ) : null}

          {currentStep === 'type' ? (
            <div className="space-y-3">
              <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:bg-zinc-900/50">
                <p><b>Определённый интервал:</b> {baseIntervalDays} дн.</p>
                <p><b>Определённый тип:</b> {TYPE_LABELS[type]}</p>
                <p className="mt-1 text-xs text-ios-subtext">Источник: {profileSource ?? 'AI/эвристика'}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setManualProfileEdit(false)}>Принять</Button>
                <Button variant="secondary" onClick={() => setManualProfileEdit(true)}>Редактировать</Button>
              </div>
              {manualProfileEdit ? (
                <div className="space-y-3">
                  <Field label="Интервал (дни)">
                    <input
                      value={baseIntervalDays}
                      onChange={(event) => setBaseIntervalDays(event.target.value)}
                      type="number"
                      className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
                    />
                  </Field>
                  <Field label="Тип растения">
                    <SelectGroup
                      value={type}
                      onChange={(value) => setType(value as PlantType)}
                      options={[
                        { value: 'DEFAULT', label: 'Обычное' },
                        { value: 'TROPICAL', label: 'Тропическое' },
                        { value: 'FERN', label: 'Папоротник' },
                        { value: 'SUCCULENT', label: 'Суккулент' },
                        { value: 'CONIFER', label: 'Хвойное' }
                      ]}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStep === 'summary' ? (
            <div className="space-y-2 text-ios-body">
              <p><b>Название:</b> {name || '—'}</p>
              <p><b>Размещение:</b> {placement === 'OUTDOOR' ? 'Уличное' : 'Домашнее'}</p>
              <p><b>Интервал:</b> {baseIntervalDays} дн.</p>
              {placement === 'OUTDOOR' ? (
                <>
                  <p><b>Площадь:</b> {outdoorAreaM2} м²</p>
                  <p><b>Почва:</b> {outdoorSoilType === 'SANDY' ? 'Песчаная' : outdoorSoilType === 'LOAMY' ? 'Суглинистая' : 'Глинистая'}</p>
                  <p><b>Солнце:</b> {sunExposure === 'FULL_SUN' ? 'Полное солнце' : sunExposure === 'PARTIAL_SHADE' ? 'Полутень' : 'Тень'}</p>
                </>
              ) : (
                <p><b>Горшок:</b> {potVolumeLiters} л</p>
              )}
              <p><b>Тип:</b> {TYPE_LABELS[type]}</p>
              {createdPlantId ? (
                <div className="pt-2">
                  <RoomAndSensorSelector plantId={createdPlantId} compact />
                </div>
              ) : (
                <p className="text-[12px] text-ios-subtext">После сохранения появится блок привязки комнаты и сенсоров Home Assistant.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="w-1/2" onClick={onPrev} disabled={stepIndex === 0}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Назад
          </Button>
          {currentStep !== 'summary' ? (
            <Button className="w-1/2" onClick={onNext} disabled={!canGoNext}>
              Далее
            </Button>
          ) : (
            <Button
              className="w-1/2"
              disabled={!canSubmit || createMutation.isPending}
              onClick={() => {
                hapticImpact('medium');
                createMutation.mutate();
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {createMutation.isPending ? 'Добавляем...' : 'Добавить и открыть карточку'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-ios-caption text-ios-subtext">{label}</label>
      {children}
    </div>
  );
}

function SelectGroup({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map((option) => (
        <ToggleButton
          key={option.value}
          active={value === option.value}
          onClick={() => onChange(option.value)}
          label={option.label}
        />
      ))}
    </div>
  );
}

function ToggleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-ios-button border text-ios-body transition-colors ${
        active
          ? 'border-ios-accent bg-ios-accent/15 text-ios-accent'
          : 'border-ios-border/70 bg-white/60 text-ios-text dark:bg-zinc-900/50'
      }`}
    >
      {label}
    </button>
  );
}
