// This generation accompanies the explicitly requested production farm reset.
// Keep it stable across ordinary deployments; changing it logs everyone out
// and discards this game's old browser-local save caches on the next load.
export const FARM_GENERATION = 'names-2026-10-11';
export const OFFLINE_SAVE_PREFIX = 'vt-offline:' + FARM_GENERATION + ':';

export function prepareFarmStorage() {
  try {
    if (localStorage.getItem('vt-farm-generation') === FARM_GENERATION) return;
    const keys = typeof localStorage.key === 'function'
      ? Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      : Object.keys(localStorage);
    for (const key of keys) {
      if (key && key.startsWith('vt-offline:')) localStorage.removeItem(key);
    }
    for (const key of ['vt-name', 'vt-email', 'vt-code']) localStorage.removeItem(key);
    localStorage.setItem('vt-farm-generation', FARM_GENERATION);
  } catch (err) { /* Storage may be blocked; the new prefix still isolates old saves. */ }
}
