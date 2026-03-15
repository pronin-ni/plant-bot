export const SETTINGS_CITY_KEY = 'settings:weather-city';
export const NOTIFICATION_TIME_KEY = 'settings:notification-time';
export const NOTIFICATION_PATTERN_KEY = 'settings:notification-pattern';

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

export function normalizeWeatherCity(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const lowered = normalized.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') {
    return null;
  }
  return normalized;
}

export async function fetchOpenMeteoCities(query: string, signal?: AbortSignal): Promise<string[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=5&language=ru&name=${encodeURIComponent(query.trim())}`;
    const response = await fetch(url, { signal });
    const payload = (await response.json()) as { results?: Array<{ name: string; country?: string }> };
    return Array.from(
      new Set((payload.results ?? []).map((item) => (item.country ? `${item.name}, ${item.country}` : item.name)))
    );
  } catch {
    return [];
  }
}

export function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray.buffer;
}
