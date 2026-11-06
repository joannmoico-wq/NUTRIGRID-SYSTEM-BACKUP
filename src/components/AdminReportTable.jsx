import { useEffect, useState } from 'react';
import { Download, FileText, Plus, X } from 'lucide-react';
import ReportRowActions from './ReportRowActions';

export const REPORT_META = {
  barangay: 'ALAWIHAO',
  municipality: 'DAET',
  province: 'CAMARINES NORTE',
  reportYear: '2026',
  visitPeriodStart: 'March 2026',
  visitPeriodEnd: 'September 2026',
  formsSubmitDate: '2026-09-03',
  bnsGuide: 'LAARNI B. POMADA / BNS',
  monthYear: 'September 2026',
};

/** Append to multi-row header definitions (row 0) for edit/delete column */
export const ACTIONS_HEAD_CELL = { label: 'Actions', rowSpan: 2 };

const thClass =
  'border border-gray-200 bg-[#F3EEF9] px-2 py-2.5 text-[10px] font-bold uppercase leading-tight text-gray-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200';
const tdClass =
  'border border-gray-200 px-2 py-2 text-xs font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-200';

export function ExpandableNote({ value, darkMode = false }) {
  const [open, setOpen] = useState(false);
  const text = String(value ?? '');
  if (text.length <= 56) {
    return <span className="block min-w-0 max-w-full whitespace-pre-wrap break-words">{text || '—'}</span>;
  }

  return (
    <>
      <span className="flex w-full min-w-0 max-w-full flex-col items-center gap-0.5">
        <span className="block w-full min-w-0 max-w-[10rem] truncate" title={text}>{text}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="max-w-full truncate text-center font-bold text-violet-700 hover:underline dark:text-violet-300"
          aria-label="Show full note"
        >
          … Show more
        </button>
      </span>
      {open && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className={`relative max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-2xl p-5 shadow-2xl ${
              darkMode ? 'bg-[#26263B] text-slate-100' : 'bg-white text-slate-800'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="full-note-title"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="full-note-title" className="font-bold">Full note</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                aria-label="Close note"
              >
                <X size={18} />
              </button>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</p>
          </section>
        </div>
      )}
    </>
  );
}

export function ReportHeader({ title, subtitle, fields = [] }) {
  return (
    <div className="border-b border-[#E8DCEF] bg-white dark:border-gray-600 dark:bg-[#26263B]">
      <div className="bg-gradient-to-r from-[#FFE8F3] via-[#FFF0F8] to-[#FFE8F3] px-4 py-4 text-center dark:from-pink-900/30 dark:via-pink-900/20 dark:to-pink-900/30">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#2D2D3A] dark:text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs font-semibold text-gray-600 dark:text-gray-300">{subtitle}</p> : null}
      </div>
      {fields.length > 0 && (
        <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminReportTable({
  darkMode,
  data = [],
  columnKeys,
  headRows,
  singleRowHeaders,
  reportHeader,
  legend,
  recordCount,
  onAdd,
  onEdit,
  onDelete,
  onExport,
  exportActions,
  getCellValue,
  emptyMessage = 'No records yet.',
  minTableWidth = 720,
}) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showActions = Boolean(onEdit || onDelete);
  const totalColumns = columnKeys.length + (showActions ? 1 : 0);
  const nameColumnNames = new Set([
    'head',
    'householdhead',
    'mothername',
    'childname',
    'firstname',
    'lastname',
    'name',
  ]);
  const updatedColumn = columnKeys.find((key) =>
    nameColumnNames.has(key.toLowerCase().replace(/[_\s-]/g, ''))
  ) || columnKeys[0];

  const cellValue =
    getCellValue ||
    ((row, key) => {
      const val = row[key];
      return val == null || val === '' ? '—' : val;
    });

  const resolvedHeadRows =
    headRows ||
    (singleRowHeaders
      ? [
          [
            ...singleRowHeaders.map((label) => ({ label })),
            ...(showActions ? [{ label: 'Actions' }] : []),
          ],
        ]
      : [
          [
            ...columnKeys.map((key) => ({ label: key })),
            ...(showActions ? [{ label: 'Actions' }] : []),
          ],
        ]);

  const headHasActions = resolvedHeadRows.some((row) => row.some((c) => c.label === 'Actions'));

  const actionTh = `${thClass} text-center`;
  const actionTd = `${tdClass} text-center`;

  return (
    <div
      className="overflow-hidden rounded-3xl border shadow-sm dark:border-gray-600"
      style={
        darkMode
          ? {
              background: '#26263B',
              borderColor: '#333348',
            }
          : {
              background: '#FFFFFF',
              borderColor: '#E8C4F0',
            }
      }
    >
      {reportHeader}
      {legend ? (
        <div className="border-b border-[#E8DCEF] bg-[#EAF3FF] px-4 py-2.5 text-center text-[11px] font-semibold text-[#2D4A7A] dark:border-gray-600 dark:bg-blue-900/20 dark:text-blue-200">
          {legend}
        </div>
      ) : null}

      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 dark:border-gray-600"
        style={{ borderColor: darkMode ? '#333348' : '#E8DCEF' }}
      >
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {recordCount ?? data.length} record(s)
        </span>
        <div className="flex items-center gap-2">
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-2 rounded-lg bg-[#FCE7F3] px-4 py-2 text-sm font-semibold text-[#9D174D] shadow-sm transition hover:bg-[#FBCFE8]"
            >
              <Plus size={16} />
              Add New
            </button>
          )}
          {exportActions || (onExport && (
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition dark:border-gray-500 dark:text-gray-100"
              style={{ borderColor: darkMode ? '#333348' : '#E8DCEF', color: darkMode ? '#fff' : '#2D2D3A' }}
            >
              <Download size={16} />
              Export
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto px-3 pb-4 pt-3 sm:px-4">
        <table className="w-full border-collapse" style={{ minWidth: minTableWidth }}>
          <thead>
            {resolvedHeadRows.map((row, rowIndex) => (
              <tr key={`head-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <th
                    key={`${rowIndex}-${cellIndex}-${cell.label}`}
                    colSpan={cell.colSpan || 1}
                    rowSpan={cell.rowSpan || 1}
                    className={`${
                      cell.label === 'Actions' ? actionTh : thClass
                    } ${cell.align === 'left' ? 'text-left' : 'text-center'}`}
                  >
                    {cell.label}
                  </th>
                ))}
                {showActions && rowIndex === 0 && !headHasActions && (
                  <th rowSpan={resolvedHeadRows.length} className={actionTh}>
                    Actions
                  </th>
                )}
              </tr>
            ))}
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={totalColumns}
                  className={`${tdClass} py-10 text-center text-sm text-gray-500 dark:text-gray-400`}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const hasSyncFlag = typeof row.synced === 'boolean' || typeof row._raw?.synced === 'boolean';
                const status = String(row.status || row._raw?.status || '').toLowerCase();
                const isDraft = row.synced === false ||
                  row._raw?.synced === false ||
                  (!hasSyncFlag && status === 'pending');
                return (
                <tr
                  key={row.id}
                  className={`hover:bg-violet-50/40 dark:hover:bg-violet-900/10 ${
                    isDraft
                      ? isOnline
                        ? 'border-l-4 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/20'
                        : 'border-l-4 border-red-500 bg-red-50/70 dark:bg-red-950/20'
                      : ''
                  }`}
                >
                  {columnKeys.map((key) => (
                    <td
                      key={key}
                      className={`${tdClass} text-center`}
                    >
                      {['notes', 'remarks'].includes(key.toLowerCase()) ? (
                        <ExpandableNote value={cellValue(row, key)} darkMode={darkMode} />
                      ) : (
                        <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1">
                          <span className={`min-w-0 ${
                            key === updatedColumn ? 'whitespace-normal break-words' : 'truncate'
                          }`}>{cellValue(row, key)}</span>
                          <span className="flex max-w-full flex-wrap items-center justify-center gap-1">
                            {key === columnKeys[0] && isDraft && (
                              <span
                                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                  isOnline
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                                title={isOnline
                                  ? 'This offline draft is ready to open, finish, and save.'
                                  : 'This record is saved as a draft on this device.'}
                              >
                                <FileText size={10} aria-hidden="true" />
                                {isOnline ? 'Ready to save' : 'Draft'}
                              </span>
                            )}
                            {key === updatedColumn && (row._raw?.updated_at || row.updated_at) && (
                              <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-pink-100 px-1.5 py-0.5 text-[9px] font-semibold text-pink-700">
                                Updated
                              </span>
                            )}
                          </span>
                        </span>
                      )}
                    </td>
                  ))}
                  {showActions && (
                    <td className={actionTd}>
                      <ReportRowActions
                        darkMode={darkMode}
                        onEdit={onEdit ? () => onEdit(row.id) : undefined}
                        onDelete={onDelete ? () => onDelete(row.id) : undefined}
                      />
                    </td>
                  )}
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
