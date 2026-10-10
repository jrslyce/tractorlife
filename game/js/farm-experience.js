// The selected experience controls simulation policy, not save contents.
// Legacy saves without a mode remain Full Farm to preserve existing behavior.
export const FARM_EXPERIENCE_MODES = Object.freeze(['simple', 'full']);

export function normalizeFarmExperience(value) {
  return value === 'simple' ? 'simple' : 'full';
}

export function advancedSystemsEnabled(value) {
  return normalizeFarmExperience(value) === 'full';
}
