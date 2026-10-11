// Shared browser/Worker policy. Names are stable, case-insensitive save keys.
// Legacy emails remain valid identifiers so existing farms are not re-keyed.
const LEGACY_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._'’\-]*$/u;

export function formatFarmerName(value) {
  if (typeof value !== 'string' || value.length > 256) return '';
  const trimmed = value.trim();
  // The registry uses this prefix for private password records, not farmer names.
  if (trimmed.toLowerCase().startsWith('account:')) return '';
  if (trimmed.length <= 120 && LEGACY_EMAIL.test(trimmed)) return trimmed;
  const name = trimmed.normalize('NFKC').replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= 64 && NAME.test(name) ? name : '';
}

export function normalizeFarmerName(value) {
  const formatted = formatFarmerName(value);
  const normalized = formatted.toLowerCase();
  return normalized.length <= (LEGACY_EMAIL.test(formatted) ? 120 : 64) ? normalized : '';
}
