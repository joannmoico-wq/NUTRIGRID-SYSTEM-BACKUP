import { supabase } from './supabaseClient';
import {
  getPendingRecordDeletions,
  getRecords,
  reloadAllAdminData,
  setRecords,
  STORAGE_KEYS,
  toAdminEnvironmental,
  toAdminInfantFeeding,
  toAdminLactating,
  toAdminNatality,
  toAdminPregnant,
  toAdminResidents,
} from './bnsStorage';

const PAGE_SIZE = 1000;

const ADMIN_TABLES = {
  residents: { table: 'residents', idColumn: 'resident_id' },
  environmental: { table: 'environmental_sanitation', idColumn: 'env_san_id' },
  infantfeeding: { table: 'infant_feeding', idColumn: 'infant_id' },
  lactatingwoman: { table: 'lactating_women', idColumn: 'lactating_id' },
  pregnantwoman: { table: 'pregnant_women', idColumn: 'pregnant_id' },
  monthlynatal: { table: 'monthly_natality', idColumn: 'natality_id' },
};

const COLUMN_MAPS = {
  residents: {
    household_head: 'household_head',
    total_members: 'total_members',
    visit_date: 'visit_date',
    notes: 'notes',
    residents_photo: 'photo_url',
  },
  environmental: {
    total_hh: 'total_hh',
    total_families: 'total_families',
    water_level_i: 'water_level_i',
    water_level_ii: 'water_level_ii',
    water_level_iii: 'water_level_iii',
    without_potable_water: 'without_potable_water',
    toilet_sanitary: 'toilet_sanitary',
    toilet_not_sanitary: 'toilet_not_sanitary',
    visit_date: 'visit_date',
    environmental_sanitation_photo: 'photo_url',
  },
  infantfeeding: {
    mother_name: 'mother_name',
    child_name: 'child_name',
    feeding_1_week: 'feeding_1_week',
    feeding_1_month: 'feeding_1_month',
    feeding_2_month: 'feeding_2_month',
    feeding_3_month: 'feeding_3_month',
    feeding_4_month: 'feeding_4_month',
    feeding_5_month: 'feeding_5_month',
  },
  lactatingwoman: {
    wt: 'weight',
    ht: 'height',
  },
  pregnantwoman: {
    wt: 'weight',
    ht: 'height',
  },
  monthlynatal: {
    name_of_mother: 'mother_name',
    name_of_child: 'child_name',
    sex: 'sex',
    dob: 'dob',
    birth_weight: 'birth_weight',
    wt_kg: 'weight_kg',
    ht_cm: 'height_cm',
    length_cm: 'length_cm',
    dow: 'dow',
    w_a: 'w_a',
    h_a: 'h_a',
    w_l_h: 'w_l_h',
    iron_status: 'iron_status',
    remarks: 'remarks',
  },
};

const STORAGE_KEY_BY_CATEGORY = {
  residents: STORAGE_KEYS.residents,
  environmental: STORAGE_KEYS.environmental,
  infantfeeding: STORAGE_KEYS.infantfeeding,
  lactatingwoman: STORAGE_KEYS.lactatingwoman,
  pregnantwoman: STORAGE_KEYS.pregnantwoman,
  monthlynatal: STORAGE_KEYS.monthlynatal,
};

function cacheSharedRecords(category, remoteRecords, userId) {
  const key = STORAGE_KEY_BY_CATEGORY[category];
  const localRecords = getRecords(key);
  const deletedIds = new Set(
    getPendingRecordDeletions()
      .filter((item) =>
        item.category === category &&
        String(item.created_by_user_id || '') === String(userId || '')
      )
      .map((item) => String(item.recordId))
  );
  const remoteById = new Map(
    remoteRecords
      .filter((record) => !deletedIds.has(String(record.id)))
      .map((record) => [String(record.id), record])
  );

  const pendingForAdmin = localRecords.filter(
    (record) =>
      !record.synced &&
      String(record.created_by_user_id || '') === String(userId || '') &&
      !deletedIds.has(String(record.id))
  );
  pendingForAdmin
    .forEach((record) => remoteById.set(String(record.id), record));

  const records = Array.from(remoteById.values());
  const preservedPending = localRecords.filter(
    (record) => !record.synced && !pendingForAdmin.includes(record)
  );
  setRecords(key, [...records, ...preservedPending]);
  return records;
}

async function readAllRows(category, { table, idColumn }) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(idColumn, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const columnMap = COLUMN_MAPS[category];
  return rows.map((row) => {
    const payload = row.data && typeof row.data === 'object' ? row.data : {};
    const record = { ...payload };

    Object.entries(columnMap).forEach(([column, field]) => {
      if (row[column] !== null && row[column] !== undefined) {
        record[field] = row[column];
      }
    });

    record.purok = row.purok ?? record.purok ?? '';
    record.id = payload.id ?? row.local_id ?? row[idColumn];
    record.created_at = row.created_at || payload.created_at;
    record.created_by_user_id = row.created_by_user_id || payload.created_by_user_id || '';
    record.status = row.status || payload.status || 'Synced';
    record.synced = String(row.status || '').toLowerCase() === 'synced';
    return record;
  });
}

export async function loadAdminDataFromSupabase(userId) {
  const { data: { session } } = await supabase.auth.getSession();
  const activeUserId = userId || session?.user?.id || '';
  const results = await Promise.allSettled([
    // Keep Residents independent so another report table failure cannot hide the database household data.
    readAllRows('residents', ADMIN_TABLES.residents),
    readAllRows('environmental', ADMIN_TABLES.environmental),
    readAllRows('infantfeeding', ADMIN_TABLES.infantfeeding),
    readAllRows('lactatingwoman', ADMIN_TABLES.lactatingwoman),
    readAllRows('pregnantwoman', ADMIN_TABLES.pregnantwoman),
    readAllRows('monthlynatal', ADMIN_TABLES.monthlynatal),
  ]);

  const localFallbacks = [
    'residents',
    'environmental',
    'infantfeeding',
    'lactatingwoman',
    'pregnantwoman',
    'monthlynatal',
  ].map((category) => getRecords(STORAGE_KEY_BY_CATEGORY[category]));
  localFallbacks.forEach((records, index) => {
    localFallbacks[index] = records.filter(
      (record) =>
        record.synced ||
        String(record.status || '').toLowerCase() === 'synced' ||
        String(record.created_by_user_id || '') === String(activeUserId)
    );
  });
  const rowsFor = (index, category) => {
    const result = results[index];
    if (result.status === 'fulfilled') return result.value;
    console.error(`Could not load ${category} records from Supabase:`, result.reason);
    return localFallbacks[index];
  };

  const [
    households,
    environmentalSanitationData,
    infantFeedingData,
    lactatingWomenData,
    pregnantWomenData,
    natalityData,
  ] = [
    rowsFor(0, 'residents'),
    rowsFor(1, 'environmental'),
    rowsFor(2, 'infantfeeding'),
    rowsFor(3, 'lactatingwoman'),
    rowsFor(4, 'pregnantwoman'),
    rowsFor(5, 'monthlynatal'),
  ];

  return {
    households: toAdminResidents(cacheSharedRecords('residents', households, activeUserId)),
    environmentalSanitationData: toAdminEnvironmental(cacheSharedRecords('environmental', environmentalSanitationData, activeUserId)),
    infantFeedingData: toAdminInfantFeeding(cacheSharedRecords('infantfeeding', infantFeedingData, activeUserId)),
    lactatingWomenData: toAdminLactating(cacheSharedRecords('lactatingwoman', lactatingWomenData, activeUserId)),
    pregnantWomenData: toAdminPregnant(cacheSharedRecords('pregnantwoman', pregnantWomenData, activeUserId)),
    natalityData: toAdminNatality(cacheSharedRecords('monthlynatal', natalityData, activeUserId)),
    monthlyReportData: reloadAllAdminData(activeUserId).monthlyReportData,
  };
}