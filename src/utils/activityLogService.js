import { supabase } from './supabaseClient';

const ACTIVITY_TABLE = 'record_activity_logs';
const PENDING_ACTIVITY_KEY = 'nutrigrid_pending_record_activity';
const INTERNAL_FIELDS = new Set([
  'id',
  'category',
  'created_at',
  'updated_at',
  'created_by_user_id',
  'synced',
  'status',
  '_raw',
]);
const CATEGORY_LABELS = {
  residents: 'Residents',
  environmental: 'Environmental Sanitation',
  infantfeeding: 'Infant Feeding',
  lactatingwoman: 'Lactating Woman',
  pregnantwoman: 'Pregnant Woman',
  monthlynatal: 'Monthly Natality',
};
const FIELD_LABELS = {
  head: 'Household Head',
  household_head: 'Household Head',
  householdhead: 'Household Head',
  child_name: 'Child',
  name_of_child: 'Child',
  mother_name: 'Mother',
  mothername: 'Mother',
  family_serial_no: 'Family Serial No.',
  last_visit: 'Last Visit',
  visit_date: 'Visit Date',
  purok: 'Purok',
  notes: 'Notes',
  remarks: 'Remarks',
};

function readPendingActivityLogs() {
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_ACTIVITY_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.error('Could not read pending activity logs:', error);
    return [];
  }
}

function writePendingActivityLogs(logs) {
  try {
    localStorage.setItem(PENDING_ACTIVITY_KEY, JSON.stringify(logs));
    window.dispatchEvent(new Event('nutrigrid-activity-logs-changed'));
  } catch (error) {
    console.error('Could not save pending activity logs on this device:', error);
  }
}

function removePendingActivityLog(id) {
  writePendingActivityLogs(readPendingActivityLogs().filter((log) => log.id !== id));
}

function createId() {
  return globalThis.crypto?.randomUUID?.()
    || `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function comparableValue(value, field) {
  if (field.toLowerCase().includes('photo') || field.toLowerCase().includes('image')) {
    return value ? '[photo attached]' : '';
  }
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function fieldLabel(field) {
  const normalized = field.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  return FIELD_LABELS[normalized] || FIELD_LABELS[normalized.replace(/_/g, '')]
    || normalized.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getActivityCategoryLabel(category) {
  return CATEGORY_LABELS[category] || String(category || 'Records');
}

export function getActivityChanges(before, after) {
  if (!before || !after) return [];
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(fields)
    .filter((field) => !INTERNAL_FIELDS.has(field) && !field.startsWith('_'))
    .map((field) => ({
      field,
      label: fieldLabel(field),
      old_value: comparableValue(before[field], field).slice(0, 500),
      new_value: comparableValue(after[field], field).slice(0, 500),
    }))
    .filter(({ old_value, new_value }) => old_value !== new_value);
}

async function getCurrentActor(actorRole) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not verify the editor's account: ${error.message}`);
  const user = session?.user;
  if (!user) throw new Error('Sign in before recording an edit in the activity log.');
  return {
    actor_user_id: user.id,
    actor_name: user.user_metadata?.full_name
      || user.user_metadata?.name
      || user.user_metadata?.display_name
      || user.email
      || 'BHW',
    actor_role: String(actorRole || user.user_metadata?.role || 'field_worker').toLowerCase(),
  };
}

async function uploadActivityLog(log) {
  const { error } = await supabase.from(ACTIVITY_TABLE).insert(log);
  if (error && error.code !== '23505') throw new Error(error.message);
  removePendingActivityLog(log.id);
}

export async function recordInformationEdit({ category, recordId, before, after, actorRole }) {
  const changes = getActivityChanges(before, after);
  if (!changes.length) return null;

  try {
    const actor = await getCurrentActor(actorRole);
    const log = {
      id: createId(),
      ...actor,
      category,
      record_id: String(recordId ?? after.id ?? before.id ?? ''),
      field_changes: changes,
      created_at: new Date().toISOString(),
    };
    const pending = readPendingActivityLogs();
    writePendingActivityLogs([...pending.filter((item) => item.id !== log.id), log]);
    try {
      await uploadActivityLog(log);
    } catch (error) {
      console.error('Record edit was saved, but its activity log is waiting to sync:', error);
    }
    return log;
  } catch (error) {
    console.error('Record edit was saved, but its activity could not be recorded:', error);
    return null;
  }
}

export async function syncPendingActivityLogs() {
  const pending = readPendingActivityLogs();
  if (!pending.length) return { synced: 0, errors: [] };
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify the account for pending activity logs: ${authError.message}`);
  if (!user) return { synced: 0, errors: ['Not signed in'] };

  let synced = 0;
  const errors = [];
  for (const log of pending.filter((item) => item.actor_user_id === user.id)) {
    try {
      await uploadActivityLog(log);
      synced += 1;
    } catch (error) {
      console.error(`Could not sync activity log ${log.id}:`, error);
      errors.push(error.message);
    }
  }
  return { synced, errors };
}

export async function loadRecordActivityLogs(limit = 100) {
  const { data, error } = await supabase
    .from(ACTIVITY_TABLE)
    .select('id, actor_user_id, actor_name, actor_role, category, record_id, field_changes, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const pending = readPendingActivityLogs();
  const merged = new Map((data || []).map((log) => [log.id, log]));
  pending.forEach((log) => {
    if (!merged.has(log.id)) merged.set(log.id, { ...log, pending_sync: true });
  });
  return Array.from(merged.values())
    .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
    .slice(0, limit);
}
