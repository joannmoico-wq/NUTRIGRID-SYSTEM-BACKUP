import { normalizeEnvironmentalPurokName, normalizePurokName } from './purok.js';

const IDENTITY_FIELDS_BY_CATEGORY = {
  residents: {
    names: [['household_head', 'head']],
    date: ['visit_date', 'lastVisit'],
  },
  pregnantwoman: {
    names: [['first_name', 'firstName'], ['middle_name', 'middleName'], ['last_name', 'lastName']],
    requiredNameIndexes: [0, 2],
    date: ['date_of_registration', 'dateRegistration'],
  },
  lactatingwoman: {
    names: [['first_name', 'firstName'], ['middle_name', 'middleName'], ['last_name', 'lastName']],
    requiredNameIndexes: [0, 2],
    date: ['date_of_registration', 'dateRegistration'],
  },
  monthlynatal: {
    names: [['mother_name', 'motherName'], ['child_name', 'childName']],
    date: ['dow'],
  },
  infantfeeding: {
    names: [['mother_name', 'motherName'], ['child_name', 'childName']],
    date: ['visit_date', 'visitDate'],
  },
};

const NON_RECORD_FIELDS = new Set([
  'id',
  'category',
  'purok',
  'created_at',
  'updated_at',
  'last_edited_at',
  'created_by_user_id',
  'visited_by',
  'synced',
  'status',
  'sync_status',
  'sync_error',
  'gps_lat',
  'gps_lng',
  'photo_url',
  'residents_photo',
  'environmental_sanitation_photo',
  'no',
  '_raw',
]);

const FIELD_ALIASES = [
  ['household_head', 'head'],
  ['first_name', 'firstName'],
  ['middle_name', 'middleName'],
  ['last_name', 'lastName'],
  ['date_of_registration', 'dateRegistration'],
  ['mother_name', 'motherName', 'name_of_mother'],
  ['child_name', 'childName', 'name_of_child'],
  ['visit_date', 'visitDate', 'lastVisit'],
];

const RECORD_CATEGORY_LABELS = {
  residents: 'Resident',
  environmental: 'Environmental Sanitation',
  infantfeeding: 'Infant Feeding',
  lactatingwoman: 'Lactating Woman',
  pregnantwoman: 'Pregnant Woman',
  monthlynatal: 'Monthly Natality',
};

function normalizedText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function readFirstValue(record, fieldNames) {
  for (const fieldName of fieldNames) {
    if (record[fieldName] != null && String(record[fieldName]).trim()) return record[fieldName];
  }
  return '';
}

function identityFor(category, record) {
  const identityFields = IDENTITY_FIELDS_BY_CATEGORY[category];
  if (!identityFields) return null;
  const names = identityFields.names.map((fieldNames) =>
    normalizedText(readFirstValue(record, fieldNames))
  );
  const date = normalizedText(readFirstValue(record, identityFields.date)).slice(0, 10);
  const requiredNames = identityFields.requiredNameIndexes || names.map((_, index) => index);
  if (requiredNames.some((index) => !names[index]) || !date) return null;
  return { names, date };
}

function normalizedPurok(value) {
  return normalizeEnvironmentalPurokName(value) ||
    normalizePurokName(value) ||
    normalizedText(value);
}

function samePurok(left, right) {
  return normalizedPurok(left?.purok) === normalizedPurok(right?.purok);
}

function normalizedFieldValue(value) {
  if (value == null) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return normalizedText(value);
}

function sameEnteredInformation(left, right) {
  const fields = new Set([
    ...Object.keys(left),
    ...Object.keys(right),
  ]);
  fields.delete('purok');
  const aliasedFields = new Set(FIELD_ALIASES.flat());
  const comparableFields = [...fields].filter((field) =>
    !NON_RECORD_FIELDS.has(field) && !aliasedFields.has(field)
  );
  const aliasesMatch = FIELD_ALIASES.every((aliases) => {
    const leftValue = readFirstValue(left, aliases);
    const rightValue = readFirstValue(right, aliases);
    if (!leftValue && !rightValue) return true;
    return normalizedFieldValue(leftValue) === normalizedFieldValue(rightValue);
  });
  if (!aliasesMatch) return false;
  const hasInformation = comparableFields.length > 0 ||
    FIELD_ALIASES.some((aliases) => aliases.some((field) =>
      Object.prototype.hasOwnProperty.call(left, field) ||
      Object.prototype.hasOwnProperty.call(right, field)
    ));
  return hasInformation && comparableFields.every((field) =>
    normalizedFieldValue(left[field]) === normalizedFieldValue(right[field])
  );
}

export function findRecordDuplicate(
  category,
  candidate,
  records,
  { ignoreId, includeEnvironmental = false } = {}
) {
  if (category === 'environmental' && !includeEnvironmental) return null;
  const identity = identityFor(category, candidate);
  const existingRecords = records.filter((record) =>
    ignoreId == null || String(record.id) !== String(ignoreId)
  );

  if (category === 'environmental') {
    const samePurokRecord = existingRecords.find((record) =>
      samePurok(record, candidate) && sameEnteredInformation(record, candidate)
    );
    if (samePurokRecord) return { type: 'same-purok', record: samePurokRecord };
  } else if (identity) {
    const samePurokRecord = existingRecords.find((record) => {
      const existingIdentity = identityFor(category, record);
      return samePurok(record, candidate) &&
        existingIdentity?.date === identity.date &&
        existingIdentity?.names.every((name, index) => name === identity.names[index]);
    });
    if (samePurokRecord) return { type: 'same-purok', record: samePurokRecord };
  }

  const differentPurokRecord = existingRecords.find((record) => {
    if (samePurok(record, candidate) || !sameEnteredInformation(record, candidate)) {
      return false;
    }
    if (category === 'environmental') return true;
    const existingIdentity = identityFor(category, record);
    return Boolean(
      identity &&
      existingIdentity?.date === identity.date &&
      existingIdentity.names.every((name, index) => name === identity.names[index])
    );
  });
  return differentPurokRecord
    ? { type: 'different-purok', record: differentPurokRecord }
    : null;
}

export function getDuplicateRecordName(category, record) {
  if (category === 'residents') {
    return readFirstValue(record, ['household_head', 'head']) || 'this household';
  }
  if (category === 'pregnantwoman' || category === 'lactatingwoman') {
    return [
      readFirstValue(record, ['first_name', 'firstName']),
      readFirstValue(record, ['middle_name', 'middleName']),
      readFirstValue(record, ['last_name', 'lastName']),
    ].filter(Boolean).join(' ') || 'this person';
  }
  if (category === 'monthlynatal' || category === 'infantfeeding') {
    const mother = readFirstValue(record, ['mother_name', 'motherName']);
    const child = readFirstValue(record, ['child_name', 'childName']);
    return [child, mother ? `(mother: ${mother})` : ''].filter(Boolean).join(' ') || 'this child';
  }
  return 'this record';
}

export function getRecordCategoryLabel(category) {
  return RECORD_CATEGORY_LABELS[category] || 'Record';
}

export function updateDuplicateRecord(
  existingRecord,
  submittedRecord,
  { preservePurok = false, preserveMissingPhotos = true } = {}
) {
  const updatedRecord = {
    ...existingRecord,
    ...submittedRecord,
    id: existingRecord.id,
    created_at: existingRecord.created_at || submittedRecord.created_at,
  };
  if (preservePurok) updatedRecord.purok = existingRecord.purok;
  if (preserveMissingPhotos) {
    for (const photoField of ['photo_url', 'residents_photo', 'environmental_sanitation_photo']) {
      if (!submittedRecord[photoField] && existingRecord[photoField]) {
        updatedRecord[photoField] = existingRecord[photoField];
      }
    }
  }
  return updatedRecord;
}
