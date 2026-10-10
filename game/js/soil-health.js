// Deterministic per-tile soil health, rotation, and harvest grading rules.
export const SOIL_MIN = 0;
export const SOIL_MAX = 100;
export const SOIL_START = 72;

export function cropGrowthFactor(fertility, rotated = false) {
  const normalized = Math.max(SOIL_MIN, Math.min(SOIL_MAX, Number(fertility) || 0)) / SOIL_MAX;
  return 0.75 + normalized * 0.5 + (rotated ? 0.08 : 0);
}

export function cropGrade({ fertility, cropType, previousCrop, pests = 0 }) {
  const soil = Math.max(0, Math.min(100, Number(fertility) || 0));
  const rotation = previousCrop && previousCrop !== cropType ? 12 : 0;
  const score = Math.max(0, Math.min(100, soil + rotation - (pests ? 18 : 0)));
  return score >= 82 ? 'premium' : score >= 48 ? 'standard' : 'low';
}

export function harvestSoil(fertility, cropType) {
  const afterUse = Math.max(SOIL_MIN, Math.min(SOIL_MAX, Number(fertility) || 0) - 9);
  // Peas are a legume and return a modest amount of nitrogen to the plot.
  return Math.min(SOIL_MAX, afterUse + (cropType === 'peas' ? 13 : 0));
}

export function plantRotation(previousCrop, cropType) {
  return !!previousCrop && previousCrop !== cropType;
}
