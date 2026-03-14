const rawAuditMode = import.meta.env.VITE_TEST_AUDIT_MODE;

export function isTestAuditMode(): boolean {
  return rawAuditMode === 'true' || rawAuditMode === '1';
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? '';
}
