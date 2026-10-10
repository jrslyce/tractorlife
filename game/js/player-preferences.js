// Visual-only preferences. Gameplay state intentionally never enters this store.
export const PREFERENCES_VERSION = 1;
export const PREFERENCES_STORAGE_KEY = 'tractor-player-preferences-v1';

export const DEFAULT_PREFERENCES = Object.freeze({
  textScale: 'standard',
  hudDetail: 'full',
  highContrast: false,
  largerControls: false,
  reducedMotion: false,
});

const textScales = new Set(['standard', 'large', 'larger']);
const hudDetails = new Set(['focused', 'full']);

function normalize(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PREFERENCES };
  return {
    textScale: textScales.has(value.textScale) ? value.textScale : DEFAULT_PREFERENCES.textScale,
    hudDetail: hudDetails.has(value.hudDetail) ? value.hudDetail : DEFAULT_PREFERENCES.hudDetail,
    highContrast: value.highContrast === true,
    largerControls: value.largerControls === true,
    reducedMotion: value.reducedMotion === true,
  };
}

function storageOrNull() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function getPreferences() {
  const storage = storageOrNull();
  if (!storage) return { ...DEFAULT_PREFERENCES };
  try {
    const parsed = JSON.parse(storage.getItem(PREFERENCES_STORAGE_KEY));
    if (!parsed || parsed.version !== PREFERENCES_VERSION) return { ...DEFAULT_PREFERENCES };
    return normalize(parsed.preferences);
  } catch { return { ...DEFAULT_PREFERENCES }; }
}

export function setPreferences(changes) {
  const next = normalize({ ...getPreferences(), ...(changes && typeof changes === 'object' ? changes : {}) });
  const storage = storageOrNull();
  if (storage) {
    try { storage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: PREFERENCES_VERSION, preferences: next })); } catch { /* Storage may be disabled or full. */ }
  }
  return next;
}

export function resetPreferences() {
  const storage = storageOrNull();
  if (storage) { try { storage.removeItem(PREFERENCES_STORAGE_KEY); } catch { /* best effort */ } }
  return { ...DEFAULT_PREFERENCES };
}

export function applyPreferences(preferences = getPreferences(), target = globalThis.document?.documentElement) {
  if (!target) return normalize(preferences);
  const value = normalize(preferences);
  target.dataset.textScale = value.textScale;
  target.dataset.hudDetail = value.hudDetail;
  target.dataset.highContrast = String(value.highContrast);
  target.dataset.largerControls = String(value.largerControls);
  target.dataset.reducedMotion = String(value.reducedMotion);
  target.style?.setProperty('--player-text-scale', value.textScale === 'larger' ? '1.25' : value.textScale === 'large' ? '1.12' : '1');
  return value;
}
