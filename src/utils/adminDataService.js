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
    wt_kg: 'weight_kg',
    ht_cm: 'height_cm',
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

function cacheSharedRecords(category, remoteRecords) {
  const key = STORAGE_KEY_BY_CATEGORY[category];
  const deletedIds = new Set(
    getPendingRecordDeletions()
      .filter((item) => item.category === category)
      .map((item) => String(item.recordId))
  );
  const remoteById = new Map(
    remoteRecords
      .filter((record) => !deletedIds.has(String(record.id)))
      .map((record) => [String(record.id), record])
  );

  getRecords(key)
    .filter((record) => !record.synced && !deletedIds.has(String(record.id)))
    .forEach((record) => remoteById.set(String(record.id), record));

  const records = Array.from(remoteById.values());
  setRecords(key, records);
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
    record.status = row.status || payload.status || 'Synced';
    record.synced = String(row.status || '').toLowerCase() === 'synced';
    return record;
  });
}

export async function loadAdminDataFromSupabase() {
  const [
    households,
    environmentalSanitationData,
    infantFeedingData,
    lactatingWomenData,
    pregnantWomenData,
    natalityData,
  ] = await Promise.all([
    readAllRows('residents', ADMIN_TABLES.residents),
    readAllRows('environmental', ADMIN_TABLES.environmental),
    readAllRows('infantfeeding', ADMIN_TABLES.infantfeeding),
    readAllRows('lactatingwoman', ADMIN_TABLES.lactatingwoman),
    readAllRows('pregnantwoman', ADMIN_TABLES.pregnantwoman),
    readAllRows('monthlynatal', ADMIN_TABLES.monthlynatal),
  ]);

  return {
    households: toAdminResidents(cacheSharedRecords('residents', households)),
    environmentalSanitationData: toAdminEnvironmental(cacheSharedRecords('environmental', environmentalSanitationData)),
    infantFeedingData: toAdminInfantFeeding(cacheSharedRecords('infantfeeding', infantFeedingData)),
    lactatingWomenData: toAdminLactating(cacheSharedRecords('lactatingwoman', lactatingWomenData)),
    pregnantWomenData: toAdminPregnant(cacheSharedRecords('pregnantwoman', pregnantWomenData)),
    natalityData: toAdminNatality(cacheSharedRecords('monthlynatal', natalityData)),
    monthlyReportData: reloadAllAdminData().monthlyReportData,
  };
}