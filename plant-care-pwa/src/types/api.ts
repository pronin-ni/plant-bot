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
  wateringProfile?: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  region?: string | null;
  containerType?: 'POT' | 'CONTAINER' | 'FLOWERBED' | 'OPEN_GROUND' | null;
  containerVolumeLiters?: number | null;
  cropType?: string | null;
  growthStage?: 'SEEDLING' | 'VEGETATIVE' | 'FLOWERING' | 'FRUITING' | 'HARVEST' | null;
  greenhouse?: boolean | null;
  dripIrrigation?: boolean | null;
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
  recommendedIntervalDays?: number;
  recommendationSource?: 'AI' | 'WEATHER_ADJUSTED' | 'HEURISTIC' | 'HYBRID' | 'FALLBACK' | 'MANUAL' | 'BASE_PROFILE' | null;
  recommendationSummary?: string | null;
  confidenceScore?: number | null;
  recommendationGeneratedAt?: string | null;
  type?: string;
  photoUrl?: string;
  createdAt?: string;
}


export interface PlantAiRecommendDto {
  source: 'ai' | 'fallback';
  recommendedIntervalDays: number;
  recommendedWaterMl: number;
  summary: string;
  reasoning: string[];
  warnings: string[];
  profile: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
}

export interface WateringRecommendationPreviewDto {
  source: 'AI' | 'WEATHER_ADJUSTED' | 'HEURISTIC' | 'HYBRID' | 'FALLBACK' | 'MANUAL' | 'BASE_PROFILE';
  environmentType: 'INDOOR' | 'OUTDOOR_ORNAMENTAL' | 'OUTDOOR_GARDEN';
  recommendedIntervalDays: number;
  recommendedWaterMl: number;
  wateringMode?: 'LIGHT' | 'STANDARD' | 'DEEP' | 'SOIL_CHECK_FIRST';
  confidence?: number;
  summary: string;
  reasoning: string[];
  warnings: string[];
  weatherUsed?: boolean;
  cyclePreview?: {
    dates: string[];
  };
  weatherContextPreview?: {
    available: boolean;
    city?: string | null;
    region?: string | null;
    temperatureNowC?: number | null;
    humidityNowPercent?: number | null;
    precipitationLast24hMm?: number | null;
    precipitationForecastMm?: number | null;
    maxTemperatureNext3DaysC?: number | null;
    windNowMs?: number | null;
    confidence?: string;
    warnings?: string[];
  };
  sensorContext?: WateringSensorContextDto;
}

export interface WateringSensorContextDto {
  available: boolean;
  roomId?: string | null;
  roomName?: string | null;
  temperatureC?: number | null;
  humidityPercent?: number | null;
  soilMoisturePercent?: number | null;
  illuminanceLux?: number | null;
  confidence: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  source: string;
  sensorEntityIds: string[];
  message?: string | null;
}

export interface HaRoomDto {
  id: string;
  name: string;
}

export interface HaSensorDto {
  entityId: string;
  friendlyName: string;
  kind: string;
  areaId?: string | null;
  areaName?: string | null;
  unit?: string | null;
  value?: number | null;
  fromAttribute: boolean;
}

export interface WateringHaOptionsDto {
  connected: boolean;
  rooms: HaRoomDto[];
  sensors: HaSensorDto[];
  message?: string | null;
}

export interface ApplyWateringRecommendationDto {
  ok: boolean;
  plantId: number;
  source: 'AI' | 'HEURISTIC' | 'HYBRID' | 'FALLBACK' | 'MANUAL';
  baseIntervalDays: number;
  preferredWaterMl: number;
  recommendationUpdatedAt: string;
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

export interface AdminOpenRouterModelsDto {
  textModel?: string | null;
  photoModel?: string | null;
  hasApiKey: boolean;
  updatedAt?: string | null;
}

export interface OpenRouterRuntimeSettingsDto {
  textModel?: string | null;
  photoModel?: string | null;
  hasApiKey: boolean;
}

export interface OpenRouterTypedTestDto {
  ok: boolean;
  type: 'text' | 'photo';
  model?: string | null;
  answer?: string | null;
  message: string;
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
  email?: string;
  city?: string;
  createdAt?: string;
  lastSeenAt?: string;
  blocked?: boolean;
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
  category?: 'HOME' | 'OUTDOOR_DECORATIVE' | 'OUTDOOR_GARDEN';
  placement?: string;
  type?: string;
  hasPhoto?: boolean;
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

export interface AdminPlantActionDto {
  ok: boolean;
  plantId: number;
  message: string;
}

export interface AdminBulkPlantWaterDto {
  ok: boolean;
  total: number;
  updated: number;
  skipped: number;
  message: string;
}

export interface AdminUserDetailsDto {
  id: number;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  city?: string;
  blocked?: boolean;
  createdAt?: string;
  lastSeenAt?: string;
  lastSeenPwaAt?: string;
  lastSeenTmaAt?: string;
  plantCount: number;
  overduePlants: number;
  totalWaterings: number;
  homeAssistantConnected: boolean;
  homeAssistantInstanceName?: string;
  homeAssistantBaseUrlMasked?: string;
  homeAssistantLastSuccessAt?: string;
  hasOpenRouterKey: boolean;
  openrouterModelPlant?: string;
  openrouterModelChat?: string;
  openrouterModelPhotoIdentify?: string;
  openrouterModelPhotoDiagnose?: string;
  plants: AdminPlantItemDto[];
}

export interface AdminUserActionDto {
  ok: boolean;
  userId: number;
  message: string;
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

export interface AdminScopedCacheClearDto {
  scope: string;
  weatherEntries: number;
  weatherRainKeys: number;
  weatherRainSamples: number;
  openRouterCareEntries: number;
  openRouterWateringEntries: number;
  openRouterChatEntries: number;
  userCacheEntries: number;
  message: string;
}

export interface AdminBackupItemDto {
  fileName: string;
  sizeBytes: number;
  modifiedAtEpochMs: number;
  createdBy?: string;
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

export interface AdminActivityLogItemDto {
  at?: string;
  type: string;
  userId?: number;
  telegramId?: number;
  username?: string;
  message: string;
  severity?: 'info' | 'warning' | 'error' | string;
}

export interface AdminMonitoringDto {
  onlineUsers: number;
  activeUsers24h: number;
  avgSessionMinutes: number;
  errorsToday: number;
  pushFailuresToday: number;
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

export interface PwaEmailMagicLinkRequestDto {
  ok: boolean;
  message: string;
  expiresAt: string;
  debugToken?: string | null;
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

export interface WeatherProviderDto {
  id: string;
  name: string;
  description?: string;
  free?: boolean;
}

export interface WeatherProvidersResponse {
  providers: WeatherProviderDto[];
  selected?: string | null;
}

export interface WeatherCurrentDto {
  city: string;
  tempC: number;
  humidity: number;
  icon?: string | null;
  description?: string | null;
  source: string;
  fallbackUsed?: boolean;
  staleFallbackUsed?: boolean;
  degraded?: boolean;
  statusMessage?: string | null;
}

export interface WeatherForecastItemDto {
  date: string;
  tempC: number;
  humidity?: number | null;
  icon?: string | null;
  description?: string | null;
}

export interface WeatherForecastDto {
  city: string;
  source: string;
  days: WeatherForecastItemDto[];
  fallbackUsed?: boolean;
  staleFallbackUsed?: boolean;
  degraded?: boolean;
  statusMessage?: string | null;
}
