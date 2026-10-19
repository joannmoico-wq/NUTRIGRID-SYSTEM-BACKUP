import { Download, Plus } from 'lucide-react';
import ReportRowActions from './ReportRowActions';

export const REPORT_META = {
  barangay: 'CAMAMBUGAN',
  municipality: 'DAET',
  province: 'CAMARINES NORTE',
  reportYear: '2026',
  visitPeriodStart: 'January 2026',
  visitPeriodEnd: 'June 2026',
  formsSubmitDate: '2026-01-07',
  bnsGuide: 'LYNNEL B. DAMAYO / MYRNA B. EDUARDO',
  monthYear: 'June 2025',
};

/** Append to multi-row header definitions (row 0) for edit/delete column */
export const ACTIONS_HEAD_CELL = { label: 'Actions', rowSpan: 2 };

const thClass =
  'border border-gray-200 bg-[#F3EEF9] px-2 py-2.5 text-[10px] font-bold uppercase leading-tight text-gray-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200';
const tdClass =
  'border border-gray-200 px-2 py-2 text-xs text-gray-800 dark:border-gray-600 dark:text-gray-200';

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
  getCellValue,
  emptyMessage = 'No records yet.',
  minTableWidth = 720,
}) {
  const showActions = Boolean(onEdit || onDelete);
  const totalColumns = columnKeys.length + (showActions ? 1 : 0);

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

  const stickyActionTh = `${thClass} sticky right-0 z-20 text-center shadow-[-4px_0_8px_rgba(0,0,0,0.04)]`;
  const stickyActionTd = `${tdClass} sticky right-0 z-10 bg-white text-center dark:bg-[#26263B] shadow-[-4px_0_8px_rgba(0,0,0,0.04)]`;

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
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
              style={{ background: 'linear-gradient(90deg, #2D3A8C 0%, #3D4FA8 100%)' }}
            >
              <Plus size={16} />
              Add New
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition dark:border-gray-500 dark:text-gray-100"
              style={{ borderColor: darkMode ? '#333348' : '#E8DCEF', color: darkMode ? '#fff' : '#2D2D3A' }}
            >
              <Download size={16} />
              Export
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto px-3 pb-4 pt-3 sm:px-4">
        <table className="w-full border-collapse" style={{ minWidth: minTableWidth }}>
          <thead className="sticky top-0 z-10">
            {resolvedHeadRows.map((row, rowIndex) => (
              <tr key={`head-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <th
                    key={`${rowIndex}-${cellIndex}-${cell.label}`}
                    colSpan={cell.colSpan || 1}
                    rowSpan={cell.rowSpan || 1}
                    className={`${
                      cell.label === 'Actions' ? stickyActionTh : thClass
                    } ${cell.align === 'left' ? 'text-left' : 'text-center'}`}
                  >
                    {cell.label}
                  </th>
                ))}
                {showActions && rowIndex === 0 && !headHasActions && (
                  <th rowSpan={resolvedHeadRows.length} className={stickyActionTh}>
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
              data.map((row) => (
                <tr key={row.id} className="hover:bg-violet-50/40 dark:hover:bg-violet-900/10">
                  {columnKeys.map((key) => (
                    <td
                      key={key}
                      className={`${tdClass} text-center`}
                    >
                      {cellValue(row, key)}
                    </td>
                  ))}
                  {showActions && (
                    <td className={stickyActionTd}>
                      <ReportRowActions
                        darkMode={darkMode}
                        onEdit={onEdit ? () => onEdit(row.id) : undefined}
                        onDelete={onDelete ? () => onDelete(row.id) : undefined}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
