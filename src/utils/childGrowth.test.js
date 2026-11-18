import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateWhoBmiForAge } from './childGrowth.js';

test('calculates BMI and classification against WHO BMI-for-age standards', () => {
  const result = calculateWhoBmiForAge({
    sex: 'boys',
    birthday: '2025-01-01',
    weighingDate: '2025-01-01',
    weightKg: 3.351725,
    lengthCm: 50,
  });

  assert.deepEqual(result, { bmi: '13.4', classification: 'Normal' });
});

test('does not calculate BMI-for-age from measurements outside WHO reference ranges', () => {
  const result = calculateWhoBmiForAge({
    sex: 'boys',
    birthday: '2025-01-01',
    weighingDate: '2025-01-01',
    weightKg: 25,
    lengthCm: 12,
  });

  assert.deepEqual(result, { bmi: '', classification: 'Not assessed' });
});

test('uses standing height for children aged 24 months and older', () => {
  const result = calculateWhoBmiForAge({
    sex: 'girls',
    birthday: '2024-01-01',
    weighingDate: '2026-01-01',
    weightKg: 12,
    lengthCm: 50,
    heightCm: 90,
  });

  assert.equal(result.bmi, '14.8');
  assert.notEqual(result.classification, 'Not assessed');
});
