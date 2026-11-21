const PHILIPPINE_TIME_ZONE = 'Asia/Manila';
const PHILIPPINE_UTC_OFFSET_HOURS = 8;

export function formatPhilippineDateTime(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat('en-PH', {
    ...options,
    timeZone: PHILIPPINE_TIME_ZONE,
  }).format(date);
}

export function getPhilippineMonthKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}-${month}`;
}

export function getPhilippineMonthRange(monthKey) {
  const match = String(monthKey || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  const toPhilippineMonthStart = (monthIndex) =>
    new Date(
      Date.UTC(year, monthIndex, 1) - PHILIPPINE_UTC_OFFSET_HOURS * 60 * 60 * 1000
    ).toISOString();

  return {
    start: toPhilippineMonthStart(month - 1),
    end: toPhilippineMonthStart(month),
  };
}
