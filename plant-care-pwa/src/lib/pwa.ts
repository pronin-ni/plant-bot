import { registerSW } from 'virtual:pwa-register';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let installAvailable = false;
const installListeners = new Set<(available: boolean) => void>();

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

export async function ensurePushSubscription(vapidPublicKey: string): Promise<PushSubscription | null> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
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
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) {
    return null;
  }
  const endpoint = existing.endpoint;
  await existing.unsubscribe();
  return endpoint;
}
