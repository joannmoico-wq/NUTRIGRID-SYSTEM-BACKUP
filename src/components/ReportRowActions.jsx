import { Edit, Eye, Trash2 } from 'lucide-react';

/** Shared view/edit/delete controls for admin + PWA record tables */
export default function ReportRowActions({ onView, onEdit, onDelete, darkMode = false }) {
  const editStyle = darkMode
    ? { color: '#8F65FF', backgroundColor: 'rgba(143, 101, 255, 0.18)' }
    : { color: '#8F65FF', backgroundColor: '#F3EEFF' };

  return (
    <div className="inline-flex items-center justify-center gap-1.5">
      {onView && (
        <button
          type="button"
          onClick={onView}
          className="rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-blue-700 transition hover:bg-blue-100"
          aria-label="View record"
          title="View saved record"
        >
          <Eye size={14} strokeWidth={2.25} />
        </button>
      )}
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
