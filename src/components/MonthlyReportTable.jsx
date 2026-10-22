import { useMemo, useState } from 'react';
import { FileDown, Plus, X } from 'lucide-react';
import { REPORT_META } from './AdminReportTable';
import ReportRowActions from './ReportRowActions';

const th =
  'border border-gray-200 bg-[#F3EEF9] px-2 py-2 text-[10px] font-bold uppercase leading-tight text-gray-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200';
const td = 'border border-gray-200 px-2 py-2 text-xs text-gray-800 dark:border-gray-600 dark:text-gray-200';
const totalTh = `${th} bg-[#FFE8F3] dark:bg-pink-900/25`;
const totalTd = `${td} bg-[#FFF5FA] text-center font-semibold dark:bg-pink-900/10`;

const COUNT_KEYS = ['m1M', 'm1F', 'm2M', 'm2F', 'm3M', 'm3F', 'tM', 'tF'];

function displayIndicator(row) {
  if (row.isHeader) return row.indicator || row.category || row.subcategory;
  return row.indicator || row.subcategory || row.category || '—';
}

function sumTotals(row) {
  const tM = Number(row.m1M || 0) + Number(row.m2M || 0) + Number(row.m3M || 0);
  const tF = Number(row.m1F || 0) + Number(row.m2F || 0) + Number(row.m3F || 0);
  return { ...row, tM, tF };
}

function displayCount(value) {
  return Number(value) === 0 || value == null || value === '' ? '' : value;
}

export default function MonthlyReportTable({
  darkMode,
  data = [],
  onSaveLine,
  onDeleteLine,
  onAddLine,
  onGenerateReport,
}) {
  const [editing, setEditing] = useState(null);

  const rows = useMemo(() => data.map((row) => sumTotals(row)), [data]);

  const openEdit = (row) => {
    if (row.isHeader) return;
    setEditing({ ...row });
  };

  const saveEdit = (e) => {
    e.preventDefault();
    if (!editing) return;
    onSaveLine?.(sumTotals(editing));
    setEditing(null);
  };

  return (
    <div
      className="overflow-hidden rounded-3xl border shadow-sm dark:border-gray-600"
      style={{
        background: darkMode ? '#26263B' : '#FFFFFF',
        borderColor: darkMode ? '#333348' : '#E8C4F0',
      }}
    >
      <div className="border-b border-[#E8DCEF] bg-white dark:border-gray-600 dark:bg-[#26263B]">
        <div className="bg-gradient-to-r from-[#FFE8F3] via-[#FFF0F8] to-[#FFE8F3] px-4 py-5 text-center dark:from-pink-900/30 dark:via-pink-900/20 dark:to-pink-900/30">
          <h2 className="text-xs font-extrabold uppercase leading-snug tracking-wide text-[#2D2D3A] sm:text-sm dark:text-white">
            Sub-Task Group Social Recovery &amp; Sub-Task Unit Essential Health Services
          </h2>
          <p className="mt-2 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
            Monthly Report Every 3rd Day of the Following Month
          </p>
          <p className="mt-1 text-xs font-bold text-gray-800 dark:text-gray-100">
            Barangay: {REPORT_META.barangay} | Year: {REPORT_META.reportYear || new Date().getFullYear()}
          </p>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 dark:border-gray-600"
        style={{ borderColor: darkMode ? '#333348' : '#E8DCEF' }}
      >
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{rows.length} record(s)</span>
        <div className="flex items-center gap-2">
          {onAddLine && (
            <button
              type="button"
              onClick={onAddLine}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm"
              style={{ background: 'linear-gradient(90deg, #2D3A8C 0%, #3D4FA8 100%)' }}
            >
              <Plus size={16} />
              Add New
            </button>
          )}
          {onGenerateReport && (
            <button
              type="button"
              onClick={onGenerateReport}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold dark:border-gray-500 dark:text-gray-100"
              style={{ borderColor: darkMode ? '#333348' : '#E8DCEF', color: darkMode ? '#fff' : '#2D2D3A' }}
            >
              <FileDown size={16} />
              Generate Monthly Report
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto px-3 pb-4 pt-3 sm:px-4">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr>
              <th rowSpan={2} className={`${th} min-w-[220px] text-left`}>
                Category / Indicator
              </th>
              <th colSpan={2} className={th}>
                Month 1
              </th>
              <th colSpan={2} className={th}>
                Month 2
              </th>
              <th colSpan={2} className={th}>
                Month 3
              </th>
              <th colSpan={2} className={totalTh}>
                Total
              </th>
              <th rowSpan={2} className={`${th} sticky right-0 z-20 min-w-[88px] text-center`}>
                Actions
              </th>
            </tr>
            <tr>
              {['Male', 'Female', 'Male', 'Female', 'Male', 'Female', 'Male', 'Female'].map((label, i) => (
                <th key={`${label}-${i}`} className={i >= 6 ? totalTh : th}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.isHeader ? 'bg-gray-50/80 dark:bg-white/5' : ''}>
                <td
                  className={`${td} ${row.isHeader ? 'font-bold text-gray-900 dark:text-white' : 'pl-4'}`}
                >
                  {displayIndicator(row)}
                </td>
                {row.isHeader ? (
                  <>
                    <td colSpan={8} className={`${td} text-center text-gray-400`}>
                      —
                    </td>
                    <td className={`${td} sticky right-0 bg-white dark:bg-[#26263B]`} />
                  </>
                ) : (
                  <>
                    {['m1M', 'm1F', 'm2M', 'm2F', 'm3M', 'm3F', 'tM', 'tF'].map((key) => (
                      <td
                        key={key}
                        className={['tM', 'tF'].includes(key) ? totalTd : `${td} text-center font-semibold`}
                      >
                        {displayCount(row[key])}
                      </td>
                    ))}
                    <td className={`${td} sticky right-0 bg-white text-center dark:bg-[#26263B]`}>
                      <ReportRowActions
                        darkMode={darkMode}
                        onEdit={() => openEdit(row)}
                        onDelete={() => onDeleteLine?.(row.id)}
                      />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={saveEdit}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#26263B]"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-gray-400">Edit counts</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{displayIndicator(editing)}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {COUNT_KEYS.filter((k) => !k.startsWith('t')).map((key) => (
                <label key={key} className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {key.toUpperCase()}
                  <input
                    type="number"
                    min="0"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-[#1e1e30]"
                    value={editing[key] ?? ''}
                    onChange={(e) =>
                      setEditing((prev) => ({
                        ...prev,
                        [key]: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="mt-5 w-full rounded-xl py-2.5 text-sm font-bold text-white"
              style={{ background: 'linear-gradient(90deg, #8F65FF, #FF75C3)' }}
            >
              Save (this device only)
            </button>
            <p className="mt-2 text-center text-[10px] text-gray-500">
              Monthly report lines are stored locally until the Supabase table is ready.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
