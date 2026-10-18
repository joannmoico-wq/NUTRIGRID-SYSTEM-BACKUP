import { Edit, Trash2 } from 'lucide-react';

/** Shared edit/delete controls for admin + PWA record tables */
export default function ReportRowActions({ onEdit, onDelete, darkMode = false }) {
  const editStyle = darkMode
    ? { color: '#8F65FF', backgroundColor: 'rgba(143, 101, 255, 0.18)' }
    : { color: '#8F65FF', backgroundColor: '#F3EEFF' };

  return (
    <div className="inline-flex items-center justify-center gap-1.5">
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg p-1.5 transition hover:opacity-85"
          style={editStyle}
          aria-label="Edit record"
        >
          <Edit size={14} strokeWidth={2.25} />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 transition hover:bg-red-50 dark:border-red-900/40 dark:bg-transparent dark:hover:bg-red-900/20"
          aria-label="Delete record"
        >
          <Trash2 size={14} strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
