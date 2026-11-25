import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthValue(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export default function MonthYearPicker({
  value,
  onChange,
  label,
  darkMode = false,
  minYear = 2000,
  maxYear,
  buttonClassName = '',
  compact = false,
  chevronSize = compact ? 13 : 16,
}) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const now = new Date();
  const [selectedYear, selectedMonth] = /^\d{4}-\d{2}$/.test(value || '')
    ? value.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const lastYear = Math.max(maxYear ?? now.getFullYear() + 5, selectedYear);
  const years = Array.from({ length: Math.max(1, lastYear - minYear + 1) }, (_, index) => minYear + index);
  const selectedLabel = value
    ? new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('en', {
        month: compact ? 'short' : 'long',
        year: 'numeric',
      })
    : 'All months';

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectedYearClass = darkMode
    ? 'border-slate-600 bg-[#302338] text-white'
    : 'border-gray-200 bg-gray-100 text-gray-800';

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`${compact
          ? 'inline-flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-xs'
          : 'inline-flex min-h-12 min-w-44 items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-sm'} font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${buttonClassName} ${
          darkMode
            ? 'border-[#67445F] bg-[#302338] text-[#FCE7F3]'
            : 'border-gray-300 bg-white text-gray-800'
        }`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="whitespace-nowrap">{selectedLabel}</span>
        <ChevronDown size={chevronSize} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={`absolute right-0 z-[100] mt-2 w-72 rounded-xl border p-3 shadow-xl ${
            darkMode ? 'border-[#67445F] bg-[#26263B]' : 'border-gray-200 bg-white'
          }`}
          role="dialog"
          aria-label={label}
        >
          <label className="relative mb-2 block">
            <span className="sr-only">Choose year</span>
            <select
              value={selectedYear}
              onChange={(event) => {
                const year = Number(event.target.value);
                onChange(monthValue(year, selectedMonth));
              }}
              className={`w-full appearance-none rounded-md border py-2 pl-3 pr-9 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-300 ${selectedYearClass}`}
            >
              {years.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <ChevronDown
              size={16}
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}
              aria-hidden="true"
            />
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_NAMES.map((name, index) => {
              const nextValue = monthValue(selectedYear, index + 1);
              const isSelected = value === nextValue;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(nextValue);
                    setOpen(false);
                  }}
                  className={`rounded-lg px-2 py-2 text-sm font-medium ${
                    isSelected
                      ? 'bg-[#8F65FF] text-white'
                      : darkMode
                        ? 'text-slate-200 hover:bg-white/10'
                        : 'text-gray-700 hover:bg-violet-50'
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={`mt-2 w-full rounded-lg py-2 text-xs font-semibold ${
                darkMode ? 'text-slate-300 hover:bg-white/10' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Clear month filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
