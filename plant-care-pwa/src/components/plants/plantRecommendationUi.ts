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
    case 'SEED_START':
      return 'Семена';
    case 'OUTDOOR_DECORATIVE':
      return 'Декор';
    case 'OUTDOOR_GARDEN':
      return 'Сад';
    default:
      return 'Дом';
  }
}

export function seedStageLabel(stage?: PlantDto['seedStage'] | null): string {
  switch (stage) {
    case 'SOWN':
      return 'Посеяно';
    case 'GERMINATING':
      return 'Прорастает';
    case 'SPROUTED':
      return 'Появились всходы';
    case 'SEEDLING':
      return 'Сеянец';
    case 'READY_TO_TRANSPLANT':
      return 'Готово к пересадке';
    default:
      return 'Проращивание';
  }
}

export function getPlantEnvironmentLabel(plant: PlantDto): string {
  if (plant.wateringProfile === 'SEED_START') {
    return 'проращивание';
  }
  return plant.placement === 'OUTDOOR' ? 'на улице' : 'в доме';
}

export function getPlantStatusTone(daysLeft: number, source?: PlantDto['recommendationSource']): PlantStatusTone {
  if (source === 'MANUAL') {
    return {
      label: 'Под контролем',
      tone: 'neutral',
      containerClassName: 'bg-[hsl(var(--secondary)/0.94)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--border)/0.75)]',
      dotClassName: 'bg-[hsl(var(--muted-foreground))]',
      borderClassName: 'border-[hsl(var(--border)/0.78)]'
    };
  }

  if (daysLeft <= 0) {
    return {
      label: 'Срочно',
      tone: 'urgent',
      containerClassName: 'bg-[hsl(var(--destructive)/0.14)] text-[hsl(var(--destructive))] ring-1 ring-[hsl(var(--destructive)/0.3)]',
      dotClassName: 'bg-[hsl(var(--destructive))]',
      borderClassName: 'border-[hsl(var(--destructive)/0.28)]'
    };
  }

  if (daysLeft <= 2) {
    return {
      label: 'Скоро полив',
      tone: 'soon',
      containerClassName: 'bg-amber-500/14 text-[hsl(var(--foreground))] ring-1 ring-amber-400/35',
      dotClassName: 'bg-amber-500',
      borderClassName: 'border-amber-400/30'
    };
  }

  return {
    label: 'В порядке',
    tone: 'good',
    containerClassName: 'bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--primary)/0.28)]',
    dotClassName: 'bg-[hsl(var(--primary))]',
    borderClassName: 'border-[hsl(var(--primary)/0.26)]'
  };
}

export function getPlantSourceTone(source?: PlantDto['recommendationSource']): PlantSourceTone {
  switch (source) {
    case 'AI':
      return {
        label: 'AI-рекомендация',
        shortLabel: 'AI',
        tone: 'ai',
        className: 'bg-[hsl(var(--accent)/0.2)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--accent)/0.3)]',
        icon: Sparkles
      };
    case 'WEATHER_ADJUSTED':
      return {
        label: 'С учётом погоды',
        shortLabel: 'Погода',
        tone: 'weather',
        className: 'bg-sky-500/14 text-[hsl(var(--foreground))] ring-1 ring-sky-400/30',
        icon: CloudRain
      };
    case 'HYBRID':
      return {
        label: 'AI + погода',
        shortLabel: 'AI + Погода',
        tone: 'weather',
        className: 'bg-teal-500/14 text-[hsl(var(--foreground))] ring-1 ring-teal-400/30',
        icon: Sparkles
      };
    case 'FALLBACK':
      return {
        label: 'Резервный режим',
        shortLabel: 'Резерв',
        tone: 'fallback',
        className: 'bg-[hsl(var(--secondary)/0.94)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--border)/0.75)]',
        icon: UserCog
      };
    case 'MANUAL':
      return {
        label: 'Вручную',
        shortLabel: 'Вручную',
        tone: 'manual',
        className: 'bg-[hsl(var(--secondary)/0.94)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--border)/0.75)]',
        icon: UserCog
      };
    case 'BASE_PROFILE':
    case 'HEURISTIC':
    default:
      return {
        label: 'По профилю растения',
        shortLabel: 'Профиль',
        tone: 'profile',
        className: 'bg-[hsl(var(--primary)/0.16)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--primary)/0.28)]',
        icon: Sparkles
      };
  }
}

export function getPlantRecommendationHint(plant: PlantDto): string {
  if (plant.wateringProfile === 'SEED_START') {
    return plant.seedSummary?.trim() || 'Сейчас важнее контроль влажности и стадии всходов, а не обычный цикл полива.';
  }
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
    return 'Уличный профиль учитывает сезон и условия участка.';
  }

  return 'Умеренный домашний режим для повседневного ухода.';
}

export function getPlantReasonTone(source?: PlantDto['recommendationSource']): string {
  switch (source) {
    case 'WEATHER_ADJUSTED':
    case 'HYBRID':
      return 'bg-sky-500/10 text-[hsl(var(--foreground))] ring-1 ring-sky-400/25';
    case 'MANUAL':
      return 'bg-[hsl(var(--secondary)/0.94)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--border)/0.72)]';
    case 'FALLBACK':
      return 'bg-[hsl(var(--secondary)/0.94)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--border)/0.72)]';
    default:
      return 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--foreground))] ring-1 ring-[hsl(var(--primary)/0.22)]';
  }
}
