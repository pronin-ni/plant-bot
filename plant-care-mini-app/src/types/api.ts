export interface AuthValidationResponse {
  ok: boolean;
  userId: string;
  username?: string;
  firstName?: string;
}

export interface PlantDto {
  id: number;
  name: string;
  placement: 'INDOOR' | 'OUTDOOR';
  potVolumeLiters?: number;
  outdoorAreaM2?: number | null;
  outdoorSoilType?: 'SANDY' | 'LOAMY' | 'CLAY' | null;
  sunExposure?: 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE' | null;
  mulched?: boolean | null;
  perennial?: boolean | null;
  winterDormancyEnabled?: boolean | null;
  lastWateredDate: string;
  baseIntervalDays?: number;
  nextWateringDate?: string;
  recommendedWaterMl?: number;
  type?: string;
  photoUrl?: string;
}

export interface CalendarEventDto {
  date: string;
  plantId: number;
  plantName: string;
}

export interface PlantStatsDto {
  plantId: number;
  plantName: string;
  averageIntervalDays?: number;
  totalWaterings: number;
  overdue: boolean;
  overdueDays: number;
}

export interface PlantLearningDto {
  plantId: number;
  plantName: string;
  baseIntervalDays: number;
  avgActualIntervalDays?: number;
  smoothedIntervalDays?: number;
  seasonFactor: number;
  weatherFactor: number;
  potFactor: number;
  finalIntervalDays: number;
  lookupSource?: string;
}

export interface CalendarSyncDto {
  enabled: boolean;
  webcalUrl: string;
  httpsUrl: string;
}

export interface OpenRouterIdentifyResult {
  russianName?: string;
  latinName?: string;
  family?: string;
  confidence: number;
  wateringIntervalDays: number;
  lightLevel?: string;
  humidityPercent?: string;
  shortDescription?: string;
  alternatives: string[];
}

export interface OpenRouterDiagnoseResult {
  problem?: string;
  confidence: number;
  description?: string;
  causes: string[];
  treatment?: string;
  prevention?: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface AchievementItem {
  key: string;
  title: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  unlocked: boolean;
}

export interface AchievementsDto {
  unlocked: number;
  total: number;
  items: AchievementItem[];
}

export interface OpenRouterModelOption {
  id: string;
  name: string;
  contextLength?: number | null;
  inputPrice?: string | null;
  outputPrice?: string | null;
  free: boolean;
}

export interface OpenRouterModelsDto {
  models: OpenRouterModelOption[];
}

export interface OpenRouterPreferencesDto {
  plantModel?: string | null;
  chatModel?: string | null;
  photoIdentifyModel?: string | null;
  photoDiagnoseModel?: string | null;
  hasApiKey?: boolean;
  apiKey?: string | null;
}
