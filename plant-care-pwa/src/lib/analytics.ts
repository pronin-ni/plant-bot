import { useAuthStore } from '@/lib/store';
import { apiFetch } from '@/lib/api';

type MigrationEvent = {
  type: 'migration_started' | 'migration_completed' | 'pwa_engaged';
  timestamp: number;
  userId?: string;
  version: string;
};

const ANALYTICS_VERSION = '1.0.0';
const ANALYTICS_ENDPOINT = '/api/analytics/migration';

export async function trackMigrationEvent(event: Omit<MigrationEvent, 'timestamp' | 'version'>) {
  const auth = useAuthStore.getState();
  const payload: MigrationEvent = {
    ...event,
    timestamp: Date.now(),
    userId: auth.telegramUserId?.toString(),
    version: ANALYTICS_VERSION
  };

  try {
    await apiFetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch {
    // Fail silently - analytics are non-critical
  }
}

export async function getMigrationStats() {
  try {
    return await apiFetch<{
      pwaUsers: number;
      tmaUsers: number;
      migrationRate: number;
      lastUpdated: string;
    }>(`${ANALYTICS_ENDPOINT}/stats`, { method: 'GET' });
  } catch {
    return {
      pwaUsers: 0,
      tmaUsers: 1,
      migrationRate: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}