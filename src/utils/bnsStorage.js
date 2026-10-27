import Dexie from 'dexie';
import { DEFAULT_MONTHLY_REPORT_LINES, mergeMonthlyReportLines } from './monthlyReportTemplate';

/** Shared localStorage keys (Field Worker + Admin) */
export const STORAGE_KEYS = {
  residents: 'records_residents',
  environmental: 'records_environmental',
  infantfeeding: 'records_infantfeeding',
  lactatingwoman: 'records_lactatingwoman',
  pregnantwoman: 'records_pregnantwoman',
  monthlynatal: 'records_monthlynatal',
  monthlyReport: 'bns_admin_monthly_report',
  pendingVisits: 'pendingVisits',
  accountProfiles: 'nutrigrid_account_profiles',
  activeAccount: 'nutrigrid_active_account',
  pendingRecordDeletions: 'nutrigrid_pending_record_deletions',
};

const CATEGORY_TABLES = {
  [STORAGE_KEYS.residents]: 'residents',
  [STORAGE_KEYS.environmental]: 'environmental',
  [STORAGE_KEYS.infantfeeding]: 'infantfeeding',
  [STORAGE_KEYS.lactatingwoman]: 'lactatingwoman',
  [STORAGE_KEYS.pregnantwoman]: 'pregnantwoman',
  [STORAGE_KEYS.monthlynatal]: 'monthlynatal',
};

class NutriGridDatabase extends Dexie {
  constructor() {
    super('nutriGrid');
    this.version(1).stores({
      residents: 'id',
      environmental: 'id',
      infantfeeding: 'id',
      lactatingwoman: 'id',
      pregnantwoman: 'id',
      monthlynatal: 'id',
      syncQueue: '++queueId, category, recordId, updatedAt',
    });
    this.version(2).stores({
      residents: 'id',
      environmental: 'id',
      infantfeeding: 'id',
      lactatingwoman: 'id',
      pregnantwoman: 'id',
      monthlynatal: 'id',
      syncQueue: '++queueId, category, recordId, updatedAt',
      accounts: 'contact',
    });
  }
}

export const bnsDatabase = new NutriGridDatabase();

const tableForStorageKey = (key) =>
  CATEGORY_TABLES[key] ? bnsDatabase.table(CATEGORY_TABLES[key]) : null;

function publishRecords(key, records) {
  localStorage.setItem(key, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent('bns-records-changed', { detail: { key } }));
}

function persistCategoryRecords(key, records) {
  const table = tableForStorageKey(key);
  if (!table) return;
  void bnsDatabase.transaction('rw', table, async () => {
    await table.clear();
    if (records.length) await table.bulkPut(records);
  }).catch((error) => {
    console.error(`Could not persist ${key} in IndexedDB:`, error);
  });
}

export async function initializeLocalDatabase() {
  await bnsDatabase.open();
  for (const key of Object.keys(CATEGORY_TABLES)) {
    const table = tableForStorageKey(key);
    const localStorageValue = localStorage.getItem(key);
    if (localStorageValue !== null) {
      const localRecords = getRecords(key);
      await bnsDatabase.transaction('rw', table, async () => {
        await table.clear();
        if (localRecords.length) await table.bulkPut(localRecords);
      });
      continue;
    }

    const indexedRecords = await table.toArray();
    if (indexedRecords.length) {
      publishRecords(key, indexedRecords);
      continue;
    }

    const legacyRecords = getRecords(key);
    if (legacyRecords.length) {
      await table.bulkPut(legacyRecords);
    }
  }

  const accounts = await bnsDatabase.table('accounts').toArray();
  if (accounts.length) {
    localStorage.setItem(
      STORAGE_KEYS.accountProfiles,
      JSON.stringify(accounts.map(({ fullName, age, contact, createdAt }) => ({
        fullName,
        age,
        contact,
        createdAt,
      })))
    );
  }
}

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function derivePasswordHash(password, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure local account storage is unavailable in this browser context. Open the installed app or use HTTPS.');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' },
    key,
    256
  );
}

export async function registerLocalAccount({ fullName, age, contact, password }) {
  const normalizedContact = contact.trim().toLowerCase();
  const accounts = bnsDatabase.table('accounts');
  if (await accounts.get(normalizedContact)) {
    throw new Error('An account with this email or phone number is already registered on this device.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await derivePasswordHash(password, salt);
  const account = {
    contact: normalizedContact,
    fullName: fullName.trim(),
    age: Number(age),
    passwordSalt: toHex(salt),
    passwordHash: toHex(passwordHash),
    createdAt: new Date().toISOString(),
  };
  await accounts.add(account);
  const profiles = getRecords(STORAGE_KEYS.accountProfiles);
  profiles.push({
    fullName: account.fullName,
    age: account.age,
    contact: account.contact,
    createdAt: account.createdAt,
  });
  localStorage.setItem(STORAGE_KEYS.accountProfiles, JSON.stringify(profiles));
  return { email: account.contact, fullName: account.fullName, age: account.age };
}

export async function authenticateLocalAccount({ contact, password }) {
  const normalizedContact = contact.trim().toLowerCase();
  const account = await bnsDatabase.table('accounts').get(normalizedContact);
  if (!account) throw new Error('No account is saved on this device for that email or phone number. Register while online first.');

  const salt = Uint8Array.from(account.passwordSalt.match(/.{2}/g), (byte) => parseInt(byte, 16));
  const actualHash = toHex(await derivePasswordHash(password, salt));
  let difference = actualHash.length ^ account.passwordHash.length;
  for (let index = 0; index < Math.min(actualHash.length, account.passwordHash.length); index += 1) {
    difference |= actualHash.charCodeAt(index) ^ account.passwordHash.charCodeAt(index);
  }
  if (difference !== 0) throw new Error('The password is incorrect.');

  return { email: account.contact, fullName: account.fullName, age: account.age };
}

export async function restoreLocalSession() {
  const contact = localStorage.getItem(STORAGE_KEYS.activeAccount);
  if (!contact) return null;

  const account = await bnsDatabase.table('accounts').get(contact);
  if (!account) {
    localStorage.removeItem(STORAGE_KEYS.activeAccount);
    return null;
  }

  return { email: account.contact, fullName: account.fullName, age: account.age };
}

export function saveLocalSession(userData) {
  localStorage.setItem(STORAGE_KEYS.activeAccount, userData.email.toLowerCase());
}

export function clearLocalSession() {
  localStorage.removeItem(STORAGE_KEYS.activeAccount);
}

export function getRecords(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

export function setRecords(key, records, change = null) {
  publishRecords(key, records);
  persistCategoryRecords(key, records);
  if (change) {
    window.dispatchEvent(new CustomEvent('bns-records-changed', { detail: { key, ...change } }));
  }
}

export function deleteRecordById(key, id) {
  setRecords(
    key,
    getRecords(key).filter((r) => String(r.id) !== String(id)),
    { operation: 'delete', recordId: String(id) }
  );
}

export function upsertRecord(key, record) {
  const category = categoryIdForStorageKey(key);
  if (category) removePendingRecordDeletion(category, record.id);
  const list = getRecords(key);
  const idx = list.findIndex((r) => String(r.id) === String(record.id));
  if (idx >= 0) list[idx] = { ...list[idx], ...record };
  else list.push(record);
  setRecords(key, list, { operation: 'upsert', record });
}

export function getPendingRecordDeletions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.pendingRecordDeletions) || '[]');
  } catch (error) {
    console.error('Could not read pending record deletions:', error);
    return [];
  }
}

export function queueRecordDeletion(
  category,
  recordId,
  remoteExpected = false,
  createdByUserId = ''
) {
  const deletions = getPendingRecordDeletions();
  const existing = deletions.find(
    (item) => item.category === category && String(item.recordId) === String(recordId)
  );
  if (existing) {
    existing.remoteExpected = existing.remoteExpected || remoteExpected;
    existing.created_by_user_id = createdByUserId || existing.created_by_user_id || '';
  } else {
    deletions.push({
      category,
      recordId: String(recordId),
      remoteExpected,
      created_by_user_id: createdByUserId,
      queuedAt: new Date().toISOString(),
    });
  }
  localStorage.setItem(STORAGE_KEYS.pendingRecordDeletions, JSON.stringify(deletions));
}

export function removePendingRecordDeletion(category, recordId) {
  const deletions = getPendingRecordDeletions().filter(
    (item) => item.category !== category || String(item.recordId) !== String(recordId)
  );
  localStorage.setItem(STORAGE_KEYS.pendingRecordDeletions, JSON.stringify(deletions));
}

export function nextRecordId() {
  return Date.now();
}

const CATEGORY_STORAGE_MAP = {
  residents: STORAGE_KEYS.residents,
  environmental: STORAGE_KEYS.environmental,
  infantfeeding: STORAGE_KEYS.infantfeeding,
  lactatingwoman: STORAGE_KEYS.lactatingwoman,
  pregnantwoman: STORAGE_KEYS.pregnantwoman,
  monthlynatal: STORAGE_KEYS.monthlynatal,
  monthlyreport: STORAGE_KEYS.monthlyReport,
};

export function storageKeyForCategory(categoryId) {
  return CATEGORY_STORAGE_MAP[categoryId] || `records_${categoryId}`;
}

export function categoryIdForStorageKey(storageKey) {
  return (
    Object.entries(CATEGORY_STORAGE_MAP).find(([, key]) => key === storageKey)?.[0] || null
  );
}

function valueMatchesQuery(value, q, depth = 0) {
  if (value == null || depth > 4) return false;
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.some((item) => valueMatchesQuery(item, q, depth + 1));
    }
    return Object.values(value).some((item) => valueMatchesQuery(item, q, depth + 1));
  }
  return String(value).toLowerCase().includes(q);
}

export function recordMatchesSearch(record, query) {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return valueMatchesQuery(record, q);
}

export function filterRecordsBySearch(records, query) {
  if (!query.trim()) return records;
  return records.filter((r) => recordMatchesSearch(r, query));
}

/** Categories included in global search (field worker + admin) */
export const SEARCH_CATALOG = [
  { categoryId: 'residents', storageKey: STORAGE_KEYS.residents, categoryName: 'Residents', tab: 'residents' },
  {
    categoryId: 'environmental',
    storageKey: STORAGE_KEYS.environmental,
    categoryName: 'Environmental Sanitation',
    tab: 'environmentalSanitation',
  },
  { categoryId: 'infantfeeding', storageKey: STORAGE_KEYS.infantfeeding, categoryName: 'Infant Feeding', tab: 'infantFeeding' },
  { categoryId: 'lactatingwoman', storageKey: STORAGE_KEYS.lactatingwoman, categoryName: 'Lactating Woman', tab: 'lactatingWoman' },
  { categoryId: 'pregnantwoman', storageKey: STORAGE_KEYS.pregnantwoman, categoryName: 'Pregnant Woman', tab: 'pregnantWoman' },
  { categoryId: 'monthlynatal', storageKey: STORAGE_KEYS.monthlynatal, categoryName: 'Monthly Natality', tab: 'monthlyNatality' },
  {
    categoryId: 'monthlyReport',
    storageKey: STORAGE_KEYS.monthlyReport,
    categoryName: 'Monthly Report',
    tab: 'monthlyReport',
  },
];

export function getRecordDisplayTitle(data = {}) {
  return (
    data.household_head ||
    data.mother_name ||
    data.child_name ||
    [data.first_name, data.last_name].filter(Boolean).join(' ') ||
    data.purok ||
    data.subcategory ||
    data.category ||
    'Record'
  );
}

/** Flat list of all saved records for type-ahead search */
export function buildSavedRecords() {
  const saved = [];
  SEARCH_CATALOG.forEach(({ categoryId, storageKey, categoryName, tab }) => {
    getRecords(storageKey).forEach((record) => {
      saved.push({
        id: record.id,
        categoryId,
        categoryName,
        tab,
        data: record,
        timestamp: record.created_at || record.visit_date || record.date_of_registration || '',
        synced: Boolean(record.synced),
      });
    });
  });
  return saved;
}

/**
 * Case-insensitive, partial, multi-field search (category, all data fields, timestamp).
 */
export function performRecordSearch(savedRecords, query) {
  if (query.trim() === '') return [];

  const lowerQuery = query.toLowerCase();

  return savedRecords.filter((record) => {
    if (record.categoryName?.toLowerCase().includes(lowerQuery)) return true;

    for (const [, value] of Object.entries(record.data || {})) {
      if (value != null && typeof value !== 'object' && String(value).toLowerCase().includes(lowerQuery)) {
        return true;
      }
      if (value != null && typeof value === 'object' && recordMatchesSearch(value, query)) {
        return true;
      }
    }

    if (String(record.timestamp).toLowerCase().includes(lowerQuery)) return true;

    return false;
  });
}

export function countPendingAcrossCategories() {
  const keys = [
    STORAGE_KEYS.residents,
    STORAGE_KEYS.environmental,
    STORAGE_KEYS.infantfeeding,
    STORAGE_KEYS.lactatingwoman,
    STORAGE_KEYS.pregnantwoman,
    STORAGE_KEYS.monthlynatal,
  ];
  let pending = 0;
  keys.forEach((key) => {
    getRecords(key).forEach((r) => {
      if (!r.synced) pending += 1;
    });
  });
  const visits = getRecords(STORAGE_KEYS.pendingVisits).filter((v) => !v.synced);
  const queuedDeletions = getPendingRecordDeletions().length;
  return pending + visits.length + queuedDeletions;
}

// --- Admin table mappers (read from field-worker shape) ---

export function toAdminResidents(records) {
  return records.map((r, i) => ({
    id: r.id ?? i + 1,
    purok: r.purok || '—',
    head: r.household_head || '—',
    members: r.total_members ?? '—',
    status: r.synced ? 'Synced' : 'Pending',
    lastVisit: r.visit_date || (r.created_at ? r.created_at.split('T')[0] : '—'),
    _raw: r,
  }));
}

export function fromAdminResident(row) {
  const raw = row._raw || {};
  return {
    ...raw,
    id: row.id || nextRecordId(),
    category: 'residents',
    purok: row.purok,
    household_head: row.head,
    total_members: row.members,
    visit_date: row.lastVisit,
    synced: row.status === 'Synced',
    status: 'pending',
    created_at: raw.created_at || new Date().toISOString(),
  };
}

export function toAdminInfantFeeding(records) {
  return records.map((r, i) => ({
    id: r.id ?? i + 1,
    no: String(i + 1).padStart(2, '0'),
    purok: r.purok || '—',
    motherName: r.mother_name || '—',
    childName: r.child_name || '—',
    week1: r.feeding_1_week || '—',
    month1: r.feeding_1_month || '—',
    month2: r.feeding_2_month || '—',
    month3: r.feeding_3_month || '—',
    month4: r.feeding_4_month || '—',
    month5: r.feeding_5_month || '—',
    status: r.status || (r.synced ? 'Synced' : 'Pending'),
    _raw: r,
  }));
}

export function fromAdminInfantFeeding(row) {
  const raw = row._raw || {};
  return {
    ...raw,
    id: row.id || nextRecordId(),
    category: 'infantfeeding',
    purok: row.purok,
    mother_name: row.motherName,
    child_name: row.childName,
    feeding_1_week: row.week1,
    feeding_1_month: row.month1,
    feeding_2_month: row.month2,
    feeding_3_month: row.month3,
    feeding_4_month: row.month4,
    feeding_5_month: row.month5,
    synced: false,
    status: 'pending',
    created_at: raw.created_at || new Date().toISOString(),
  };
}

export function toAdminLactating(records) {
  return records.map((r, i) => ({
    id: r.id ?? i + 1,
    no: i + 1,
    purok: r.purok || '—',
    dateRegistration: r.date_of_registration || '—',
    familySerial: r.family_serial_number || '—',
    lastName: r.last_name || '—',
    firstName: r.first_name || '—',
    middleName: r.middle_name || '—',
    spouseName: r.spouse_name || '—',
    contactNumber: r.contact_number || '—',
    birthday: r.birthday || '—',
    age: r.age ?? '—',
    civilStatus: r.civil_status || '—',
    philhealth: r.philhealth_member || '—',
    fourPs: r.four_ps_beneficiary || '—',
    wt: r.weight ?? '—',
    ht: r.height ?? '—',
    bmi: r.bmi ?? '—',
    muac: r.muac ?? '—',
    dateDelivered: r.date_delivered || '—',
    status: r.status || (r.synced ? 'Synced' : 'Pending'),
    _raw: r,
  }));
}

export function fromAdminLactating(row) {
  const raw = row._raw || {};
  return {
    ...raw,
    id: row.id || nextRecordId(),
    category: 'lactatingwoman',
    purok: row.purok,
    date_of_registration: row.dateRegistration,
    family_serial_number: row.familySerial,
    last_name: row.lastName,
    first_name: row.firstName,
    middle_name: row.middleName,
    spouse_name: row.spouseName,
    contact_number: row.contactNumber,
    birthday: row.birthday,
    age: row.age,
    civil_status: row.civilStatus,
    philhealth_member: row.philhealth,
    four_ps_beneficiary: row.fourPs,
    weight: row.wt,
    height: row.ht,
    bmi: row.bmi,
    muac: row.muac,
    date_delivered: row.dateDelivered,
    synced: false,
    status: 'pending',
    created_at: raw.created_at || new Date().toISOString(),
  };
}

export function toAdminPregnant(records) {
  return records.map((r, i) => ({
    id: r.id ?? i + 1,
    no: i + 1,
    purok: r.purok || '—',
    dateRegistration: r.date_of_registration || '—',
    familySerial: r.family_serial_number || '—',
    lastName: r.last_name || '—',
    firstName: r.first_name || '—',
    middleName: r.middle_name || '—',
    spouseName: r.spouse_name || '—',
    contactNumber: r.contact_number || '—',
    birthday: r.birthday || '—',
    age: r.age ?? '—',
    civilStatus: r.civil_status || '—',
    lmp: r.lmp || '—',
    expectedDelivery: r.expected_date_of_delivery || '—',
    philhealth: r.philhealth_member || '—',
    fourPs: r.four_ps_beneficiary || '—',
    wt: r.weight ?? '—',
    ht: r.height ?? '—',
    bmi: r.bmi ?? '—',
    muac: r.muac ?? '—',
    status: r.status || (r.synced ? 'Synced' : 'Pending'),
    _raw: r,
  }));
}

export function fromAdminPregnant(row) {
  const raw = row._raw || {};
  return {
    ...raw,
    id: row.id || nextRecordId(),
    category: 'pregnantwoman',
    purok: row.purok,
    date_of_registration: row.dateRegistration,
    family_serial_number: row.familySerial,
    last_name: row.lastName,
    first_name: row.firstName,
    middle_name: row.middleName,
    spouse_name: row.spouseName,
    contact_number: row.contactNumber,
    birthday: row.birthday,
    age: row.age,
    civil_status: row.civilStatus,
    lmp: row.lmp,
    expected_date_of_delivery: row.expectedDelivery,
    philhealth_member: row.philhealth,
    four_ps_beneficiary: row.fourPs,
    weight: row.wt,
    height: row.ht,
    bmi: row.bmi,
    muac: row.muac,
    synced: false,
    status: 'pending',
    created_at: raw.created_at || new Date().toISOString(),
  };
}

export function toAdminNatality(records) {
  return records.map((r, i) => ({
    id: r.id ?? i + 1,
    no: i + 1,
    purok: r.purok || '—',
    motherName: r.mother_name || '—',
    childName: r.child_name || '—',
    sex: r.sex === 'boys' ? 'Male' : r.sex === 'girls' ? 'Female' : '—',
    dob: r.dob || '—',
    birthWeight: r.birth_weight ?? r.birth_weight_kg ?? '—',
    dow: r.dow || '—',
    weight: r.weight_kg ?? '—',
    length: r.length_cm ?? '—',
    height: r.height_cm ?? '—',
    aim: r.aim ?? '—',
    wA: r.w_a || '—',
    hA: r.h_a || '—',
    wLH: r.w_l_h || '—',
    ironStatus: r.iron_status || r.iron_given || '—',
    remarks: r.remarks || r.notes || '—',
    month: r.month || '—',
    status: r.status || (r.synced ? 'Synced' : 'Pending'),
    _raw: r,
  }));
}

export function fromAdminNatality(row) {
  const raw = row._raw || {};
  return {
    ...raw,
    id: row.id || nextRecordId(),
    category: 'monthlynatal',
    purok: row.purok,
    birth_weight: row.birthWeight,
    mother_name: row.motherName,
    child_name: row.childName,
    sex: row.sex === 'Male' ? 'boys' : row.sex === 'Female' ? 'girls' : '',
    dob: row.dob,
    dow: row.dow,
    weight_kg: row.weight,
    length_cm: row.length,
    height_cm: row.height,
    aim: row.aim,
    w_a: row.wA,
    h_a: row.hA,
    w_l_h: row.wLH,
    iron_status: row.ironStatus,
    remarks: row.remarks,
    month: row.month,
    synced: false,
    status: 'pending',
    created_at: raw.created_at || new Date().toISOString(),
  };
}

export function fromAdminEnvironmental(row) {
  const raw = row._raw || {};
  const asBool = (v) => Number(v) > 0;
  return {
    ...raw,
    id: row.id || nextRecordId(),
    category: 'environmental',
    purok: row.purok,
    total_hh: Number(row.totalHH) || raw.total_hh || 0,
    total_families: Number(row.totalFamilies) || raw.total_families || 0,
    compost_pit: asBool(row.garbageCompostPit),
    garbage_collect: asBool(row.garbageCollect),
    garbage_others: asBool(row.garbageOthers),
    water_level_i: asBool(row.waterLevelI),
    water_level_ii: asBool(row.waterLevelII),
    water_level_iii: asBool(row.waterLevelIII),
    without_potable_water: asBool(row.withoutPotableWater),
    toilet_sanitary: asBool(row.toiletWithSanitary),
    toilet_not_sanitary: asBool(row.toiletWithoutSanitary),
    selling_iodized_sari: asBool(row.iodizedSaltSariSari),
    selling_fortified_grocery: asBool(row.fortifiedFoodsGrocery),
    establishments_bakery: asBool(row.estBakery),
    establishments_carenderia: asBool(row.estCarenderia),
    establishments_restaurant: asBool(row.estRestaurant),
    establishments_hotel: asBool(row.estHotelRest),
    establishments_hospital: asBool(row.estHospital),
    synced: false,
    status: 'pending',
    created_at: raw.created_at || new Date().toISOString(),
  };
}

export function toAdminEnvironmental(records) {
  return records.map((r, i) => ({
    id: r.id ?? i + 1,
    purok: r.purok || '—',
    totalHH: r.total_hh ?? '—',
    totalFamilies: r.total_families ?? '—',
    garbageCompostPit: r.compost_pit ? 1 : 0,
    garbageCollect: r.garbage_collect ? 1 : 0,
    garbageOthers: r.garbage_others ? 1 : 0,
    waterLevelI: r.water_level_i ? 1 : 0,
    waterLevelII: r.water_level_ii ? 1 : 0,
    waterLevelIII: r.water_level_iii ? 1 : 0,
    withoutPotableWater: r.without_potable_water ? 1 : 0,
    toiletWithSanitary: r.toilet_sanitary ? 1 : 0,
    toiletWithoutSanitary: r.toilet_not_sanitary ? 1 : 0,
    iodizedSaltSariSari: r.selling_iodized_sari ? 1 : 0,
    iodizedSaltGrocery: r.selling_iodized_grocery ? 1 : 0,
    iodizedSaltBakery: r.selling_iodized_bakery ? 1 : 0,
    iodizedSaltCarenderia: r.selling_iodized_carenderia ? 1 : 0,
    fortifiedFoodsGrocery: r.selling_fortified_grocery ? 1 : 0,
    fortifiedFoodsBakery: r.selling_fortified_bakery ? 1 : 0,
    fortifiedFoodsRestaurant: r.selling_fortified_restaurant ? 1 : 0,
    estBakery: r.establishments_bakery ? 1 : 0,
    estCarenderia: r.establishments_carenderia ? 1 : 0,
    estRestaurant: r.establishments_restaurant ? 1 : 0,
    estHotelRest: r.establishments_hotel ? 1 : 0,
    estHospital: r.establishments_hospital ? 1 : 0,
    estGrocery: r.establishments_grocery ? 1 : 0,
    estSari: r.establishments_sari ? 1 : 0,
    visitDate: r.visit_date || '—',
    notes: r.notes || '—',
    environmentalSanitationPhoto: r.environmental_sanitation_photo || '—',
    status: r.status || (r.synced ? 'Synced' : 'Pending'),
    _raw: r,
  }));
}

export function reloadAllAdminData(userId) {
  let monthlyReportData = getRecords(STORAGE_KEYS.monthlyReport);
  if (monthlyReportData.length === 0) {
    monthlyReportData = DEFAULT_MONTHLY_REPORT_LINES;
    setRecords(STORAGE_KEYS.monthlyReport, monthlyReportData);
  } else {
    monthlyReportData = mergeMonthlyReportLines(monthlyReportData);
  }

  const getOwnedRecords = (key) => {
    const records = getRecords(key);
    return userId
      ? records.filter(
          (record) =>
            record.synced ||
            String(record.status || '').toLowerCase() === 'synced' ||
            String(record.created_by_user_id || '') === String(userId)
        )
      : records;
  };

  return {
    households: toAdminResidents(getOwnedRecords(STORAGE_KEYS.residents)),
    environmentalSanitationData: toAdminEnvironmental(getOwnedRecords(STORAGE_KEYS.environmental)),
    infantFeedingData: toAdminInfantFeeding(getOwnedRecords(STORAGE_KEYS.infantfeeding)),
    lactatingWomenData: toAdminLactating(getOwnedRecords(STORAGE_KEYS.lactatingwoman)),
    pregnantWomenData: toAdminPregnant(getOwnedRecords(STORAGE_KEYS.pregnantwoman)),
    natalityData: toAdminNatality(getOwnedRecords(STORAGE_KEYS.monthlynatal)),
    monthlyReportData,
  };
}
