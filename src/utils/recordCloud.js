import { supabase } from './supabaseClient';

export const TABLE_BY_CATEGORY = {
  residents: 'residents',
  environmental: 'environmental_sanitation',
  infantfeeding: 'infant_feeding',
  lactatingwoman: 'lactating_women',
  pregnantwoman: 'pregnant_women',
  monthlynatal: 'monthly_natality',
};

function getDeviceId() {
  let id = localStorage.getItem('bns_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('bns_device_id', id);
  }
  return id;
}

// Saves a new or edited record. Updates the existing row when it exists,
// otherwise inserts it. Returns the record as it should be stored locally.
export async function pushRecordToCloud(category, record) {
  const table = TABLE_BY_CATEGORY[category];
  const saved = { ...record, status: 'Synced', synced: true };
  const pending = { ...record, status: 'Pending', synced: false };

  if (!table) return { ok: false, record: pending, message: 'Unknown category.' };
  if (!navigator.onLine) {
    return {
      ok: false,
      record: pending,
      message: 'You are offline. The record is saved on this device and will upload when you reconnect.',
    };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, record: pending, message: 'Sign in to upload this record.' };
  }

  const id = String(record.id);
  const payload = {
    purok: record.purok || null,
    status: 'Synced',
    data: saved,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error } = await supabase
    .from(table)
    .update(payload)
    .eq('data->>id', id)
    .select('data');
  if (error) throw new Error(error.message);

  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase.from(table).insert({
      device_id: getDeviceId(),
      local_id: id,
      ...payload,
    });
    if (insertError) throw new Error(insertError.message);
  }

  return { ok: true, record: saved };
}

// Deletes the shared copy of a record. Throws if it cannot be deleted.
export async function deleteCloudRecord(category, id) {
  const table = TABLE_BY_CATEGORY[category];
  if (!table) return;
  if (!navigator.onLine) {
    throw new Error('You are offline. Connect to the internet to delete a shared record.');
  }
  const { error } = await supabase.from(table).delete().eq('data->>id', String(id));
  if (error) throw new Error(error.message);
}