import type { PlantDto, WateringRecommendationPreviewDto } from '@/types/api';

export type ExplainabilityMode = 'AUTO' | 'MANUAL' | 'FALLBACK' | 'AI';

export interface ExplainabilityViewModel {
  summary: string;
  topFactors: string[];
  allFactors: string[];
  warnings: string[];
  mode: ExplainabilityMode;
  flags: {
    hasWeather: boolean;
    hasStage: boolean;
    hasAI: boolean;
    hasFallback: boolean;
  };
}

export function getExplainabilityListLine(viewModel: ExplainabilityViewModel): string {
  if (viewModel.mode === 'MANUAL') {
    return 'Ручной режим';
  }
  if (viewModel.mode === 'FALLBACK') {
    return 'Резервный режим';
  }
  if (viewModel.topFactors.length) {
    return viewModel.topFactors[0];
  }
  return viewModel.summary;
}

export function getExplainabilityReminderLine(viewModel: ExplainabilityViewModel, daysLeft: number | null): string {
  if (daysLeft == null) {
    return 'Собираем режим ухода для напоминания.';
  }
  const reason = getExplainabilityListLine(viewModel);
  if (daysLeft <= 0) {
    return `${reason}. Сегодня стоит вернуться к поливу.`;
  }
  if (daysLeft === 1) {
    return `${reason}. Завтра проверьте растение ещё раз.`;
  }
  return `${reason}. До полива примерно ${daysLeft} дн.`;
}

function humanizeExplainabilityText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  const directMatches: Array<[RegExp, string]> = [
    [/Пользовательский manual override\.?/gi, 'Режим зафиксирован вручную.'],
    [/manual override/gi, 'режим зафиксирован вручную'],
    [/AI не вернул валидный ответ, включен fallback\.?/gi, 'AI сейчас недоступен, поэтому включён резервный режим.'],
    [/fallback/gi, 'резервный режим'],
    [/degraded mode/gi, 'режим с ограниченными данными'],
    [/Скорость ветра недоступна в унифицированном API, расч[её]т без wind-фактора\.?/gi, 'Нет данных о ветре, поэтому расчёт сделан без этого фактора.'],
    [/Учт[её]н текущий погодный контекст\.?/gi, 'Учтена текущая погода.'],
    [/Погодный контекст повлиял на пересч[её]т режима\.?/gi, 'Погода повлияла на режим полива.'],
    [/Режим собран из погодных условий, сезона и параметров участка\.?/gi, 'Режим рассчитан с учётом погоды, сезона и условий участка.'],
    [/Режим собран из профиля растения, условий размещения и базового интервала\.?/gi, 'Режим рассчитан с учётом растения, места и базового интервала.']
  ];

  let result = trimmed;
  for (const [pattern, replacement] of directMatches) {
    result = result.replace(pattern, replacement);
  }

  result = result
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\./g, '.')
    .trim();

  return result;
}

function humanizeWateringProfile(profile?: string | null): string | null {
  const normalized = (profile ?? '').trim().toUpperCase();
  switch (normalized) {
    case 'INDOOR':
      return 'домашний';
    case 'OUTDOOR':
      return 'уличный';
    case 'OUTDOOR_ORNAMENTAL':
      return 'уличный декоративный';
    case 'OUTDOOR_GARDEN':
      return 'садовый';
    default:
      return profile?.trim() ? profile.toLowerCase() : null;
  }
}

function normalizeReasoningItem(item: string): string {
  const trimmed = humanizeExplainabilityText(item);
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('HYBRID:')) {
    return trimmed.replace('HYBRID:', 'Гибридный режим:');
  }
  if (trimmed.includes('DEFAULT тип')) {
    return trimmed.replace('DEFAULT тип', 'стандартному профилю');
  }
  return trimmed;
}

function buildFactors(plant: PlantDto, recommendation?: WateringRecommendationPreviewDto | null): string[] {
  if (recommendation?.reasoning?.length) {
    return recommendation.reasoning
      .map(normalizeReasoningItem)
      .filter(Boolean)
      .slice(0, 6);
  }

  if (plant.placement === 'OUTDOOR') {
    return [
      recommendation?.weatherContextPreview?.precipitationLast24hMm != null
        ? `Осадки за сутки: ${recommendation.weatherContextPreview.precipitationLast24hMm} мм`
        : 'Учтены осадки и ближайший прогноз',
      recommendation?.weatherContextPreview?.temperatureNowC != null
        ? `Температура около ${Math.round(recommendation.weatherContextPreview.temperatureNowC)}°C`
        : 'Учтена текущая температура',
      plant.containerType ? `Условие: ${plant.containerType.toLowerCase()}` : 'Учтены условия участка',
      plant.outdoorSoilType ? `Почва: ${plant.outdoorSoilType.toLowerCase()}` : 'Учтён тип почвы'
    ].filter(Boolean);
  }

  return [
    plant.type ? `Тип растения: ${plant.type.toLowerCase()}` : 'Учтён тип растения',
    plant.potVolumeLiters != null ? `Горшок ${plant.potVolumeLiters.toFixed(1)} л` : 'Учтён объём горшка',
    plant.baseIntervalDays ? `База: ${plant.baseIntervalDays} дн.` : 'Учтён базовый интервал',
    humanizeWateringProfile(plant.wateringProfile) ? `Профиль: ${humanizeWateringProfile(plant.wateringProfile)}` : 'Учтён профиль растения'
  ].filter(Boolean);
}

function resolveMode(plant: PlantDto, recommendation?: WateringRecommendationPreviewDto | null): ExplainabilityMode {
  const source = (recommendation?.source ?? plant.recommendationSource ?? '').toUpperCase();
  if (source === 'MANUAL') {
    return 'MANUAL';
  }
  if (source === 'AI' || source === 'HYBRID') {
    return 'AI';
  }
  if (source === 'FALLBACK' || source === 'HEURISTIC' || source === 'BASE_PROFILE') {
    return 'FALLBACK';
  }
  return 'AUTO';
}

export function buildExplainabilityViewModel(data: {
  plant: PlantDto;
  recommendation?: WateringRecommendationPreviewDto | null;
}): ExplainabilityViewModel {
  const { plant, recommendation } = data;
  const allFactors = buildFactors(plant, recommendation);
  const warnings = (recommendation?.warnings ?? [])
    .filter(Boolean)
    .map((item) => humanizeExplainabilityText(item))
    .filter(Boolean)
    .slice(0, 6);
  const mode = resolveMode(plant, recommendation);
  const flags = {
    hasWeather: Boolean(recommendation?.weatherContextPreview?.available) || allFactors.some((item) => /осадки|температур|погод/i.test(item)),
    hasStage: Boolean(plant.seedStage || plant.growthStage),
    hasAI: mode === 'AI',
    hasFallback: mode === 'FALLBACK'
  };

  const summary =
    humanizeExplainabilityText(recommendation?.summary?.trim() || '') ||
    humanizeExplainabilityText(plant.recommendationSummary?.trim() || '') ||
    (plant.placement === 'OUTDOOR'
      ? 'Режим собран из погодных условий, сезона и параметров участка.'
      : 'Режим собран из профиля растения, условий размещения и базового интервала.');

  return {
    summary,
    topFactors: allFactors.slice(0, 2),
    allFactors,
    warnings,
    mode,
    flags
  };
}
