export async function clientStorageGet(key: string): Promise<string | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(key);
}

export async function clientStorageSet(key: string, value: string): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(key, value);
}
