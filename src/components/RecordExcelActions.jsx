import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { exportRecordsToExcel, readRecordsFromExcel } from '../utils/recordExcel';

export function ExportRecordsExcelButton({ records, fileName }) {
  return (
    <button
      type="button"
      onClick={() => exportRecordsToExcel(records, fileName)}
      disabled={!records.length}
      className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download size={16} />
      Save as Excel
    </button>
  );
}

export function ImportRecordsExcelButton({ onImport }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFileChange = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setBusy(true);
    try {
      const records = await readRecordsFromExcel(file);
      await onImport(records);
    } catch (error) {
      console.error('Could not import records from Excel:', error);
      window.alert(`Could not import Excel records: ${error?.message || 'Invalid workbook.'}`);
    } finally {
      input.value = '';
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        aria-label="Choose an Excel records file"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-semibold text-blue-800 shadow-sm transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-50"
      >
        <Upload size={16} />
        {busy ? 'Reading Excel…' : 'Import Excel'}
      </button>
    </>
  );
}
