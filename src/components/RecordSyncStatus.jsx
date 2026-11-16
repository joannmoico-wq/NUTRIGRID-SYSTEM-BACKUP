import { getRecordSyncStatus } from '../utils/bnsStorage';

const STATUS_DETAILS = {
  pending_sync: {
    label: 'Pending Sync',
    className: 'bg-amber-100 text-amber-800',
  },
  syncing: {
    label: 'Syncing',
    className: 'bg-blue-100 text-blue-800',
  },
  synced: {
    label: 'Synced',
    className: 'bg-emerald-100 text-emerald-800',
  },
  sync_failed: {
    label: 'Sync Failed',
    className: 'bg-rose-100 text-rose-800',
  },
};

export default function RecordSyncStatus({ record, className = '' }) {
  const status = getRecordSyncStatus(record);
  const details = STATUS_DETAILS[status];

  return (
    <span
      className={`inline-flex max-w-full items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-semibold ${details.className} ${className}`}
      title={record?.sync_error || details.label}
    >
      {details.label}
    </span>
  );
}
