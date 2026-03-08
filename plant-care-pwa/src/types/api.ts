export interface AuthValidationResponse {
  ok: boolean;
  userId: string;
  username?: string;
  firstName?: string;
  city?: string;
  isAdmin?: boolean;
}

export interface PlantDto {
  id: number;
  name: string;
  placement: 'INDOOR' | 'OUTDOOR';
  category?: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
  potVolumeLiters?: number;
  outdoorAreaM2?: number | null;
  outdoorSoilType?: 'SANDY' | 'LOAMY' | 'CLAY' | null;
  sunExposure?: 'FULL_SUN' | 'PARTIAL_SHADE' | 'SHADE' | null;
  mulched?: boolean | null;
  perennial?: boolean | null;
  winterDormancyEnabled?: boolean | null;
  lastWateredDate: string;
  baseIntervalDays?: number;
  preferredWaterMl?: number;
  nextWateringDate?: string;
  recommendedWaterMl?: number;
  type?: string;
  photoUrl?: string;
  createdAt?: string;
}


export interface PlantAiRecommendDto {
  wateringFrequencyDays: number;
  wateringVolumeMl: number;
  light?: string;
  soil?: string;
  notes?: string;
  source?: string;
}

export interface PlantPresetSuggestionDto {
  name: string;
  category: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
  popular: boolean;
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
  supportsImageToText: boolean;
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


export interface ChatAskResponse {
  ok: boolean;
  answer: string;
  model?: string | null;
}


export interface PlantCareAdviceDto {
  wateringCycleDays: number;
  additives: string[];
  soilType?: string;
  soilComposition: string[];
  note?: string;
  source?: string;
}


export interface AdminOverviewDto {
  totalUsers: number;
  totalPlants: number;
  usersWithPlants: number;
  indoorPlants: number;
  outdoorPlants: number;
  activeUsers7d: number;
  activeUsers30d: number;
}

export interface AdminUserItemDto {
  id: number;
  telegramId: number;
  username?: string;
  firstName?: string;
  city?: string;
  createdAt?: string;
  plantCount: number;
}

export interface AdminUsersDto {
  items: AdminUserItemDto[];
  page: number;
  size: number;
  total: number;
}

export interface AdminPlantItemDto {
  id: number;
  name: string;
  userId?: number;
  telegramId?: number;
  username?: string;
  placement?: string;
  type?: string;
  baseIntervalDays?: number;
  lastWateredDate?: string;
  nextWateringDate?: string;
  createdAt?: string;
}

export interface AdminPlantsDto {
  items: AdminPlantItemDto[];
  page: number;
  size: number;
  total: number;
}

export interface AdminStatsItemDto {
  key: string;
  value: number;
}

export interface AdminStatsDto {
  topCities: AdminStatsItemDto[];
  topPlantTypes: AdminStatsItemDto[];
  overduePlants: number;
  activeUsers7d: number;
  activeUsers30d: number;
}

export interface AssistantHistoryItemDto {
  id: number;
  question: string;
  answer: string;
  model?: string | null;
  createdAt: string;
}

export interface PlantProfileSuggestionDto {
  found: boolean;
  intervalDays: number;
  type: string;
  source?: string | null;
}

export interface AdminCacheClearDto {
  plantLookupRows: number;
  openRouterCareEntries: number;
  openRouterWateringEntries: number;
  openRouterChatEntries: number;
  weatherEntries: number;
  weatherRainKeys: number;
  weatherRainSamples: number;
}

export interface AdminBackupItemDto {
  fileName: string;
  sizeBytes: number;
  modifiedAtEpochMs: number;
}

export interface AdminBackupRestoreDto {
  ok: boolean;
  restoredFile: string;
  message: string;
}

export interface AdminPushEndpointResultDto {
  endpoint: string;
  delivered: boolean;
  status: number;
  error?: string | null;
}

export interface AdminPushTestDto {
  ok: boolean;
  userId: number;
  username?: string;
  subscriptions: number;
  delivered: number;
  message: string;
  endpoints: AdminPushEndpointResultDto[];
}

export interface PwaUserDto {
  id: number;
  telegramId?: number;
  username?: string;
  firstName?: string;
  email?: string;
  roles: string[];
}

export interface PwaAuthDto {
  accessToken: string;
  expiresInSeconds: number;
  user: PwaUserDto;
}

export interface PwaAuthProvidersDto {
  providers: string[];
}

export interface PwaTelegramWidgetPayloadDto {
  id: number;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  authDate: number;
  hash: string;
}

export interface PwaPushPublicKeyDto {
  enabled: boolean;
  publicKey: string;
}

export interface PwaPushStatusDto {
  enabled: boolean;
  subscribed: boolean;
  subscriptionsCount: number;
}

export interface PwaPushSubscribeDto {
  ok: boolean;
  subscriptionsCount: number;
}
