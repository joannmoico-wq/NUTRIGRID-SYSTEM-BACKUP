import { supabase } from './supabaseClient';
import { getRecords, upsertRecord, storageKeyForCategory } from './bnsStorage';

const TABLE_BY_CATEGORY = {
  residents: 'residents',
  environmental: 'environmental_sanitation',
  infantfeeding: 'infant_feeding',
  lactatingwoman: 'lactating_women',
  pregnantwoman: 'pregnant_women',
  monthlynatal: 'monthly_natality',
  monthlyreport: 'monthly_report_lines',
};

function localIdForRecord(category, record) {
  if (category === 'monthlyreport' && record.slug) return String(record.slug);
  return String(record.id);
}
const FIELD_MAPPING_VERSION_KEY = 'bns_supabase_field_mapping_version';
const FIELD_MAPPING_VERSION = '3';

// Older versions of the app saved records under these keys
const LEGACY_SOURCES = [
  { key: 'pendingVisits', category: 'residents' },
  { key: 'records_pregnant_woman', category: 'pregnantwoman' },
  { key: 'records_lactating_woman', category: 'lactatingwoman' },
  { key: 'records_infant_feeding', category: 'infantfeeding' },
];

const isUnsynced = (r) => !r.synced && String(r.status || '').toLowerCase() !== 'synced';

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
  const shared = {
    created_by_user_id: userId,
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
      toilet_sanitary: record.toilet_sanitary ?? false,
      toilet_not_sanitary: record.toilet_not_sanitary ?? false,
      selling_iodized_sari: record.selling_iodized_sari ?? false,
      selling_iodized_grocery: record.selling_iodized_grocery ?? false,
      selling_iodized_bakery: record.selling_iodized_bakery ?? false,
      selling_iodized_carenderia: record.selling_iodized_carenderia ?? false,
      selling_fortified_grocery: record.selling_fortified_grocery ?? false,
      selling_fortified_bakery: record.selling_fortified_bakery ?? false,
      selling_fortified_restaurant: record.selling_fortified_restaurant ?? false,
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
      date_delivered: record.date_delivered || null,
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
    },
    monthlynatal: {
      month: record.month || null,
      name_of_mother: record.name_of_mother || record.mother_name || null,
      mother_age: asNumberOrNull(record.mother_age),
      name_of_child: record.name_of_child || record.child_name || null,
      dob: record.dob || null,
      dow: record.dow || null,
      wt_kg: asNumberOrNull(record.wt_kg ?? record.weight_kg),
      ht_cm: asNumberOrNull(record.ht_cm ?? record.height_cm),
      aim: asNumberOrNull(record.aim),
      w_a: record.w_a || null,
      h_a: record.h_a || null,
      w_l_h: record.w_l_h || null,
    },
    monthlyreport: {
      category_label: record.groupLabel || record.category_label || null,
      subcategory: record.subcategory || null,
      is_header: record.isHeader ?? false,
      m1_m: asNumberOrNull(record.m1M),
      m1_f: asNumberOrNull(record.m1F),
      m2_m: asNumberOrNull(record.m2M),
      m2_f: asNumberOrNull(record.m2F),
      m3_m: asNumberOrNull(record.m3M),
      m3_f: asNumberOrNull(record.m3F),
      t_m: asNumberOrNull(record.tM),
      t_f: asNumberOrNull(record.tF),
      barangay: record.barangay || null,
      report_year: asNumberOrNull(record.reportYear ?? record.report_year),
      sort_order: asNumberOrNull(record.sortOrder ?? record.sort_order),
      line_slug: record.slug || null,
    },
  };

  return { ...shared, ...(fieldsByCategory[category] || {}) };
}

// Upload one record. Returns an error message, or null on success.
async function uploadRecord(category, table, deviceId, localId, record, userId) {
  const { error } = await supabase.from(table).upsert(
    buildTableRecord(category, record, deviceId, localId, userId),
    { onConflict: 'device_id,local_id' }
  );
  return error ? error.message : null;
}

export async function syncPendingRecords() {
  if (!navigator.onLine) return { synced: 0, skipped: 'offline' };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { synced: 0, skipped: 'not-signed-in' };

  const deviceId = getDeviceId();
  const results = { synced: 0, errors: [] };
  const reuploadExistingRecords = localStorage.getItem(FIELD_MAPPING_VERSION_KEY) !== FIELD_MAPPING_VERSION;

  // 1. Category storage (current app format)
  for (const [category, table] of Object.entries(TABLE_BY_CATEGORY)) {
    // Monthly report UI is local-only until the Supabase table exists.
    if (category === 'monthlyreport') continue;
    const storageKey = storageKeyForCategory(category);
    const records = getRecords(storageKey) || [];

    for (const record of records.filter((item) => reuploadExistingRecords || isUnsynced(item))) {
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
      upsertRecord(storageKey, { ...record, status: 'Synced', synced: true });
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
      if (!reuploadExistingRecords && !isUnsynced(record)) continue;

      const err = await uploadRecord(category, table, deviceId, `${key}:${record.id}`, record, session.user.id);
      if (err) {
        results.errors.push(`${table} (${key}) #${record.id}: ${err}`);
        continue;
      }
      records[i] = { ...record, status: 'Synced', synced: true };
      changed = true;
      results.synced++;
    }

    if (changed) localStorage.setItem(key, JSON.stringify(records));
  }

  if (results.errors.length) console.error('Sync errors:', results.errors);
  else localStorage.setItem(FIELD_MAPPING_VERSION_KEY, FIELD_MAPPING_VERSION);
  console.log(`Sync finished: ${results.synced} uploaded, ${results.errors.length} failed`);
  return results;
}

export async function syncSingleRecord(category, record) {
  if (!navigator.onLine) return 'offline';
  const table = TABLE_BY_CATEGORY[category];
  if (!table) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'not-signed-in';

  return uploadRecord(
    category,
    table,
    getDeviceId(),
    localIdForRecord(category, record),
    record,
    session.user.id
  );
}

export async function deleteRemoteRecord(category, localId) {
  if (!navigator.onLine) return null;
  const table = TABLE_BY_CATEGORY[category];
  if (!table) return null;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 'not-signed-in';

  const { error } = await supabase
    .from(table)
    .delete()
    .eq('device_id', getDeviceId())
    .eq('local_id', localId);

  return error ? error.message : null;
}

export async function getSharedHouseholdCountsByPurok() {
  const { data, error } = await supabase.rpc('get_shared_household_counts_by_purok');
  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    purok: row.purok,
    count: Number(row.household_count),
  }));
}