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
