import assert from 'node:assert/strict';
import test from 'node:test';
import { findRecordDuplicate, updateDuplicateRecord } from './recordDuplicates.js';

test('matches resident name and visit date in the same Purok', () => {
  const existing = {
    id: 'existing',
    household_head: 'Joann Moico',
    visit_date: '2026-11-20',
    purok: 'Purok 2',
    total_members: 4,
  };
  const candidate = { ...existing, id: 'new', total_members: 5 };

  assert.deepEqual(
    findRecordDuplicate('residents', candidate, [existing]),
    { type: 'same-purok', record: existing }
  );
});

test('does not match resident visits on different dates or Puroks', () => {
  const existing = {
    id: 'existing',
    household_head: 'Joann Moico',
    visit_date: '2026-11-20',
    purok: 'Purok 2',
  };

  assert.equal(findRecordDuplicate('residents', {
    ...existing,
    id: 'new',
    visit_date: '2026-11-21',
  }, [existing]), null);

  assert.equal(findRecordDuplicate('residents', {
    ...existing,
    id: 'new',
    purok: 'Purok 3',
    total_members: 5,
  }, [existing]), null);
});

test('finds an exact cross-Purok match without matching sync metadata', () => {
  const existing = {
    id: 'existing',
    household_head: 'Joann Moico',
    visit_date: '2026-11-20',
    purok: 'Purok 2',
    total_members: 4,
    synced: true,
  };

  assert.deepEqual(
    findRecordDuplicate('residents', {
      ...existing,
      id: 'new',
      purok: 'Purok 3',
      synced: false,
    }, [existing]),
    { type: 'different-purok', record: existing }
  );
});

test('matches cross-Purok records with legacy field aliases', () => {
  const existing = {
    id: 'existing',
    head: 'Joann Moico',
    lastVisit: '2026-11-20',
    purok: 'Purok 2',
    total_members: 4,
  };

  assert.deepEqual(
    findRecordDuplicate('residents', {
      id: 'new',
      household_head: 'Joann Moico',
      visit_date: '2026-11-20',
      purok: 'Purok 3',
      total_members: 4,
    }, [existing]),
    { type: 'different-purok', record: existing }
  );
});

test('matches cross-Purok records when the identity is the only entered information', () => {
  const existing = {
    id: 'existing',
    household_head: 'Joann Moico',
    visit_date: '2026-11-20',
    purok: 'Purok 2',
  };

  assert.deepEqual(
    findRecordDuplicate('residents', {
      id: 'new',
      household_head: 'Joann Moico',
      visit_date: '2026-11-20',
      purok: 'Purok 3',
    }, [existing]),
    { type: 'different-purok', record: existing }
  );
});

test('does not treat a record with a different visit date as a cross-Purok duplicate', () => {
  const existing = {
    id: 'existing',
    household_head: 'Joann Moico',
    visit_date: '2026-11-20',
    purok: 'Purok 2',
    total_members: 4,
  };

  assert.equal(findRecordDuplicate('residents', {
    ...existing,
    id: 'new',
    visit_date: '2026-11-21',
    purok: 'Purok 3',
  }, [existing]), null);
});

test('environmental duplicates require exact submitted fields and explicit PWA opt-in', () => {
  const existing = {
    id: 'existing',
    category: 'environmental',
    purok: 'Purok 2',
    visit_date: '2026-11-20',
    total_hh: 12,
    created_at: '2026-11-20T08:00:00Z',
  };
  const candidate = { ...existing, id: 'new', created_at: '2026-11-20T09:00:00Z' };

  assert.equal(findRecordDuplicate('environmental', candidate, [existing]), null);
  assert.deepEqual(
    findRecordDuplicate('environmental', candidate, [existing], { includeEnvironmental: true }),
    { type: 'same-purok', record: existing }
  );
  assert.equal(findRecordDuplicate('environmental', {
    ...candidate,
    total_hh: 13,
  }, [existing], { includeEnvironmental: true }), null);
});

test('Infant Feeding identity includes visit date', () => {
  const existing = {
    id: 'existing',
    mother_name: 'Maria Santos',
    child_name: 'Juan Santos',
    visit_date: '2026-11-20',
    purok: 'Purok 2',
  };

  assert.equal(findRecordDuplicate('infantfeeding', {
    ...existing,
    id: 'new',
    visit_date: '2026-12-20',
  }, [existing]), null);
});

test('Pregnant Woman identity allows an optional middle name and uses registration date', () => {
  const existing = {
    id: 'existing',
    first_name: 'Maria',
    last_name: 'Santos',
    date_of_registration: '2026-11-20',
    purok: 'Purok 2',
  };

  assert.deepEqual(
    findRecordDuplicate('pregnantwoman', {
      ...existing,
      id: 'new',
      middle_name: '',
    }, [existing]),
    { type: 'same-purok', record: existing }
  );
  assert.equal(findRecordDuplicate('pregnantwoman', {
    ...existing,
    id: 'new',
    date_of_registration: '2027-01-20',
  }, [existing]), null);
});

test('Monthly Natality identity uses the weighing date', () => {
  const existing = {
    id: 'existing',
    mother_name: 'Maria Santos',
    child_name: 'Juan Santos',
    dow: '2026-11-20',
    purok: 'Purok 2',
  };

  assert.equal(findRecordDuplicate('monthlynatal', {
    ...existing,
    id: 'new',
    dow: '2026-12-20',
  }, [existing]), null);
});

test('updates the matched record while preserving its ID, creation date, and Purok', () => {
  const existing = {
    id: 'existing',
    created_at: '2026-10-01T10:00:00Z',
    purok: 'Purok 2',
    household_head: 'Joann Moico',
  };
  const updated = updateDuplicateRecord({
    ...existing,
    notes: 'Existing photo',
    photo_url: 'data:image/jpeg;base64,photo',
  }, {
    ...existing,
    id: 'new',
    purok: 'Purok 3',
    created_at: '2026-11-20T10:00:00Z',
    notes: 'Updated notes',
    photo_url: null,
  }, { preservePurok: true });

  assert.equal(updated.id, 'existing');
  assert.equal(updated.created_at, existing.created_at);
  assert.equal(updated.purok, 'Purok 2');
  assert.equal(updated.notes, 'Updated notes');
  assert.equal(updated.photo_url, 'data:image/jpeg;base64,photo');
});
