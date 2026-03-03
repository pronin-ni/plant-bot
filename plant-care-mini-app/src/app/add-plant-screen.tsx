import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createPlant, searchPlants } from '@/lib/api';
import { hapticImpact, hapticNotify } from '@/lib/telegram';

type Placement = 'INDOOR' | 'OUTDOOR';
type PlantType = 'DEFAULT' | 'TROPICAL' | 'FERN' | 'SUCCULENT' | 'CONIFER';
type OutdoorSoilType = 'SANDY' | 'LOAMY' | 'CLAY';
type SunExposure = 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE';

type StepKey =
  | 'name'
  | 'placement'
  | 'indoor'
  | 'outdoor'
  | 'type'
  | 'summary';

export function AddPlantScreen() {
  const queryClient = useQueryClient();

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
    onSuccess: () => {
      hapticNotify('success');
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['plants'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
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

  const canSubmit =
    name.trim().length > 1
    && Number(baseIntervalDays) > 0
    && (placement === 'OUTDOOR' ? Number(outdoorAreaM2) > 0 : Number(potVolumeLiters) > 0);

  const onNext = () => {
    hapticImpact('light');
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const onPrev = () => {
    hapticImpact('light');
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <section className="space-y-3">
      <div className="ios-blur-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-ios-caption text-ios-subtext">Шаг {stepIndex + 1} из {steps.length}</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-ios-button border border-ios-border/60 p-2"
              onClick={onPrev}
              disabled={stepIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-ios-button border border-ios-border/60 p-2"
              onClick={onNext}
              disabled={stepIndex === steps.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 22 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 1 }}
          className="space-y-4"
        >
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
            <div>
              <label className="mb-2 block text-ios-caption text-ios-subtext">Размещение</label>
              <div className="grid grid-cols-2 gap-2">
                <ToggleButton active={placement === 'INDOOR'} onClick={() => setPlacement('INDOOR')} label="Домашнее" />
                <ToggleButton active={placement === 'OUTDOOR'} onClick={() => setPlacement('OUTDOOR')} label="Уличное" />
              </div>
            </div>
          ) : null}

          {currentStep === 'indoor' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Объём горшка (л)">
                <input
                  value={potVolumeLiters}
                  onChange={(event) => setPotVolumeLiters(event.target.value)}
                  type="number"
                  step="0.1"
                  className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/70 px-4 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
                />
              </Field>
              <Field label="Интервал (дни)">
                <input
                  value={baseIntervalDays}
                  onChange={(event) => setBaseIntervalDays(event.target.value)}
                  type="number"
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
                <Field label="Интервал (дни)">
                  <input
                    value={baseIntervalDays}
                    onChange={(event) => setBaseIntervalDays(event.target.value)}
                    type="number"
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
          ) : null}

          {currentStep === 'summary' ? (
            <div className="space-y-2 text-ios-body">
              <p><b>Название:</b> {name || '—'}</p>
              <p><b>Размещение:</b> {placement === 'OUTDOOR' ? 'Уличное' : 'Домашнее'}</p>
              <p><b>Интервал:</b> {baseIntervalDays} дн.</p>
              {placement === 'OUTDOOR' ? (
                <>
                  <p><b>Площадь:</b> {outdoorAreaM2} м²</p>
                  <p><b>Почва:</b> {outdoorSoilType}</p>
                  <p><b>Солнце:</b> {sunExposure}</p>
                </>
              ) : (
                <p><b>Горшок:</b> {potVolumeLiters} л</p>
              )}
              <p><b>Тип:</b> {type}</p>
            </div>
          ) : null}
        </motion.div>
      </div>

      <Button
        className="h-12 w-full"
        disabled={!canSubmit || createMutation.isPending}
        onClick={() => {
          hapticImpact('medium');
          createMutation.mutate();
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        {createMutation.isPending ? 'Добавляем...' : 'Добавить растение'}
      </Button>
    </section>
  );

  function resetForm() {
    setName('');
    setPotVolumeLiters('2');
    setBaseIntervalDays('7');
    setPlacement('INDOOR');
    setType('DEFAULT');
    setOutdoorAreaM2('3');
    setOutdoorSoilType('LOAMY');
    setSunExposure('PARTIAL_SHADE');
    setMulched(false);
    setPerennial(true);
    setWinterDormancyEnabled(true);
    setSearchHint([]);
    setStepIndex(0);
  }
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
