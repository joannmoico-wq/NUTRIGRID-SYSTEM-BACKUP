import { useEffect } from 'react';
import { X } from 'lucide-react';

const PHOTO_FIELDS = [
  ['photo_url', 'Photo'],
  ['residents_photo', 'Household Photo'],
  ['residentsPhoto', 'Household Photo'],
  ['environmental_sanitation_photo', 'Environmental Photo'],
];

const HIDDEN_FIELDS = new Set([
  '_raw',
  'photo_url',
  'residents_photo',
  'residentsPhoto',
  'environmental_sanitation_photo',
  'sync_error',
]);

function formatLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function RecordDetailsDialog({ record, onClose }) {
  useEffect(() => {
    if (!record) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [record, onClose]);

  if (!record) return null;

  const photos = PHOTO_FIELDS
    .map(([key, label]) => ({ label, src: record[key] }))
    .filter(({ src }) => typeof src === 'string' && src.length > 0);
  const fields = Object.entries(record)
    .filter(([key, value]) => !HIDDEN_FIELDS.has(key) && value !== undefined)
    .filter(([key]) => key !== 'category' && key !== 'categoryId');

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-details-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6">
          <h2 id="record-details-title" className="text-lg font-bold text-gray-900">Saved Record Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close record details"
          >
            <X size={20} />
          </button>
        </header>
        <div className="overflow-y-auto p-4 sm:p-6">
          {photos.length > 0 && (
            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {photos.map(({ label, src }) => (
                <figure key={label} className="overflow-hidden rounded-xl border border-gray-200">
                  <img src={src} alt={label} className="max-h-80 w-full bg-gray-50 object-contain" />
                  <figcaption className="border-t border-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">
                    {label}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fields.map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{formatLabel(key)}</dt>
                <dd className="mt-1 break-words text-sm text-gray-900">{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
