// Общие типы категорий растений для нового Wizard Add Plant.
export type PlantCategory = 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN' | 'SEED_START';

export const PLANT_CATEGORIES: PlantCategory[] = ['HOME', 'OUTDOOR_DECORATIVE', 'OUTDOOR_GARDEN', 'SEED_START'];

export const PLANT_CATEGORY_LABELS: Record<PlantCategory, string> = {
  HOME: 'Домашние',
  OUTDOOR_DECORATIVE: 'Декоративные уличные',
  OUTDOOR_GARDEN: 'Садовые',
  SEED_START: 'Проращивание семян'
};
