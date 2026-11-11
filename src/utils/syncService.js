import { supabase } from './supabaseClient';
import {
  getPendingRecordDeletions,
  getRecords,
  removePendingRecordDeletion,
  setRecords,
  upsertRecord,
  storageKeyForCategory,
} from './bnsStorage';
import { normalizePurokName } from './purok';

const TABLE_BY_CATEGORY = {
  residents: 'residents',
  environmental: 'environmental_sanitation',
  infantfeeding: 'infant_feeding',
  lactatingwoman: 'lactating_women',
  pregnantwoman: 'pregnant_women',
  monthlynatal: 'monthly_natality',
};

const RECORD_TABLES = {
  residents: {
    table: 'residents',
    idColumn: 'resident_id',
    fields: { residents_photo: 'photo_url', notes: 'notes' },
  },
  environmental: {
    table: 'environmental_sanitation',
    idColumn: 'env_san_id',
    fields: { environmental_sanitation_photo: 'photo_url', notes: 'notes' },
  },
  infantfeeding: { table: 'infant_feeding', idColumn: 'infant_id', fields: { notes: 'notes' } },
  lactatingwoman: {
    table: 'lactating_women',
    idColumn: 'lactating_id',
    fields: { wt: 'weight', ht: 'height', notes: 'notes', iron_folic_acid: 'iron_folic_acid' },
  },
  pregnantwoman: {
    table: 'pregnant_women',
    idColumn: 'pregnant_id',
    fields: { wt: 'weight', ht: 'height', notes: 'notes' },
  },
  monthlynatal: {
    table: 'monthly_natality',
    idColumn: 'natality_id',
    fields: {
      name_of_mother: 'mother_name',
      name_of_child: 'child_name',
      wt_kg: 'weight_kg',
      ht_cm: 'height_cm',
      remarks: 'remarks',
    },
  },
};

const REMOTE_PAGE_SIZE = 1000;

function localIdForRecord(category, record) {
  return String(record.id);
}
const FIELD_MAPPING_VERSION_KEY = 'bns_supabase_field_mapping_version';
const FIELD_MAPPING_VERSION = '3';
const PENDING_SYNC_LOGS_KEY = 'nutrigrid_pending_sync_logs';

// Older versions of the app saved records under these keys
const LEGACY_SOURCES = [
  { key: 'pendingVisits', category: 'residents' },
  { key: 'records_pregnant_woman', category: 'pregnantwoman' },
  { key: 'records_lactating_woman', category: 'lactatingwoman' },
  { key: 'records_infant_feeding', category: 'infantfeeding' },
];

const isUnsynced = (r) => !r.synced && String(r.status || '').toLowerCase() !== 'synced';

function isMissingOwnerColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    (
      message.includes('created_by_user_id') &&
      (message.includes('column') || message.includes('schema cache'))
    )
  );
}

async function readUserRows(table, idColumn, ownerColumn, userId) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(ownerColumn, userId)
      .order(idColumn, { ascending: true })
      .range(offset, offset + REMOTE_PAGE_SIZE - 1);

    if (error) return { rows: null, error };
    rows.push(...(data || []));
    if (!data || data.length < REMOTE_PAGE_SIZE) break;
    offset += REMOTE_PAGE_SIZE;
  }

  return { rows, error: null };
}

function normalizeRemoteRecord(category, row, userId) {
  const { idColumn, fields } = RECORD_TABLES[category];
  const payload = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? row.data
    : {};
  const record = { ...payload };

  Object.entries(fields).forEach(([column, field]) => {
    if (row[column] !== null && row[column] !== undefined) record[field] = row[column];
  });
  record.photo_url = record.photo_url ||
    row.residents_photo ||
    row.environmental_sanitation_photo ||
    record.residents_photo ||
    record.environmental_sanitation_photo ||
    null;

  record.id = payload.id ?? row.local_id ?? row[idColumn];
  record.category = payload.category || category;
  record.purok = row.purok ?? record.purok ?? '';
  record.created_at = row.created_at || payload.created_at;
  record.updated_at = payload.updated_at;
  record.created_by_user_id = row.created_by_user_id || payload.created_by_user_id || userId;
  record.status = 'Synced';
  record.synced = true;
  return record;
}

async function pullCategoryRecords(category, userId) {
  const { table, idColumn } = RECORD_TABLES[category];
  const primaryOwnerColumns = [
    'created_by_user_id',
    'data->>created_by_user_id',
  ];
  const rowsById = new Map();
  let successfulOwnerColumns = 0;
  const readOwnerColumns = async (ownerColumns) => {
    for (const ownerColumn of ownerColumns) {
      const result = await readUserRows(table, idColumn, ownerColumn, userId);
      if (result.error) {
        if (isMissingOwnerColumnError(result.error)) continue;
        throw new Error(`${table}: ${result.error.message}`);
      }
      successfulOwnerColumns += 1;
      result.rows.forEach((row) => {
        const key = String(row.local_id ?? row[idColumn] ?? row.data?.id ?? '');
        rowsById.set(key, row);
      });
    }
  };
  await readOwnerColumns(primaryOwnerColumns);
  if (!rowsById.size) await readOwnerColumns(['user_id', 'data->>user_id']);
  if (!successfulOwnerColumns) {
    throw new Error(`${table}: no supported record owner field was found.`);
  }
  const rows = [...rowsById.values()].filter((row) => {
    const owners = [
      row.created_by_user_id,
      row.user_id,
      row.data?.created_by_user_id,
      row.data?.user_id,
    ]
      .filter(Boolean)
      .map(String);
    return owners.length > 0 && owners.every((ownerId) => ownerId === String(userId));
  });

  const deletedIds = new Set(
    getPendingRecordDeletions()
      .filter((deletion) =>
        deletion.category === category &&
        String(deletion.created_by_user_id || '') === String(userId)
      )
      .map((deletion) => String(deletion.recordId))
  );
  const remoteRecords = rows
    .map((row) => normalizeRemoteRecord(category, row, userId))
    .filter((record) => record.id !== null && record.id !== undefined);
  const remoteById = new Map(
    remoteRecords
      .filter((record) => !deletedIds.has(String(record.id)))
      .map((record) => [String(record.id), record])
  );
  const storageKey = storageKeyForCategory(category);
  const localRecords = getRecords(storageKey);
  let changed = false;
  const mergedRecords = localRecords.map((record) => {
    if (String(record.created_by_user_id || '') !== String(userId)) return record;
    const remoteRecord = remoteById.get(String(record.id));
    if (!remoteRecord) return record;
    remoteById.delete(String(record.id));
    if (isUnsynced(record)) return record;
    if (Object.entries(remoteRecord).some(([field, value]) => record[field] !== value)) {
      changed = true;
    }
    return { ...record, ...remoteRecord };
  });

  if (remoteById.size) {
    mergedRecords.push(...remoteById.values());
    changed = true;
  }
  if (changed) setRecords(storageKey, mergedRecords);
  return remoteRecords.length;
}

export async function pullUserRecordsFromSupabase(userId) {
  if (!navigator.onLine) return { records: 0, skipped: 'offline', errors: [] };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { records: 0, skipped: 'not-signed-in', errors: [] };

  const activeUserId = userId || session.user.id;
  if (String(activeUserId) !== String(session.user.id)) {
    return { records: 0, errors: ['Refusing to fetch records for a different signed-in user.'] };
  }

  const results = await Promise.allSettled(
    Object.keys(RECORD_TABLES).map((category) => pullCategoryRecords(category, activeUserId))
  );
  const summary = { records: 0, errors: [] };
  results.forEach((result, index) => {
    const category = Object.keys(RECORD_TABLES)[index];
    if (result.status === 'fulfilled') {
      summary.records += result.value;
    } else {
      summary.errors.push(`${category}: ${result.reason.message}`);
    }
  });
  return summary;
}

function removeLegacyRecord(category, recordId) {
  for (const source of LEGACY_SOURCES.filter((item) => item.category === category)) {
    const records = readLegacy(source.key);
    const remaining = records.filter((record) => String(record.id) !== String(recordId));
    if (remaining.length !== records.length) {
      localStorage.setItem(source.key, JSON.stringify(remaining));
    }
  }
}

function getDeviceId() {
  let id = localStorage.getItem('bns_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('bns_device_id', id);
  }
  return id;
}

function readLegacy(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

const asNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function buildTableRecord(category, record, deviceId, localId, userId) {
  const recordOwnerId = record.created_by_user_id || userId;
  const shared = {
    created_by_user_id: recordOwnerId,
    device_id: deviceId,
    local_id: localId,
    purok: record.purok || null,
    status: 'Synced',
    data: record,
  };

  const fieldsByCategory = {
    residents: {
      household_head: record.household_head || null,
      total_members: asNumberOrNull(record.total_members),
      visit_date: record.visit_date || null,
      notes: record.notes || null,
      residents_photo: record.residents_photo || record.photo_url || null,
    },
    environmental: {
      total_hh: asNumberOrNull(record.total_hh),
      total_families: asNumberOrNull(record.total_families),
      compost_pit: record.compost_pit ?? false,
      garbage_collect: record.garbage_collect ?? false,
      garbage_others: record.garbage_others ?? false,
      water_level_i: record.water_level_i ?? false,
      water_level_ii: record.water_level_ii ?? false,
      water_level_iii: record.water_level_iii ?? false,
      without_potable_water: record.without_potable_water ?? false,
      toilet_sanitary: record.toilet_sanitary ?? false,
      toilet_not_sanitary: record.toilet_not_sanitary ?? false,
      household_smoker: record.household_smoker ?? false,
      selling_iodized_sari: record.selling_iodized_sari ?? false,
      selling_iodized_grocery: record.selling_iodized_grocery ?? false,
      selling_iodized_bakery: record.selling_iodized_bakery ?? false,
      selling_iodized_carenderia: record.selling_iodized_carenderia ?? false,
      selling_iodized_restaurant: record.selling_iodized_restaurant ?? false,
      selling_iodized_hotel: record.selling_iodized_hotel ?? false,
      selling_fortified_grocery: record.selling_fortified_grocery ?? false,
      selling_fortified_bakery: record.selling_fortified_bakery ?? false,
      selling_fortified_restaurant: record.selling_fortified_restaurant ?? false,
      selling_fortified_sari: record.selling_fortified_sari ?? false,
      selling_fortified_carenderia: record.selling_fortified_carenderia ?? false,
      selling_fortified_hotel: record.selling_fortified_hotel ?? false,
      establishments_hospital: record.establishments_hospital ?? false,
      establishments_hotel: record.establishments_hotel ?? false,
      establishments_restaurant: record.establishments_restaurant ?? false,
      establishments_carenderia: record.establishments_carenderia ?? false,
      establishments_bakery: record.establishments_bakery ?? false,
      establishments_grocery: record.establishments_grocery ?? false,
      establishments_sari: record.establishments_sari ?? false,
      visit_date: record.visit_date || null,
      notes: record.notes || null,
      environmental_sanitation_photo: record.environmental_sanitation_photo || record.photo_url || null,
    },
    infantfeeding: {
      mother_name: record.mother_name || null,
      child_name: record.child_name || null,
      feeding_1_week: record.feeding_1_week || null,
      feeding_1_month: record.feeding_1_month || null,
      feeding_2_month: record.feeding_2_month || null,
      feeding_3_month: record.feeding_3_month || null,
      feeding_4_month: record.feeding_4_month || null,
      feeding_5_month: record.feeding_5_month || null,
      notes: record.notes || null,
    },
    lactatingwoman: {
      date_of_registration: record.date_of_registration || null,
      family_serial_number: record.family_serial_number || null,
      last_name: record.last_name || null,
      first_name: record.first_name || null,
      middle_name: record.middle_name || null,
      spouse_name: record.spouse_name || null,
      contact_number: record.contact_number || null,
      birthday: record.birthday || null,
      age: asNumberOrNull(record.age),
      civil_status: record.civil_status || null,
      philhealth_member: record.philhealth_member || null,
      four_ps_beneficiary: record.four_ps_beneficiary || null,
      wt: asNumberOrNull(record.wt ?? record.weight),
      ht: asNumberOrNull(record.ht ?? record.height),
      bmi: asNumberOrNull(record.bmi),
      muac: asNumberOrNull(record.muac),
      iron_folic_acid: record.iron_folic_acid || null,
      date_delivered: record.date_delivered || null,
      notes: record.notes || null,
    },
    pregnantwoman: {
      date_of_registration: record.date_of_registration || null,
      family_serial_number: record.family_serial_number || null,
      last_name: record.last_name || null,
      first_name: record.first_name || null,
      middle_name: record.middle_name || null,
      spouse_name: record.spouse_name || null,
      contact_number: record.contact_number || null,
      birthday: record.birthday || null,
      age: asNumberOrNull(record.age),
      civil_status: record.civil_status || null,
      lmp: record.lmp || null,
      expected_date_of_delivery: record.expected_date_of_delivery || null,
      philhealth_member: record.philhealth_member || null,
      four_ps_beneficiary: record.four_ps_beneficiary || null,
      wt: asNumberOrNull(record.wt ?? record.weight),
      ht: asNumberOrNull(record.ht ?? record.height),
      bmi: asNumberOrNull(record.bmi),
      muac: asNumberOrNull(record.muac),
      iron_folic_acid: record.iron_folic_acid || null,
      iron_folic_acid_type: record.iron_folic_acid_type || null,
      notes: record.notes || null,
    },
    monthlynatal: {
      month: record.month || null,
      name_of_mother: record.name_of_mother || record.mother_name || null,
      mother_birthday: record.mother_birthday || null,
      mother_age: asNumberOrNull(record.mother_age),
      name_of_child: record.name_of_child || record.child_name || null,
      sex: record.sex || null,
      dob: record.dob || null,
      birth_weight: asNumberOrNull(record.birth_weight ?? record.birth_weight_kg),
      dow: record.dow || null,
      wt_kg: asNumberOrNull(record.wt_kg ?? record.weight_kg),
      ht_cm: asNumberOrNull(record.ht_cm ?? record.height_cm),
      aim: asNumberOrNull(record.aim),
      w_a: record.w_a || null,
      h_a: record.h_a || null,
      w_l_h: record.w_l_h || null,
      iron_status: record.iron_status || record.iron_given || null,
      vitamin_a: record.vitamin_a || null,
      vitamin_a_count: record.vitamin_a_count || null,
      fully_immunized: Boolean(record.fully_immunized),
      newborn_babies: Boolean(record.newborn_babies),
      remarks: record.remarks || record.notes || null,
    },
  };

  return { ...shared, ...(fieldsByCategory[category] || {}) };
}

// Upload one record. Returns an error message, or null on success.
async function uploadRecord(category, table, deviceId, localId, record, userId) {
  const payload = buildTableRecord(category, record, deviceId, localId, userId);
  const {
    created_by_user_id: _createdByUserId,
    device_id: _deviceId,
    local_id: _localId,
    ...updates
  } = payload;

  const { data: updated, error: updateError } = await supabase
    .from(table)
    .update(updates)
    .eq('data->>id', String(record.id))
    .eq('created_by_user_id', payload.created_by_user_id)
    .select('data');

  if (updateError) return updateError.message;
  if (updated?.length) return null;

  const { error } = await supabase.from(table).upsert(payload, {
    onConflict: 'device_id,local_id',
  });
  return error ? error.message : null;
}

function getPendingSyncLogs() {
  try {
    const logs = JSON.parse(localStorage.getItem(PENDING_SYNC_LOGS_KEY) || '[]');
    return Array.isArray(logs) ? logs : [];
  } catch (error) {
    console.error('Could not read queued sync logs:', error);
    return [];
  }
}

export async function flushPendingSyncLogs() {
  if (!navigator.onLine) return { errors: ['offline'] };
  const pending = getPendingSyncLogs();
  const remaining = [];
  const errors = [];
  for (const log of pending) {
    const { error } = await supabase.from('sync_log').insert(log);
    if (error) {
      remaining.push(log);
      errors.push(error.message);
    }
  }
  localStorage.setItem(PENDING_SYNC_LOGS_KEY, JSON.stringify(remaining));
  return { errors };
}

export async function writeSyncLog(userId, records, synced, failed) {
  if (records === 0) return null;

  const log = {
    user_id: userId,
    records,
    sync: synced,
    status: failed ? 'failed' : 'success',
  };
  const { error } = await supabase.from('sync_log').insert(log);
  if (!error) return null;

  const pending = getPendingSyncLogs();
  pending.push(log);
  localStorage.setItem(PENDING_SYNC_LOGS_KEY, JSON.stringify(pending));
  return error.message;
}

export async function syncPendingRecords({ includeShared = false } = {}) {
  if (!navigator.onLine) return { synced: 0, skipped: 'offline' };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { synced: 0, skipped: 'not-signed-in' };

  const deviceId = getDeviceId();
  const results = { synced: 0, records: 0, errors: [] };
  const pendingLogResult = await flushPendingSyncLogs();
  if (pendingLogResult.errors.length) {
    console.error('Previously queued sync logs are still waiting:', pendingLogResult.errors);
  }
  const reuploadExistingRecords = localStorage.getItem(FIELD_MAPPING_VERSION_KEY) !== FIELD_MAPPING_VERSION;

  for (const deletion of getPendingRecordDeletions()) {
    if (!deletion.created_by_user_id) continue;
    if (
      !includeShared &&
      String(deletion.created_by_user_id || '') !== String(session.user.id)
    ) continue;
    results.records++;
    const error = await deleteRemoteRecord(
      deletion.category,
      deletion.recordId,
      deletion.remoteExpected,
      deletion.created_by_user_id
    );
    if (error) {
      results.errors.push(`${deletion.category} #${deletion.recordId} delete: ${error}`);
      continue;
    }
    removeLegacyRecord(deletion.category, deletion.recordId);
    removePendingRecordDeletion(deletion.category, deletion.recordId);
    results.synced++;
  }

  // 1. Category storage (current app format)
  for (const [category, table] of Object.entries(TABLE_BY_CATEGORY)) {
    const storageKey = storageKeyForCategory(category);
    const records = getRecords(storageKey) || [];

    for (const record of records.filter(
      (item) =>
        Boolean(item.created_by_user_id) &&
        (includeShared ||
          String(item.created_by_user_id || '') === String(session.user.id)) &&
        (reuploadExistingRecords || isUnsynced(item))
    )) {
      results.records++;
      const err = await uploadRecord(
        category,
        table,
        deviceId,
        localIdForRecord(category, record),
        record,
        session.user.id
      );
      if (err) {
        results.errors.push(`${table} #${record.id}: ${err}`);
        continue;
      }
      const latestRecord = getRecords(storageKey).find(
        (item) => String(item.id) === String(record.id)
      );
      if (JSON.stringify(latestRecord) === JSON.stringify(record)) {
        upsertRecord(storageKey, { ...record, status: 'Synced', synced: true });
      }
      results.synced++;
    }
  }

  // 2. Legacy keys (older saves)
  for (const { key, category } of LEGACY_SOURCES) {
    const table = TABLE_BY_CATEGORY[category];
    const records = readLegacy(key);
    let changed = false;

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record.created_by_user_id) continue;
      if (getPendingRecordDeletions().some((deletion) =>
        deletion.category === category &&
        String(deletion.recordId) === String(record.id) &&
        String(deletion.created_by_user_id || '') === String(record.created_by_user_id || '')
      )) continue;
      if (
        !includeShared &&
        String(record.created_by_user_id || '') !== String(session.user.id)
      ) continue;
      if (!reuploadExistingRecords && !isUnsynced(record)) continue;

      results.records++;
      const err = await uploadRecord(category, table, deviceId, `${key}:${record.id}`, record, session.user.id);
      if (err) {
        results.errors.push(`${table} (${key}) #${record.id}: ${err}`);
        continue;
      }
      records[i] = {
        ...record,
        created_by_user_id: record.created_by_user_id,
        status: 'Synced',
        synced: true,
      };
      changed = true;
      results.synced++;
    }

    if (changed) localStorage.setItem(key, JSON.stringify(records));
  }

  const logError = await writeSyncLog(
    session.user.id,
    results.records,
    results.synced,
    results.errors.length > 0
  );
  if (logError) results.errors.push(`Could not write sync log: ${logError}`);

  if (results.errors.length) console.error('Sync errors:', results.errors);
  else localStorage.setItem(FIELD_MAPPING_VERSION_KEY, FIELD_MAPPING_VERSION);
  console.log(`Sync finished: ${results.synced} uploaded, ${results.errors.length} failed`);
  return results;
}

export async function syncSingleRecord(category, record, { includeShared = false } = {}) {
  if (!navigator.onLine) return 'offline';
  const table = TABLE_BY_CATEGORY[category];
  if (!table) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'not-signed-in';
  if (!record.created_by_user_id) return 'record-owner-missing';
  if (
    !includeShared &&
    String(record.created_by_user_id || '') !== String(session.user.id)
  ) {
    return 'record-owner-mismatch';
  }

  const error = await uploadRecord(
    category,
    table,
    getDeviceId(),
    localIdForRecord(category, record),
    record,
    session.user.id
  );
  const logError = await writeSyncLog(session.user.id, 1, error ? 0 : 1, Boolean(error));
  if (error) return logError ? `${error}; sync log failed: ${logError}` : error;
  return logError ? `Record synced, but sync log failed: ${logError}` : null;
}

export async function deleteRemoteRecord(
  category,
  localId,
  remoteRecordExpected = false,
  ownerId = ''
) {
  if (!navigator.onLine) return 'offline';
  const table = TABLE_BY_CATEGORY[category];
  if (!table) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'not-signed-in';

  const ownerIdToDelete = ownerId || session.user.id;
  const columnOwnerDelete = await supabase
    .from(table)
    .delete()
    .eq('data->>id', String(localId))
    .eq('created_by_user_id', ownerIdToDelete)
    .select('data');

  if (columnOwnerDelete.error && !isMissingOwnerColumnError(columnOwnerDelete.error)) {
    return columnOwnerDelete.error.message;
  }
  if (columnOwnerDelete.data?.length) return null;

  const payloadOwnerDelete = await supabase
    .from(table)
    .delete()
    .eq('data->>id', String(localId))
    .eq('data->>created_by_user_id', ownerIdToDelete)
    .select('data');

  if (payloadOwnerDelete.error) return payloadOwnerDelete.error.message;
  if (remoteRecordExpected && !payloadOwnerDelete.data?.length) {
    return 'The shared record was not deleted. Check that the Supabase DELETE policy is enabled.';
  }
  return null;
}

export async function getSharedHouseholdCountsByPurok() {
  const { data, error } = await supabase.rpc('get_shared_household_counts_by_purok');
  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    purok: row.purok,
    count: Number(row.household_count),
  }));
}

export async function getSharedHouseholdCountsByPurokForMonth(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error('Choose a valid month to filter household counts.');
  }
  const [year, month] = monthKey.split('-').map(Number);
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1);
  const dateStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const dateEnd = `${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}-01`;
  const createdAtStart = periodStart.toISOString();
  const createdAtEnd = periodEnd.toISOString();
  const counts = new Map();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('residents')
      .select('resident_id,purok,visit_date,created_at,data')
      .or(
        `and(visit_date.gte.${dateStart},visit_date.lt.${dateEnd}),and(visit_date.is.null,created_at.gte.${createdAtStart},created_at.lt.${createdAtEnd})`
      )
      .order('resident_id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Could not load household records for ${monthKey}: ${error.message}`);

    (data || []).forEach((row) => {
      const payload = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
        ? row.data
        : {};
      const dateValue =
        row.visit_date ||
        payload.visit_date ||
        payload.lastVisit ||
        row.created_at ||
        payload.created_at ||
        row.updated_at ||
        payload.updated_at;
      if (!dateValue) return;
      const dateOnly = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})/);
      const recordDate = dateOnly
        ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
        : new Date(dateValue);
      if (Number.isNaN(recordDate.getTime()) || recordDate < periodStart || recordDate >= periodEnd) return;

      const name = normalizePurokName(row.purok ?? payload.purok);
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });

    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  return Array.from(counts, ([purok, count]) => ({ purok, count }))
    .sort((left, right) => right.count - left.count || left.purok.localeCompare(right.purok, undefined, { numeric: true }))
    .slice(0, 10);
}