import { CloudRain, Sparkles, UserCog, type LucideIcon } from 'lucide-react';

import type { PlantDto } from '@/types/api';

export interface PlantStatusTone {
  label: string;
  tone: 'good' | 'soon' | 'urgent' | 'neutral';
  containerClassName: string;
  dotClassName: string;
  borderClassName: string;
}

export interface PlantSourceTone {
  label: string;
  shortLabel: string;
  tone: 'ai' | 'weather' | 'fallback' | 'manual' | 'profile';
  className: string;
  icon: LucideIcon;
}

export function getPlantCategoryLabel(plant: PlantDto): string {
  switch (plant.category) {
    case 'OUTDOOR_DECORATIVE':
      return 'Декор';
    case 'OUTDOOR_GARDEN':
      return 'Сад';
    default:
      return 'Дом';
  }
}

export function getPlantEnvironmentLabel(plant: PlantDto): string {
  return plant.placement === 'OUTDOOR' ? 'outdoor' : 'indoor';
}

export function getPlantStatusTone(daysLeft: number, source?: PlantDto['recommendationSource']): PlantStatusTone {
  if (source === 'MANUAL') {
    return {
      label: 'Под контролем',
      tone: 'neutral',
      containerClassName: 'bg-stone-100/85 text-stone-700 ring-1 ring-stone-200/70 dark:bg-stone-900/70 dark:text-stone-200 dark:ring-stone-700/60',
      dotClassName: 'bg-stone-500',
      borderClassName: 'border-stone-200/90 dark:border-stone-800/80'
    };
  }

  if (daysLeft <= 0) {
    return {
      label: 'Срочно',
      tone: 'urgent',
      containerClassName: 'bg-rose-50/90 text-rose-700 ring-1 ring-rose-200/70 dark:bg-rose-950/35 dark:text-rose-300 dark:ring-rose-800/55',
      dotClassName: 'bg-rose-500',
      borderClassName: 'border-rose-200/90 dark:border-rose-800/75'
    };
  }

  if (daysLeft <= 2) {
    return {
      label: 'Скоро полив',
      tone: 'soon',
      containerClassName: 'bg-amber-50/90 text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-950/35 dark:text-amber-300 dark:ring-amber-800/55',
      dotClassName: 'bg-amber-500',
      borderClassName: 'border-amber-200/90 dark:border-amber-800/75'
    };
  }

  return {
    label: 'В порядке',
    tone: 'good',
    containerClassName: 'bg-emerald-50/90 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/35 dark:text-emerald-300 dark:ring-emerald-800/55',
    dotClassName: 'bg-emerald-500',
    borderClassName: 'border-emerald-200/90 dark:border-emerald-800/75'
  };
}

export function getPlantSourceTone(source?: PlantDto['recommendationSource']): PlantSourceTone {
  switch (source) {
    case 'AI':
      return {
        label: 'AI recommendation',
        shortLabel: 'AI',
        tone: 'ai',
        className: 'bg-sky-50/90 text-sky-700 ring-1 ring-sky-200/70 dark:bg-sky-950/35 dark:text-sky-300 dark:ring-sky-800/55',
        icon: Sparkles
      };
    case 'WEATHER_ADJUSTED':
      return {
        label: 'Weather-adjusted',
        shortLabel: 'Weather',
        tone: 'weather',
        className: 'bg-cyan-50/90 text-cyan-700 ring-1 ring-cyan-200/70 dark:bg-cyan-950/35 dark:text-cyan-300 dark:ring-cyan-800/55',
        icon: CloudRain
      };
    case 'HYBRID':
      return {
        label: 'AI + weather',
        shortLabel: 'AI + Weather',
        tone: 'weather',
        className: 'bg-teal-50/90 text-teal-700 ring-1 ring-teal-200/70 dark:bg-teal-950/35 dark:text-teal-300 dark:ring-teal-800/55',
        icon: Sparkles
      };
    case 'FALLBACK':
      return {
        label: 'Fallback',
        shortLabel: 'Fallback',
        tone: 'fallback',
        className: 'bg-stone-100/85 text-stone-700 ring-1 ring-stone-200/70 dark:bg-stone-900/70 dark:text-stone-200 dark:ring-stone-700/60',
        icon: UserCog
      };
    case 'MANUAL':
      return {
        label: 'Manual',
        shortLabel: 'Manual',
        tone: 'manual',
        className: 'bg-slate-100/85 text-slate-700 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-700/60',
        icon: UserCog
      };
    case 'BASE_PROFILE':
    case 'HEURISTIC':
    default:
      return {
        label: 'Profile-based',
        shortLabel: 'Profile',
        tone: 'profile',
        className: 'bg-emerald-50/90 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/35 dark:text-emerald-300 dark:ring-emerald-800/55',
        icon: Sparkles
      };
  }
}

export function getPlantRecommendationHint(plant: PlantDto): string {
  const summary = plant.recommendationSummary?.trim();
  if (summary) {
    return summary;
  }

  if (plant.recommendationSource === 'MANUAL') {
    return 'Используются ваши настройки полива.';
  }

  if (plant.recommendationSource === 'FALLBACK') {
    return 'Резервный режим помогает не пропустить полив.';
  }

  if (plant.recommendationSource === 'WEATHER_ADJUSTED' || plant.recommendationSource === 'HYBRID') {
    return 'Погода сейчас влияет на расписание полива.';
  }

  if (plant.placement === 'OUTDOOR') {
    return 'Outdoor-профиль учитывает сезон и условия участка.';
  }

  return 'Умеренный indoor режим для повседневного ухода.';
}

export function getPlantReasonTone(source?: PlantDto['recommendationSource']): string {
  switch (source) {
    case 'WEATHER_ADJUSTED':
    case 'HYBRID':
      return 'bg-cyan-50/85 text-cyan-950 ring-1 ring-cyan-200/60 dark:bg-cyan-950/25 dark:text-cyan-100 dark:ring-cyan-800/45';
    case 'MANUAL':
      return 'bg-slate-100/90 text-slate-800 ring-1 ring-slate-200/60 dark:bg-slate-900/70 dark:text-slate-100 dark:ring-slate-700/45';
    case 'FALLBACK':
      return 'bg-stone-100/90 text-stone-800 ring-1 ring-stone-200/60 dark:bg-stone-900/70 dark:text-stone-100 dark:ring-stone-700/45';
    default:
      return 'bg-emerald-50/85 text-emerald-950 ring-1 ring-emerald-200/60 dark:bg-emerald-950/25 dark:text-emerald-100 dark:ring-emerald-800/45';
  }
}
