import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Loader2, Search, Sparkles } from 'lucide-react';

import { PlantPhotoCapture } from '@/app/AddPlant/PlantPhotoCapture';
import { AIRecommendationForm } from '@/components/AIRecommendationForm';
import { PlantCategorySelector } from '@/components/PlantCategorySelector';
import { Plant3DPreview } from '@/components/adaptive/Plant3DPreview';
import { Button } from '@/components/ui/button';
import {
  aiRecommendPlant,
  createPlant,
  getPwaPushPublicKey,
  getPwaPushStatus,
  searchPlantPresets,
  searchPlants,
  subscribePwaPush,
  suggestPlantProfile
} from '@/lib/api';
import { ensurePushSubscription } from '@/lib/pwa';
import { hapticImpact, hapticNotify, hapticSelectionChanged } from '@/lib/telegram';
import { useAuthStore, useUiStore } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { OpenRouterIdentifyResult, PlantDto, PlantPresetSuggestionDto } from '@/types/api';
import type { PlantCategory } from '@/types/plant';

type StepKey = 'category' | 'search' | 'size' | 'confirm';
type PlantType = 'DEFAULT' | 'TROPICAL' | 'FERN' | 'SUCCULENT' | 'CONIFER';

const STEP_TITLES: Record<StepKey, string> = {
  category: 'Категория',
  search: 'Название и AI',
  size: 'Размер',
  confirm: 'Проверка'
};

const TYPE_LABELS: Record<PlantType, string> = {
  DEFAULT: 'Обычное',
  TROPICAL: 'Тропическое',
  FERN: 'Папоротник',
  SUCCULENT: 'Суккулент',
  CONIFER: 'Хвойное'
};

const CATEGORY_LABELS: Record<PlantCategory, string> = {
  HOME: 'Домашние',
  OUTDOOR_DECORATIVE: 'Декоративные уличные',
  OUTDOOR_GARDEN: 'Садовые'
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isGardenCategory(category: PlantCategory) {
  return category === 'OUTDOOR_GARDEN';
}

function placementByCategory(category: PlantCategory): 'INDOOR' | 'OUTDOOR' {
  return category === 'HOME' ? 'INDOOR' : 'OUTDOOR';
}

function estimateDefaultVolumeMl(category: PlantCategory, potLiters: string, heightCm: string) {
  if (category === 'OUTDOOR_GARDEN') {
    const h = Number(heightCm) || 40;
    return clamp(Math.round(h * 10), 400, 4000);
  }
  const liters = Number(potLiters) || 2;
  return clamp(Math.round(liters * 130), 120, 2500);
}

export function WizardAddPlant() {
  const queryClient = useQueryClient();
  const openPlantDetail = useUiStore((s) => s.openPlantDetail);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const telegramUserId = useAuthStore((s) => s.telegramUserId);

  const [stepIndex, setStepIndex] = useState(0);
  const [category, setCategory] = useState<PlantCategory>('HOME');
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [presets, setPresets] = useState<PlantPresetSuggestionDto[]>([]);
  const [hints, setHints] = useState<string[]>([]);
  const [lastSearchHadResults, setLastSearchHadResults] = useState(true);
  const [highlightResults, setHighlightResults] = useState(false);
  const [autoPickFirstResult, setAutoPickFirstResult] = useState(true);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const [sizePotLiters, setSizePotLiters] = useState('2');
  const [sizeHeightCm, setSizeHeightCm] = useState('45');
  const [sizeDiameterCm, setSizeDiameterCm] = useState('35');

  const [baseIntervalDays, setBaseIntervalDays] = useState('7');
  const [type, setType] = useState<PlantType>('DEFAULT');
  const [profileSource, setProfileSource] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState<string | null>(null);

  const [manualMode, setManualMode] = useState(false);
  const [waterVolumeMl, setWaterVolumeMl] = useState<number>(260);
  const [aiIntervalDays, setAiIntervalDays] = useState<number | null>(null);
  const [aiWaterVolumeMl, setAiWaterVolumeMl] = useState<number | null>(null);
  const [aiLight, setAiLight] = useState<string | null>(null);
  const [aiSoil, setAiSoil] = useState<string | null>(null);
  const [aiNotes, setAiNotes] = useState<string | null>(null);

  const steps = useMemo<StepKey[]>(() => ['category', 'search', 'size', 'confirm'], []);
  const currentStep = steps[stepIndex] ?? 'category';

  const intervalDaysNumber = clamp(Number(baseIntervalDays) || 7, 1, 60);

  useEffect(() => {
    setWaterVolumeMl(estimateDefaultVolumeMl(category, sizePotLiters, sizeHeightCm));
  }, [category, sizePotLiters, sizeHeightCm]);

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

  const searchMutation = useMutation({
    mutationFn: async ({
      q,
      currentCategory,
      source
    }: {
      q: string;
      currentCategory: PlantCategory;
      source: 'auto' | 'button';
    }) => {
      const [localPlants, presetItems] = await Promise.all([
        searchPlants(q, currentCategory),
        searchPlantPresets(currentCategory, q, 12)
      ]);
      return { localPlants, presetItems, source, q };
    },
    onSuccess: ({ localPlants, presetItems, source, q }) => {
      const merged = new Set<string>();
      localPlants.forEach((item) => merged.add(item.name));
      presetItems.forEach((item) => merged.add(item.name));
      const mergedList = Array.from(merged);
      setHints(mergedList.slice(0, 8));
      setPresets(presetItems);
      setLastSearchHadResults(mergedList.length > 0 || presetItems.length > 0);

      if (
        source === 'button' &&
        autoPickFirstResult &&
        mergedList.length > 0 &&
        (!name.trim() || !mergedList.includes(name.trim()))
      ) {
        setName(mergedList[0]);
        setSearchQuery(mergedList[0]);
      }

      if (source === 'button' && q.trim()) {
        setHighlightResults(true);
        window.setTimeout(() => setHighlightResults(false), 900);
        requestAnimationFrame(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    }
  });

  const aiRecommendMutation = useMutation({
    mutationFn: () => aiRecommendPlant({
      name: name.trim(),
      category,
      potVolumeLiters: !isGardenCategory(category) ? Number(sizePotLiters) : undefined,
      heightCm: isGardenCategory(category) ? Number(sizeHeightCm) : undefined,
      diameterCm: isGardenCategory(category) ? Number(sizeDiameterCm) : undefined
    }),
    onSuccess: (result) => {
      const nextInterval = clamp(result.wateringFrequencyDays || 7, 1, 60);
      const nextVolume = clamp(result.wateringVolumeMl || waterVolumeMl, 50, 10_000);
      setAiIntervalDays(nextInterval);
      setAiWaterVolumeMl(nextVolume);
      setBaseIntervalDays(String(nextInterval));
      setWaterVolumeMl(nextVolume);
      setAiLight(result.light ?? null);
      setAiSoil(result.soil ?? null);
      setAiNotes(result.notes ?? null);
      setProfileSource(result.source ?? null);
      setManualMode(false);
      hapticImpact('heavy');
      hapticNotify('success');
    },
    onError: () => hapticNotify('error')
  });


  const maybeEnablePushOnFirstPlant = async (hadPlantsBeforeCreate: boolean) => {
    if (hadPlantsBeforeCreate) {
      return;
    }

    const promptKey = `plantbot.push.prompted.${telegramUserId ?? 'anonymous'}`;
    if (localStorage.getItem(promptKey) === '1') {
      return;
    }

    try {
      const keyData = await getPwaPushPublicKey();
      if (!keyData.enabled || !keyData.publicKey) {
        return;
      }

      const status = await getPwaPushStatus();
      if (status.subscribed) {
        localStorage.setItem(promptKey, '1');
        return;
      }

      const subscription = await ensurePushSubscription(keyData.publicKey);
      if (!subscription) {
        return;
      }

      await subscribePwaPush(subscription.toJSON());
      localStorage.setItem(promptKey, '1');
      hapticNotify('success');
    } catch {
      // Ничего не делаем: пользователь может включить push вручную в Настройках.
    }
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const placement = placementByCategory(category);
      const isGarden = isGardenCategory(category);
      const diameterMeters = Number(sizeDiameterCm) / 100;
      const derivedArea = Number.isFinite(diameterMeters) && diameterMeters > 0
        ? Math.PI * Math.pow(diameterMeters / 2, 2)
        : null;

      return createPlant({
        name: name.trim(),
        category,
        placement,
        type,
        baseIntervalDays: intervalDaysNumber,
        preferredWaterMl: Math.max(50, Math.min(10_000, waterVolumeMl)),
        potVolumeLiters: placement === 'INDOOR' || category === 'OUTDOOR_DECORATIVE'
          ? Math.max(0.2, Number(sizePotLiters) || 2)
          : 1,
        outdoorAreaM2: isGarden ? derivedArea : null,
        outdoorSoilType: placement === 'OUTDOOR' ? 'LOAMY' : null,
        sunExposure: placement === 'OUTDOOR' ? 'PARTIAL_SHADE' : null,
        mulched: placement === 'OUTDOOR' ? false : null,
        perennial: placement === 'OUTDOOR' ? !isGarden : null,
        winterDormancyEnabled: placement === 'OUTDOOR' ? !isGarden : null
      });
    },
    onSuccess: async (createdPlant) => {
      const hadPlantsBeforeCreate = ((queryClient.getQueryData(['plants']) as PlantDto[] | undefined) ?? []).length > 0;

      hapticImpact('heavy');
      hapticNotify('success');
      await queryClient.invalidateQueries({ queryKey: ['plants'] });
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void maybeEnablePushOnFirstPlant(hadPlantsBeforeCreate);
      setActiveTab('home');
      openPlantDetail(createdPlant.id);
    },
    onError: () => hapticNotify('error')
  });

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      searchMutation.mutate({ q: '', currentCategory: category, source: 'auto' });
      setHints([]);
      setPresets([]);
      setLastSearchHadResults(true);
      return;
    }

    const timer = window.setTimeout(() => {
      searchMutation.mutate({ q, currentCategory: category, source: 'auto' });
    }, 260);

    return () => window.clearTimeout(timer);
  }, [searchQuery, category]);

  const applyIdentify = (result: OpenRouterIdentifyResult) => {
    if (result.russianName?.trim()) {
      const resolved = result.russianName.trim();
      setName(resolved);
      setSearchQuery(resolved);
      if (!suggestProfileMutation.isPending) {
        suggestProfileMutation.mutate(resolved);
      }
    }

    if (result.wateringIntervalDays > 0) {
      setBaseIntervalDays(String(result.wateringIntervalDays));
    }

    if (result.confidence < 60) {
      setAiHint(`AI определил неуверенно (${result.confidence}%). Проверьте название вручную.`);
    } else {
      hapticImpact('medium');
      setAiHint(`AI: ${result.russianName ?? 'название не найдено'} (${result.confidence}%)`);
    }
  };

  const canGoNext = (() => {
    if (currentStep === 'category') return true;
    if (currentStep === 'search') return name.trim().length > 1;
    if (currentStep === 'size') {
      return isGardenCategory(category)
        ? Number(sizeHeightCm) > 0 && Number(sizeDiameterCm) > 0
        : Number(sizePotLiters) > 0;
    }
    return true;
  })();

  const progress = ((stepIndex + 1) / steps.length) * 100;

  return (
    <section className="space-y-4">
      <div className="ios-blur-card p-4">
        <p className="text-ios-caption text-ios-subtext">Шаг {stepIndex + 1} из {steps.length}</p>
        <h2 className="mt-1 text-ios-title-2">Добавление растения</h2>
        <p className="text-ios-caption text-ios-subtext">{STEP_TITLES[currentStep]}</p>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ios-border/40">
          <motion.div
            className="h-full rounded-full bg-ios-accent"
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 1 }}
          />
        </div>
      </div>

      <Plant3DPreview category={category} />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.99 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 1 }}
          className="space-y-3"
        >
          {currentStep === 'category' ? (
            <div className="ios-blur-card p-4">
              <p className="mb-3 text-ios-body font-semibold">Выберите категорию</p>
              <PlantCategorySelector
                value={category}
                onChange={(value) => {
                  hapticSelectionChanged();
                  setCategory(value);
                  setName('');
                  setSearchQuery('');
                  setHints([]);
                }}
              />
            </div>
          ) : null}

          {currentStep === 'search' ? (
            <>
              <div className="ios-blur-card p-4">
                <label className="mb-1 block text-ios-caption text-ios-subtext">Название растения</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-subtext" />
                    <input
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value);
                        setName(event.target.value);
                      }}
                      placeholder="Например, Монстера или Томат"
                      className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 pl-9 pr-3 text-ios-body outline-none backdrop-blur-ios dark:bg-zinc-900/60"
                    />
                  </div>
                  <Button
                    variant="secondary"
                    className="h-11"
                    disabled={searchMutation.isPending}
                    onClick={() => searchMutation.mutate({ q: searchQuery.trim(), currentCategory: category, source: 'button' })}
                  >
                    {searchMutation.isPending ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Ищем...
                      </span>
                    ) : 'Найти'}
                  </Button>
                </div>

                <div
                  ref={resultsRef}
                  className={cn(
                    'mt-3 space-y-3 rounded-ios-button transition-all',
                    highlightResults ? 'ring-2 ring-ios-accent/45 ring-offset-2 ring-offset-transparent' : ''
                  )}
                >
                  {searchQuery.trim() && !searchMutation.isPending && !lastSearchHadResults ? (
                    <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 text-sm text-ios-subtext dark:bg-zinc-900/50">
                      Ничего не найдено. Попробуйте другое название или используйте распознавание по фото.
                    </div>
                  ) : null}

                  <label className="inline-flex items-center gap-2 px-1 text-xs text-ios-subtext">
                    <input
                      type="checkbox"
                      checked={autoPickFirstResult}
                      onChange={(event) => setAutoPickFirstResult(event.target.checked)}
                      className="h-4 w-4 rounded border-ios-border/70"
                    />
                    Автоподставлять первый найденный вариант
                  </label>

                  {presets.length ? (
                    <div className="overflow-x-auto pb-1">
                      <div className="flex min-w-max gap-2">
                        {presets.map((item) => (
                          <button
                            key={`${item.category}:${item.name}`}
                            type="button"
                            onClick={() => {
                              hapticSelectionChanged();
                              setName(item.name);
                              setSearchQuery(item.name);
                            }}
                            className={cn(
                              'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs',
                              item.popular
                                ? 'border-ios-accent/40 bg-ios-accent/15 text-ios-accent'
                                : 'border-ios-border/60 bg-white/65 text-ios-text dark:bg-zinc-900/55'
                            )}
                          >
                            {item.popular ? 'Популярное: ' : ''}{item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {hints.length ? (
                    <div className="rounded-ios-button border border-ios-border/60 bg-white/60 p-3 dark:bg-zinc-900/50">
                      <p className="text-xs text-ios-subtext">Подсказки:</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {hints.map((hint) => (
                          <button
                            key={hint}
                            type="button"
                            onClick={() => {
                              hapticSelectionChanged();
                              setName(hint);
                              setSearchQuery(hint);
                            }}
                            className="rounded-full border border-ios-border/60 bg-transparent px-2.5 py-1 text-xs"
                          >
                            {hint}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <PlantPhotoCapture onIdentified={applyIdentify} />
              {aiHint ? (
                <div className="ios-blur-card flex items-start gap-2 p-3 text-sm text-ios-subtext">
                  <Sparkles className="mt-0.5 h-4 w-4 text-ios-accent" />
                  <span>{aiHint}</span>
                </div>
              ) : null}
            </>
          ) : null}

          {currentStep === 'size' ? (
            <div className="ios-blur-card space-y-3 p-4">
              {!isGardenCategory(category) ? (
                <>
                  <label className="text-ios-caption text-ios-subtext">Объём горшка (л)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.2"
                    value={sizePotLiters}
                    onChange={(event) => setSizePotLiters(event.target.value)}
                    className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-ios-body outline-none dark:bg-zinc-900/60"
                  />
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-ios-caption text-ios-subtext">Высота (см)</label>
                    <input
                      type="number"
                      min="1"
                      value={sizeHeightCm}
                      onChange={(event) => setSizeHeightCm(event.target.value)}
                      className="mt-1 h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-ios-body outline-none dark:bg-zinc-900/60"
                    />
                  </div>
                  <div>
                    <label className="text-ios-caption text-ios-subtext">Диаметр (см)</label>
                    <input
                      type="number"
                      min="1"
                      value={sizeDiameterCm}
                      onChange={(event) => setSizeDiameterCm(event.target.value)}
                      className="mt-1 h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-ios-body outline-none dark:bg-zinc-900/60"
                    />
                  </div>
                </div>
              )}

              <label className="text-ios-caption text-ios-subtext">Базовый интервал полива (дней)</label>
              <input
                type="number"
                min="1"
                value={baseIntervalDays}
                onChange={(event) => setBaseIntervalDays(event.target.value)}
                className="h-11 w-full rounded-ios-button border border-ios-border/70 bg-white/75 px-3 text-ios-body outline-none dark:bg-zinc-900/60"
              />

              <Button
                variant="secondary"
                className="h-11 w-full"
                disabled={aiRecommendMutation.isPending || !name.trim()}
                onClick={() => aiRecommendMutation.mutate()}
              >
                {aiRecommendMutation.isPending ? 'Считаем рекомендации AI...' : 'Рассчитать рекомендации AI'}
              </Button>
            </div>
          ) : null}

          {currentStep === 'confirm' ? (
            <div className="ios-blur-card space-y-3 p-4">
              <p className="text-ios-body"><b>Растение:</b> {name || '—'}</p>
              <p className="text-ios-body"><b>Категория:</b> {CATEGORY_LABELS[category]}</p>
              <p className="text-ios-body"><b>Тип:</b> {TYPE_LABELS[type]}</p>

              <AIRecommendationForm
                category={category}
                aiIntervalDays={aiIntervalDays}
                aiWaterVolumeMl={aiWaterVolumeMl}
                intervalDays={intervalDaysNumber}
                waterVolumeMl={waterVolumeMl}
                onIntervalDaysChange={(value) => setBaseIntervalDays(String(clamp(value, 1, 60)))}
                onWaterVolumeMlChange={(value) => setWaterVolumeMl(clamp(value, 50, 10_000))}
                light={aiLight}
                soil={aiSoil}
                notes={aiNotes}
                source={profileSource}
                manualMode={manualMode}
                onManualModeChange={setManualMode}
                onApplyAi={() => {
                  if (aiIntervalDays) {
                    setBaseIntervalDays(String(aiIntervalDays));
                  }
                  if (aiWaterVolumeMl) {
                    setWaterVolumeMl(aiWaterVolumeMl);
                  }
                  setManualMode(false);
                  hapticImpact('rigid');
                }}
              />

              <Button
                className="mt-2 h-12 w-full"
                disabled={createMutation.isPending || !name.trim()}
                onClick={() => createMutation.mutate()}
              >
                <Check className="mr-2 h-4 w-4" />
                {createMutation.isPending ? 'Добавляем в календарь...' : 'Добавить растение и включить цикл поливов'}
              </Button>
            </div>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          className="h-11 flex-1"
          disabled={stepIndex === 0}
          onClick={() => {
            hapticImpact('light');
            setStepIndex((prev) => Math.max(0, prev - 1));
          }}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Назад
        </Button>

        {currentStep !== 'confirm' ? (
          <Button
            className="h-11 flex-1"
            disabled={!canGoNext}
            onClick={() => {
              hapticImpact('light');
              if (currentStep === 'search' && name.trim() && !suggestProfileMutation.isPending) {
                suggestProfileMutation.mutate(name.trim());
              }
              if (currentStep === 'size' && name.trim() && !aiRecommendMutation.isPending) {
                aiRecommendMutation.mutate();
              }
              setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
            }}
          >
            Далее <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </section>
  );
}
