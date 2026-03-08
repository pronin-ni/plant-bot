import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, ChevronDown, Droplets, Leaf, RefreshCw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { hapticImpact } from '@/lib/telegram';
import type { PlantCareAdviceDto, PlantDto } from '@/types/api';

interface AIRecommendationCardProps {
  plant: PlantDto;
  advice?: PlantCareAdviceDto;
  loading?: boolean;
  onRefresh: () => void;
}

function placementLabel(plant: PlantDto): string {
  if (plant.category === 'OUTDOOR_DECORATIVE') {
    return 'Декор';
  }
  if (plant.category === 'OUTDOOR_GARDEN') {
    return 'Сад';
  }
  return plant.placement === 'OUTDOOR' ? 'Улица' : 'Дом';
}

export function AIRecommendationCard({
  plant,
  advice,
  loading = false,
  onRefresh
}: AIRecommendationCardProps) {
  const [expanded, setExpanded] = useState(true);

  const cycle = advice?.wateringCycleDays ?? plant.baseIntervalDays ?? 7;
  const volume = advice ? Math.max(0, Math.round(cycle > 0 ? (plant.recommendedWaterMl ?? 0) : 0)) : (plant.recommendedWaterMl ?? 0);
  const soil = advice?.soilType || 'Не указан';

  return (
    <motion.section
      className="ios-blur-card overflow-hidden p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 330, damping: 30 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 text-ios-body font-semibold">
            <BellRing className="h-4 w-4 text-ios-accent" />
            Умное напоминание и AI
          </p>
          <p className="mt-1 text-[11px] text-ios-subtext">Источник: {advice?.source ?? 'локальные правила'}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="h-8 px-2.5"
            disabled={loading}
            onClick={() => {
              hapticImpact('light');
              onRefresh();
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              hapticImpact('light');
              setExpanded((prev) => !prev);
            }}
          >
            <motion.span animate={{ rotate: expanded ? 0 : -180 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }}>
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetricPill icon={Droplets} title="Объём" value={`${volume} мл`} />
        <MetricPill icon={Leaf} title="Цикл" value={`${cycle} дн.`} />
        <MetricPill icon={BellRing} title="Тип" value={placementLabel(plant)} />
      </div>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="content"
            className="mt-3 space-y-2 rounded-2xl border border-ios-border/55 bg-white/45 p-3 text-sm dark:bg-zinc-900/45"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <p><b>Грунт:</b> {soil}</p>
            <p>
              <b>Состав:</b> {advice?.soilComposition?.length ? advice.soilComposition.join(', ') : 'Нет данных'}
            </p>
            <p>
              <b>Добавки:</b> {advice?.additives?.length ? advice.additives.join(', ') : 'Не требуются'}
            </p>
            {advice?.note ? (
              <p className="inline-flex items-start gap-1.5 text-ios-subtext">
                <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-500" />
                {advice.note}
              </p>
            ) : (
              <p className="text-ios-subtext">AI-заметка пока недоступна, можно обновить рекомендации позже.</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  );
}

function MetricPill({ icon: Icon, title, value }: { icon: typeof Droplets; title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ios-border/50 bg-white/45 px-2 py-2 text-center dark:bg-zinc-900/45">
      <Icon className="mx-auto h-3.5 w-3.5 text-ios-accent" />
      <p className="mt-1 text-[11px] text-ios-subtext">{title}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-ios-text">{value}</p>
    </div>
  );
}
