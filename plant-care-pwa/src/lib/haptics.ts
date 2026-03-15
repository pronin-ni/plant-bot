const HAPTICS_ENABLED_STORAGE_KEY = 'settings:haptics-enabled';
const GLOBAL_THROTTLE_MS = 90;

type HapticKind = 'selection' | 'success' | 'warning' | 'error' | 'impact-light' | 'impact-medium' | 'impact-heavy';

type VibrationPattern = number | number[];

const DEFAULT_PATTERNS: Record<HapticKind, VibrationPattern> = {
  selection: 10,
  success: [20, 28, 20],
  warning: [24, 36, 18],
  error: [32, 40, 32],
  'impact-light': 14,
  'impact-medium': 22,
  'impact-heavy': [28, 22, 36]
};

const REDUCED_PATTERNS: Record<HapticKind, VibrationPattern> = {
  selection: 8,
  success: 16,
  warning: 18,
  error: [20, 24, 20],
  'impact-light': 10,
  'impact-medium': 14,
  'impact-heavy': 18
};

let lastTriggeredAt = 0;

function getNavigatorObject(): Navigator | null {
  return typeof navigator === 'undefined' ? null : navigator;
}

function supportsVibration(): boolean {
  const nav = getNavigatorObject();
  return Boolean(nav && typeof nav.vibrate === 'function');
}

function hasActiveUserGesture(): boolean {
  const nav = getNavigatorObject();
  const activation = nav?.userActivation;
  return activation ? activation.isActive : true;
}

function prefersReducedHaptics(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function normalizeStoredValue(value: string | null): boolean {
  return value !== '0' && value !== 'false';
}

export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return normalizeStoredValue(window.localStorage.getItem(HAPTICS_ENABLED_STORAGE_KEY));
}

export function setHapticsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(HAPTICS_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
}

export function isHapticsSupported(): boolean {
  return supportsVibration();
}

export function getHapticsStorageKey(): string {
  return HAPTICS_ENABLED_STORAGE_KEY;
}

function resolvePattern(kind: HapticKind): VibrationPattern {
  return prefersReducedHaptics() ? REDUCED_PATTERNS[kind] : DEFAULT_PATTERNS[kind];
}

function shouldSkipPlayback(): boolean {
  if (!supportsVibration()) {
    return true;
  }
  if (!isHapticsEnabled()) {
    return true;
  }
  if (!hasActiveUserGesture()) {
    return true;
  }

  const now = Date.now();
  if (now - lastTriggeredAt < GLOBAL_THROTTLE_MS) {
    return true;
  }

  lastTriggeredAt = now;
  return false;
}

function play(kind: HapticKind) {
  if (shouldSkipPlayback()) {
    return;
  }
  getNavigatorObject()?.vibrate(resolvePattern(kind));
}

export function selection() {
  play('selection');
}

export function success() {
  play('success');
}

export function warning() {
  play('warning');
}

export function error() {
  play('error');
}

export function impactLight() {
  play('impact-light');
}

export function impactMedium() {
  play('impact-medium');
}

export function impactHeavy() {
  play('impact-heavy');
}
