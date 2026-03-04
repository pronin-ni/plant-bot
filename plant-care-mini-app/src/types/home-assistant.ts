export type HaSensorKind = 'TEMPERATURE' | 'HUMIDITY' | 'SOIL_MOISTURE' | 'ILLUMINANCE' | 'OTHER';
export type HaSelectionMode = 'AUTO_DISCOVERY' | 'MANUAL';

export interface HomeAssistantConfigRequest {
  baseUrl: string;
  token: string;
}

export interface HomeAssistantConfigResponse {
  connected: boolean;
  message: string;
  instanceName?: string;
}

export interface HaRoom {
  id: string;
  name: string;
}

export interface HaSensor {
  entityId: string;
  friendlyName: string;
  kind: HaSensorKind;
  areaId?: string;
  areaName?: string;
  unit?: string;
  value?: number;
  fromAttribute: boolean;
}

export interface HomeAssistantRoomsSensorsResponse {
  connected: boolean;
  rooms: HaRoom[];
  sensors: HaSensor[];
  message: string;
}

export interface PlantRoomBindingRequest {
  areaId?: string;
  areaName?: string;
  selectionMode: HaSelectionMode;
  temperatureEntityId?: string;
  humidityEntityId?: string;
  soilMoistureEntityId?: string;
  illuminanceEntityId?: string;
  autoAdjustmentEnabled?: boolean;
  maxAdjustmentFraction?: number;
}

export interface PlantConditionsResponse {
  plantId: number;
  plantName: string;
  sampledAt?: string;
  temperatureC?: number;
  humidityPercent?: number;
  soilMoisturePercent?: number;
  illuminanceLux?: number;
  illuminanceWarning?: string;
  autoAdjustmentEnabled: boolean;
  adjustedToday: boolean;
  latestAdjustmentPercent?: number;
  source?: string;
}

export interface PlantConditionPoint {
  sampledAt: string;
  temperatureC?: number;
  humidityPercent?: number;
  soilMoisturePercent?: number;
  illuminanceLux?: number;
}

export interface PlantConditionsHistoryResponse {
  plantId: number;
  days: number;
  points: PlantConditionPoint[];
  adjustedToday: boolean;
  latestAdjustmentPercent?: number;
  latestAdjustmentReason?: string;
}
