import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatPhilippineDateTime,
  getPhilippineMonthKey,
  getPhilippineMonthRange,
} from './philippineDateTime.js';

test('formats UTC timestamps in Philippine local time', () => {
  const formatted = formatPhilippineDateTime('2026-11-21T08:55:00.000Z', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  assert.match(formatted, /4:55\s?PM/i);
});

test('uses Philippine local month for activity log dates', () => {
  assert.equal(getPhilippineMonthKey(new Date('2026-10-31T16:30:00.000Z')), '2026-11');
});

test('builds month query bounds from Philippine midnight', () => {
  assert.deepEqual(getPhilippineMonthRange('2026-11'), {
    start: '2026-10-31T16:00:00.000Z',
    end: '2026-11-30T16:00:00.000Z',
  });
  assert.equal(getPhilippineMonthRange('2026-13'), null);
});
