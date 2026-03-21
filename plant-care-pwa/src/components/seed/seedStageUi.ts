import type { PlantDto } from '@/types/api';

export type SeedStage = NonNullable<PlantDto['seedStage']>;
export type SeedActionKey = 'MOISTEN' | 'VENT' | 'REMOVE_COVER' | 'MOVE_TO_LIGHT' | 'PRICK_OUT' | 'MIGRATE';

export interface SeedActionDescriptor {
  key: SeedActionKey;
  label: string;
  subtitle?: string;
}

export interface SeedStagePresentation {
  stage: SeedStage;
  title: string;
  summary: string;
  progressLabel: string;
  primaryAction: SeedActionDescriptor | null;
  secondaryActions: SeedActionDescriptor[];
}

export interface SeedStageCopyBundle {
  title: string;
  summary: string;
  progressLabel: string;
  helperCopy?: string;
}

export function seedActionLabel(action: Exclude<SeedActionKey, 'MIGRATE'>): string {
  switch (action) {
    case 'MOISTEN':
      return 'Увлажнить';
    case 'VENT':
      return 'Проветрить';
    case 'REMOVE_COVER':
      return 'Снять крышку';
    case 'MOVE_TO_LIGHT':
      return 'Перенести под свет';
    case 'PRICK_OUT':
      return 'Пикировать';
  }
}

export const SEED_STAGE_OPTIONS: Array<{ value: SeedStage; label: string }> = [
  { value: 'SOWN', label: 'Посеяно' },
  { value: 'GERMINATING', label: 'Идёт прорастание' },
  { value: 'SPROUTED', label: 'Появились всходы' },
  { value: 'SEEDLING', label: 'Сеянец растёт' },
  { value: 'READY_TO_TRANSPLANT', label: 'Готово к пересадке' }
];

const STAGE_ORDER: SeedStage[] = SEED_STAGE_OPTIONS.map((item) => item.value);

export function seedStageLabel(stage?: PlantDto['seedStage'] | null): string {
  switch (stage) {
    case 'SOWN':
      return 'Посеяно';
    case 'GERMINATING':
      return 'Идёт прорастание';
    case 'SPROUTED':
      return 'Появились всходы';
    case 'SEEDLING':
      return 'Сеянец растёт';
    case 'READY_TO_TRANSPLANT':
      return 'Готово к пересадке';
    default:
      return 'Проращивание семян';
  }
}

export function targetEnvironmentLabel(target?: PlantDto['targetEnvironmentType'] | null): string {
  switch (target) {
    case 'INDOOR':
      return 'Домашнее растение';
    case 'OUTDOOR_ORNAMENTAL':
      return 'Уличное декоративное';
    case 'OUTDOOR_GARDEN':
      return 'Уличное садовое';
    case 'SEED_START':
      return 'Проращивание семян';
    default:
      return 'Не выбрано';
  }
}

export function seedWateringModeLabel(mode?: PlantDto['recommendedWateringMode'] | null): string {
  switch (mode) {
    case 'MIST':
      return 'Лёгкое опрыскивание';
    case 'BOTTOM_WATER':
      return 'Нижний полив';
    case 'KEEP_COVERED':
      return 'Поддерживать под крышкой';
    case 'VENT_AND_MIST':
      return 'Проветривать и опрыскивать';
    case 'LIGHT_SURFACE_WATER':
      return 'Лёгкое увлажнение сверху';
    case 'CHECK_ONLY':
      return 'Только контроль';
    default:
      return 'Не задано';
  }
}

export function seedSourceLabel(source?: string | null): string {
  switch (source) {
    case 'AI':
      return 'AI';
    case 'FALLBACK':
      return 'Резервный режим';
    case 'MANUAL':
      return 'Вручную';
    case 'SEED':
      return 'Базовый режим';
    default:
      return source?.trim() || 'Базовый режим';
  }
}

export function seedDaysSinceSowing(plant: PlantDto): number | null {
  if (!plant.sowingDate) {
    return null;
  }
  const sowing = new Date(plant.sowingDate);
  if (Number.isNaN(sowing.getTime())) {
    return null;
  }
  const today = new Date();
  sowing.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - sowing.getTime()) / 86_400_000));
}

export function getSeedProgressItems(stage?: PlantDto['seedStage'] | null) {
  const currentIndex = Math.max(0, STAGE_ORDER.indexOf((stage ?? 'SOWN') as SeedStage));
  return STAGE_ORDER.map((item, index) => ({
    key: item,
    shortLabel: shortStageLabel(item),
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
  }));
}

export function deriveSeedStagePresentation(plant: PlantDto, options?: { canMigrate?: boolean }): SeedStagePresentation {
  const stage = (plant.seedStage ?? 'SOWN') as SeedStage;
  const canMigrate = Boolean(options?.canMigrate);
  const canVent = Boolean(plant.underCover);
  const canRemoveCover = Boolean(plant.underCover);
  const canMoveToLight = !Boolean(plant.growLight);

  switch (stage) {
    case 'SOWN': {
      return {
        stage,
        title: seedStageLabel(stage),
        summary: 'Семена посеяны. Сейчас главное — стабильная влажность и спокойные условия.',
        progressLabel: 'Самый ранний этап: следим за влажностью и не тревожим посев.',
        primaryAction: { key: 'MOISTEN', label: 'Увлажнить', subtitle: 'Это помогает не пересушить верхний слой после посева.' } as SeedActionDescriptor,
        secondaryActions: [
          ...(canVent ? [{ key: 'VENT', label: 'Проветрить' } as SeedActionDescriptor] : []),
          ...(canMoveToLight ? [{ key: 'MOVE_TO_LIGHT', label: 'Под свет' } as SeedActionDescriptor] : [])
        ].slice(0, 3)
      };
    }
    case 'GERMINATING': {
      const primaryAction: SeedActionDescriptor = canVent
        ? { key: 'VENT', label: 'Проветрить', subtitle: 'Короткое проветривание помогает удержать спокойный микроклимат.' }
        : { key: 'MOISTEN', label: 'Увлажнить', subtitle: 'Сейчас важно поддерживать мягкую влажность без перелива.' };
      const secondary: SeedActionDescriptor[] = [
        { key: 'MOISTEN', label: 'Увлажнить' } as SeedActionDescriptor,
        ...(canVent ? [{ key: 'VENT', label: 'Проветрить' } as SeedActionDescriptor] : []),
        ...(canRemoveCover ? [{ key: 'REMOVE_COVER', label: 'Снять крышку' } as SeedActionDescriptor] : [])
      ].filter((item) => item.key !== primaryAction.key);
      return {
        stage,
        title: seedStageLabel(stage),
        summary: 'Семена просыпаются. Сейчас важно не перегреть их и поддерживать мягкую влажность.',
        progressLabel: 'Этап ожидания: видимых изменений может быть мало, но процесс уже идёт.',
        primaryAction,
        secondaryActions: secondary.slice(0, 3)
      };
    }
    case 'SPROUTED': {
      return {
        stage,
        title: seedStageLabel(stage),
        summary: 'Первые ростки уже появились. Теперь особенно важны свет и аккуратная влажность.',
        progressLabel: 'Хороший знак: помогаем всходам окрепнуть и не вытянуться.',
        primaryAction: canMoveToLight
          ? { key: 'MOVE_TO_LIGHT', label: 'Перенести под свет', subtitle: 'Это поможет росткам расти крепче и не вытягиваться.' } as SeedActionDescriptor
          : { key: 'MOISTEN', label: 'Увлажнить', subtitle: 'Свет уже настроен — теперь особенно важно не переувлажнить ростки.' } as SeedActionDescriptor,
        secondaryActions: [
          { key: 'MOISTEN', label: 'Увлажнить' } as SeedActionDescriptor,
          ...(canVent ? [{ key: 'VENT', label: 'Проветрить' } as SeedActionDescriptor] : []),
          ...(canRemoveCover ? [{ key: 'REMOVE_COVER', label: 'Снять крышку' } as SeedActionDescriptor] : [])
        ].filter((item, index, arr) => arr.findIndex((candidate) => candidate.key === item.key) === index)
          .filter((item) => item.key !== (canMoveToLight ? 'MOVE_TO_LIGHT' : 'MOISTEN'))
          .slice(0, 3)
      };
    }
    case 'SEEDLING': {
      const primaryAction: SeedActionDescriptor = canPrickOut(plant)
        ? { key: 'PRICK_OUT', label: 'Пикировать', subtitle: 'Сеянец уже окреп и готов к следующему шагу.' }
        : canMoveToLight
          ? { key: 'MOVE_TO_LIGHT', label: 'Под свет', subtitle: 'Сейчас важнее всего помочь сеянцу расти ровно и спокойно.' }
          : { key: 'MOISTEN', label: 'Увлажнить', subtitle: 'Базовый уход остаётся важнее лишних действий.' };
      const secondary: SeedActionDescriptor[] = [
        { key: 'MOISTEN', label: 'Увлажнить' } as SeedActionDescriptor,
        ...(canVent ? [{ key: 'VENT', label: 'Проветрить' } as SeedActionDescriptor] : []),
        {
          key: primaryAction.key === 'PRICK_OUT'
            ? (canMoveToLight ? 'MOVE_TO_LIGHT' : 'MOISTEN')
            : 'PRICK_OUT',
          label: primaryAction.key === 'PRICK_OUT'
            ? (canMoveToLight ? 'Под свет' : 'Увлажнить')
            : 'Пикировать'
        } as SeedActionDescriptor
      ].filter((item, index, arr) => arr.findIndex((candidate) => candidate.key === item.key) === index)
        .filter((item) => item.key !== primaryAction.key);
      return {
        stage,
        title: seedStageLabel(stage),
        summary: 'Сеянец укрепляется. Сейчас важны свет, аккуратный уход и подготовка к следующему этапу.',
        progressLabel: 'Ранний рост: поддерживаем стабильный режим и не перегружаем действиями.',
        primaryAction,
        secondaryActions: secondary.slice(0, 3)
      };
    }
    case 'READY_TO_TRANSPLANT':
    default: {
      return {
        stage,
        title: seedStageLabel('READY_TO_TRANSPLANT'),
        summary: 'Этап проращивания почти завершён. Можно перейти к обычному уходу за растением.',
        progressLabel: 'Переходный этап: seed-режим заканчивается, дальше начнётся обычный сценарий выращивания.',
        primaryAction: canMigrate
          ? { key: 'MIGRATE', label: 'Перевести в растение', subtitle: 'После этого карточка перейдёт в обычный режим ухода.' }
          : null,
        secondaryActions: [
          ...(canPrickOut(plant) ? [{ key: 'PRICK_OUT', label: 'Пикировать' } as SeedActionDescriptor] : []),
          { key: 'MOISTEN', label: 'Увлажнить' } as SeedActionDescriptor
        ].slice(0, 3)
      };
    }
  }
}

export function getSeedStageCopy(stage?: PlantDto['seedStage'] | null): SeedStageCopyBundle {
  switch (stage) {
    case 'SOWN':
      return {
        title: 'Посеяно',
        summary: 'Семена уже на месте. Сейчас важнее всего мягкая влажность и спокойные условия.',
        progressLabel: 'Стартовый этап: даём посеву стабильность и не торопим его.',
        helperCopy: 'Если верхний слой подсыхает, достаточно лёгкого увлажнения без перелива.'
      };
    case 'GERMINATING':
      return {
        title: 'Идёт прорастание',
        summary: 'Семена просыпаются. Держим умеренную влажность и бережный микроклимат.',
        progressLabel: 'Этап ожидания: процесс уже идёт, даже если всходов ещё не видно.',
        helperCopy: 'Если есть крышка, короткое проветривание помогает сохранить спокойный режим.'
      };
    case 'SPROUTED':
      return {
        title: 'Появились всходы',
        summary: 'Первые ростки уже появились. Сейчас особенно важны свет и аккуратная влажность.',
        progressLabel: 'Хороший знак: теперь помогаем всходам расти крепче и ровнее.',
        helperCopy: 'На этом этапе лучше меньше суеты: свет важнее, чем частые действия.'
      };
    case 'SEEDLING':
      return {
        title: 'Сеянец растёт',
        summary: 'Сеянец укрепляется. Сейчас важны свет, спокойный уход и подготовка к следующему этапу.',
        progressLabel: 'Ранний рост: поддерживаем стабильный режим и не перегружаем растение.',
        helperCopy: 'Если сеянец уже окреп, можно мягко готовиться к пикировке или следующему шагу.'
      };
    case 'READY_TO_TRANSPLANT':
      return {
        title: 'Готово к пересадке',
        summary: 'Этап проращивания почти завершён. Можно перейти к обычному уходу за растением.',
        progressLabel: 'Переходный этап: seed-режим заканчивается, дальше начнётся обычный сценарий выращивания.',
        helperCopy: 'После перевода карточка перейдёт в обычный режим и продолжит расти уже как растение.'
      };
    default:
      return {
        title: 'Проращивание семян',
        summary: 'Следим за стадией и делаем только те шаги, которые нужны сейчас.',
        progressLabel: 'Этот блок помогает быстро понять, что происходит и что делать дальше.'
      };
  }
}

function shortStageLabel(stage: SeedStage): string {
  switch (stage) {
    case 'SOWN':
      return 'Посеяно';
    case 'GERMINATING':
      return 'Прорастание';
    case 'SPROUTED':
      return 'Всходы';
    case 'SEEDLING':
      return 'Сеянец';
    case 'READY_TO_TRANSPLANT':
      return 'Пересадка';
  }
}

function canPrickOut(plant: PlantDto): boolean {
  return plant.seedStage === 'SEEDLING' || plant.seedStage === 'READY_TO_TRANSPLANT';
}
