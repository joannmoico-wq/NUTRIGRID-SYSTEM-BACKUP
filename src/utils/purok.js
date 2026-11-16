export const PUROK_OPTIONS = Array.from({ length: 10 }, (_, index) => `Purok ${index + 1}`);
export const TASK_PUROK_OPTIONS = PUROK_OPTIONS;
export const ENVIRONMENTAL_PUROK_OPTIONS = [
  ...PUROK_OPTIONS.slice(0, 5),
  'Purok 6A',
  'Purok 6B',
  'Purok 7A',
  'Purok 7B',
  'Purok 8A',
  'Purok 8B',
  ...PUROK_OPTIONS.slice(8),
];
export const PUROK_FORM_OPTIONS = ENVIRONMENTAL_PUROK_OPTIONS;
export const PUROK_FILTER_OPTIONS = ENVIRONMENTAL_PUROK_OPTIONS;

export function getPurokNumber(value) {
  const match = String(value || '').trim().match(/^(?:purok\s*)?0*(\d+)$/i);
  const number = match ? Number(match[1]) : 0;
  return number >= 1 && number <= PUROK_OPTIONS.length ? number : 0;
}

export function normalizePurokName(value) {
  const number = getPurokNumber(value);
  return number ? `Purok ${number}` : '';
}

export function normalizeEnvironmentalPurokName(value) {
  const match = String(value || '').trim().match(/^(?:purok\s*)?0*(\d+)\s*([ab])?$/i);
  if (!match) return '';
  const number = Number(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  if (number < 1 || number > PUROK_OPTIONS.length || (suffix && (number < 6 || number > 8))) return '';
  return `Purok ${number}${suffix}`;
}

export function sortPurokCounts(counts) {
  const groupedCounts = new Map();
  counts.forEach(({ purok, count }) => {
    const name = normalizePurokName(purok);
    const value = Number(count);
    if (!name || !Number.isFinite(value) || value < 0) return;
    groupedCounts.set(name, (groupedCounts.get(name) || 0) + value);
  });

  return Array.from(groupedCounts, ([purok, count]) => ({ purok, count }))
    .sort((a, b) => b.count - a.count || getPurokNumber(a.purok) - getPurokNumber(b.purok))
    .slice(0, 10);
}
