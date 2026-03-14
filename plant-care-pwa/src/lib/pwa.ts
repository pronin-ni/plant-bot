import { registerSW } from 'virtual:pwa-register';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let installAvailable = false;
const installListeners = new Set<(available: boolean) => void>();
const SERVICE_WORKER_READY_TIMEOUT_MS = 4000;
const PUSH_RECEIPT_CACHE = 'plant-pwa-push-receipts';
const PUSH_RECEIPT_PATH = '__push-receipt__';

export interface PushReceipt {
  tag: string;
  title: string;
  body: string;
  url: string;
  receivedAt: number;
}

function notifyInstallListeners() {
  installListeners.forEach((listener) => listener(installAvailable));
}

function setInstallAvailability(available: boolean) {
  installAvailable = available;
  notifyInstallListeners();
}

export function initPwa() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    setInstallAvailability(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setInstallAvailability(false);
  });

  registerSW({
    immediate: true,
    onRegistered(registration) {
      if (!registration) {
        return;
      }
      // Периодический check обновлений SW, чтобы PWA быстрее подтягивал новые версии.
      setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('PWA SW registration failed:', error);
    }
  });
}

export function isPwaStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export function subscribeInstallAvailability(listener: (available: boolean) => void): () => void {
  installListeners.add(listener);
  listener(installAvailable);
  return () => installListeners.delete(listener);
}

export async function requestPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredInstallPrompt) {
    return 'unavailable';
  }
  await deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  setInstallAvailability(false);
  return result.outcome;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'unknown';

export function detectInstallPlatform(): InstallPlatform {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'ios';
  }
  if (/Android/i.test(ua)) {
    return 'android';
  }
  if (/Macintosh|Windows|Linux/i.test(ua)) {
    return 'desktop';
  }
  return 'unknown';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function waitForServiceWorkerRegistration(timeoutMs = SERVICE_WORKER_READY_TIMEOUT_MS): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('SERVICE_WORKER_UNAVAILABLE');
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }

  return await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error('SERVICE_WORKER_TIMEOUT')), timeoutMs);
    })
  ]);
}

export async function ensurePushSubscription(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }
  const registration = await waitForServiceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource
  });
}

export async function removePushSubscription(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  const registration = await waitForServiceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (!existing) {
    return null;
  }
  const endpoint = existing.endpoint;
  await existing.unsubscribe();
  return endpoint;
}

function getPushReceiptUrl(): string {
  return new URL(PUSH_RECEIPT_PATH, new URL(import.meta.env.BASE_URL, window.location.origin)).toString();
}

export async function getLocalPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }
  const registration = await waitForServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
}

export async function readLastPushReceipt(): Promise<PushReceipt | null> {
  if (!('caches' in window)) {
    return null;
  }
  const cache = await caches.open(PUSH_RECEIPT_CACHE);
  const response = await cache.match(getPushReceiptUrl());
  if (!response) {
    return null;
  }
  try {
    return (await response.json()) as PushReceipt;
  } catch {
    return null;
  }
}

export async function clearLastPushReceipt(): Promise<void> {
  if (!('caches' in window)) {
    return;
  }
  const cache = await caches.open(PUSH_RECEIPT_CACHE);
  await cache.delete(getPushReceiptUrl());
}

export function subscribeToPushReceipts(listener: (receipt: PushReceipt) => void): () => void {
  if (!('serviceWorker' in navigator)) {
    return () => {};
  }
  const handleMessage = (event: MessageEvent) => {
    const payload = event.data as { type?: string; receipt?: PushReceipt } | undefined;
    if (payload?.type === 'PUSH_RECEIPT' && payload.receipt) {
      listener(payload.receipt);
    }
  };
  navigator.serviceWorker.addEventListener('message', handleMessage);
  return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
}
