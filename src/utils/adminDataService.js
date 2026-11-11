import { supabase } from './supabaseClient';
import {
  getPendingRecordDeletions,
  getDeletedMonthlyReportSlugs,
  getRecords,
  setRecords,
  STORAGE_KEYS,
  toAdminEnvironmental,
  toAdminInfantFeeding,
  toAdminLactating,
  toAdminNatality,
  toAdminPregnant,
  toAdminResidents,
} from './bnsStorage';
import { DEFAULT_MONTHLY_REPORT_LINES, mergeMonthlyReportLines } from './monthlyReportTemplate';

const PAGE_SIZE = 1000;
const MONTHLY_REPORT_TABLE = 'monthly_report';
const MONTHLY_REPORT_BARANGAY = DEFAULT_MONTHLY_REPORT_LINES[0].barangay;
const MONTHLY_REPORT_YEAR = DEFAULT_MONTHLY_REPORT_LINES[0].reportYear;

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
    male_count: 'male_count',
    female_count: 'female_count',
    total_population: 'total_population',
    hh_with_occupation: 'hh_with_occupation',
    electricity_owned: 'electricity_owned',
    electricity_connected: 'electricity_connected',
    has_veg_garden: 'has_veg_garden',
    has_herbal_garden: 'has_herbal_garden',
    has_backyard_poultry: 'has_backyard_poultry',
    has_swine: 'has_swine',
    has_fish_pond: 'has_fish_pond',
    uses_iodized_salt: 'uses_iodized_salt',
    has_malunggay_tree: 'has_malunggay_tree',
    child_re: 'child_re',
    father_re: 'father_re',
    household_nonsmoker: 'household_nonsmoker',
    household_smoker: 'household_smoker',
    water_source: 'water_source',
    toilet_type: 'toilet_type',
    water_level_i: 'water_level_i',
    water_level_ii: 'water_level_ii',
    water_level_iii: 'water_level_iii',
    without_potable_water: 'without_potable_water',
    toilet_sanitary: 'toilet_sanitary',
    toilet_not_sanitary: 'toilet_not_sanitary',
    selling_iodized_restaurant: 'selling_iodized_restaurant',
    selling_iodized_hotel: 'selling_iodized_hotel',
    selling_fortified_sari: 'selling_fortified_sari',
    selling_fortified_carenderia: 'selling_fortified_carenderia',
    selling_fortified_hotel: 'selling_fortified_hotel',
    visit_date: 'visit_date',
    notes: 'notes',
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
    notes: 'notes',
  },
  lactatingwoman: {
    wt: 'weight',
    ht: 'height',
    notes: 'notes',
  },
  pregnantwoman: {
    wt: 'weight',
    ht: 'height',
    notes: 'notes',
  },
  monthlynatal: {
    name_of_mother: 'mother_name',
    mother_birthday: 'mother_birthday',
    mother_age: 'mother_age',
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
  localRecords.forEach((localRecord) => {
    const remoteRecord = remoteById.get(String(localRecord.id));
    if (!remoteRecord) return;
    const photo = remoteRecord.photo_url ||
      remoteRecord.residents_photo ||
      remoteRecord.environmental_sanitation_photo ||
      localRecord.photo_url ||
      localRecord.residents_photo ||
      localRecord.environmental_sanitation_photo;
    if (photo) remoteById.set(String(localRecord.id), { ...remoteRecord, photo_url: photo });
  });

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
    record.photo_url = record.photo_url ||
      row.residents_photo ||
      row.environmental_sanitation_photo ||
      record.residents_photo ||
      record.environmental_sanitation_photo ||
      null;

    record.purok = row.purok ?? record.purok ?? '';
    record.id = payload.id ?? row.local_id ?? row[idColumn];
    record.created_at = row.created_at || payload.created_at;
    record.updated_at = payload.updated_at;
    record.created_by_user_id = row.created_by_user_id || payload.created_by_user_id || '';
    record.status = row.status || payload.status || 'Synced';
    record.synced = String(row.status || '').toLowerCase() === 'synced';
    return record;
  });
}

function monthlyReportFromRow(row) {
  return {
    id: row.monthly_report_id,
    slug: row.slug,
    indicator: row.indicator,
    category: row.category || row.indicator,
    subcategory: row.subcategory || '',
    groupLabel: row.group_label || row.category || row.indicator,
    isHeader: row.is_header,
    sortOrder: row.sort_order,
    barangay: row.barangay,
    reportYear: row.report_year,
    reportQuarter: row.report_quarter || 1,
    month1Name: row.month_1_name || 'January',
    month2Name: row.month_2_name || 'February',
    month3Name: row.month_3_name || 'March',
    m1M: row.m1_male,
    m1F: row.m1_female,
    m2M: row.m2_male,
    m2F: row.m2_female,
    m3M: row.m3_male,
    m3F: row.m3_female,
    tM: row.total_male,
    tF: row.total_female,
    status: 'Synced',
    synced: true,
  };
}

export async function saveMonthlyReportLine(line) {
  const { data, error } = await supabase
    .from(MONTHLY_REPORT_TABLE)
    .upsert({
      slug: line.slug,
      indicator: line.indicator,
      category: line.category || line.indicator,
      subcategory: line.subcategory || null,
      group_label: line.groupLabel || line.category || line.indicator,
      is_header: Boolean(line.isHeader),
      sort_order: Number(line.sortOrder) || 0,
      barangay: line.barangay || MONTHLY_REPORT_BARANGAY,
      report_year: Number(line.reportYear) || MONTHLY_REPORT_YEAR,
      report_quarter: Number(line.reportQuarter) || 1,
      month_1_name: line.month1Name || 'January',
      month_2_name: line.month2Name || 'February',
      month_3_name: line.month3Name || 'March',
      m1_male: Number(line.m1M) || 0,
      m1_female: Number(line.m1F) || 0,
      m2_male: Number(line.m2M) || 0,
      m2_female: Number(line.m2F) || 0,
      m3_male: Number(line.m3M) || 0,
      m3_female: Number(line.m3F) || 0,
    }, { onConflict: 'barangay,report_year,report_quarter,slug' })
    .select('*')
    .single();

  if (error) throw new Error(`Could not save monthly report to Supabase: ${error.message}`);
  return monthlyReportFromRow(data);
}

export async function deleteMonthlyReportLine(line) {
  const { error } = await supabase
    .from(MONTHLY_REPORT_TABLE)
    .delete()
    .eq('barangay', line.barangay || MONTHLY_REPORT_BARANGAY)
    .eq('report_year', Number(line.reportYear) || MONTHLY_REPORT_YEAR)
    .eq('report_quarter', Number(line.reportQuarter) || 1)
    .eq('slug', line.slug);

  if (error) throw new Error(`Could not delete monthly report line from Supabase: ${error.message}`);
}

async function readMonthlyReportLines() {
  const { data, error } = await supabase
    .from(MONTHLY_REPORT_TABLE)
    .select('*')
    .eq('barangay', MONTHLY_REPORT_BARANGAY)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`${MONTHLY_REPORT_TABLE}: ${error.message}`);
  return (data || []).map(monthlyReportFromRow);
}

export async function loadAdminDataFromSupabase(userId, { onRecordsLoaded } = {}) {
  let sessionUserId = '';
  if (!userId) {
    const { data: { session } } = await supabase.auth.getSession();
    sessionUserId = session?.user?.id || '';
  }
  const activeUserId = userId || sessionUserId;
  const categoryResultsPromise = Promise.allSettled([
    readAllRows('residents', ADMIN_TABLES.residents),
    readAllRows('environmental', ADMIN_TABLES.environmental),
    readAllRows('infantfeeding', ADMIN_TABLES.infantfeeding),
    readAllRows('lactatingwoman', ADMIN_TABLES.lactatingwoman),
    readAllRows('pregnantwoman', ADMIN_TABLES.pregnantwoman),
    readAllRows('monthlynatal', ADMIN_TABLES.monthlynatal),
  ]);
  const monthlyReportPromise = readMonthlyReportLines()
    .then((data) => ({ data }), (error) => ({ error }));
  const results = await categoryResultsPromise;

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
  const coreData = {
    households: toAdminResidents(cacheSharedRecords('residents', households, activeUserId)),
    environmentalSanitationData: toAdminEnvironmental(cacheSharedRecords('environmental', environmentalSanitationData, activeUserId)),
    infantFeedingData: toAdminInfantFeeding(cacheSharedRecords('infantfeeding', infantFeedingData, activeUserId)),
    lactatingWomenData: toAdminLactating(cacheSharedRecords('lactatingwoman', lactatingWomenData, activeUserId)),
    pregnantWomenData: toAdminPregnant(cacheSharedRecords('pregnantwoman', pregnantWomenData, activeUserId)),
    natalityData: toAdminNatality(cacheSharedRecords('monthlynatal', natalityData, activeUserId)),
  };
  onRecordsLoaded?.(coreData);

  const monthlyReportResult = await monthlyReportPromise;
  const remoteMonthlyReportData = 'error' in monthlyReportResult
    ? (() => {
        console.error('Could not load monthly report lines from Supabase:', monthlyReportResult.error);
        return [];
      })()
    : monthlyReportResult.data;
  const localMonthlyReportData = getRecords(STORAGE_KEYS.monthlyReport);
  const deletedMonthlyReportSlugs = getDeletedMonthlyReportSlugs();
  const monthlyReportData = mergeMonthlyReportLines([
    ...localMonthlyReportData,
    ...remoteMonthlyReportData,
  ]).filter((record) => !deletedMonthlyReportSlugs.has(String(record.slug)));
  setRecords(STORAGE_KEYS.monthlyReport, monthlyReportData);

  return {
    ...coreData,
    monthlyReportData,
  };
}