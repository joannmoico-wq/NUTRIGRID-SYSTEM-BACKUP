import XLSX from 'xlsx-js-style';

const EXCLUDED_EXPORT_FIELDS = new Set([
  '_raw',
  'photo_url',
  'residents_photo',
  'residentsPhoto',
  'environmental_sanitation_photo',
  'sync_error',
  'syncError',
  'sync_status',
  'syncStatus',
  'syncState',
  'synced',
  'gps_lat',
  'gps_lng',
  'gps_latitude',
  'gps_longitude',
]);

const SYNC_STATUS_VALUES = new Set([
  'pending',
  'pending sync',
  'pending_sync',
  'syncing',
  'synced',
  'sync failed',
  'sync_failed',
]);

const isSyncStatusValue = (value) =>
  SYNC_STATUS_VALUES.has(String(value ?? '').trim().toLowerCase());

const EXCLUDED_IMPORT_FIELDS = new Set([
  '_raw',
  'synced',
  'status',
  'sync_status',
  'sync_error',
  'created_by_user_id',
  'last_edited_by',
  'last_edited_role',
  'last_edited_at',
  'photo_url',
  'residents_photo',
  'residentsPhoto',
  'environmental_sanitation_photo',
  'gps_lat',
  'gps_lng',
  'gps_latitude',
  'gps_longitude',
]);

const IMPORT_COLUMN_ALIASES = {
  residents: {
    head: 'household_head',
    members: 'total_members',
    'last visit': 'visit_date',
  },
  infantfeeding: {
    purok: 'purok',
    nanay: 'mother_name',
    bata: 'child_name',
    '1 linggo': 'feeding_1_week',
    '1 buwan': 'feeding_1_month',
    '2 buwan': 'feeding_2_month',
    '3 buwan': 'feeding_3_month',
    '4 buwan': 'feeding_4_month',
    '5 buwan': 'feeding_5_month',
    '6 buwan': 'feeding_6_month',
    '7 buwan': 'feeding_7_month',
    '8 buwan': 'feeding_8_month',
  },
  pregnantwoman: {
    'date reg': 'date_of_registration',
    fsn: 'family_serial_number',
    last: 'last_name',
    first: 'first_name',
    middle: 'middle_name',
    spouse: 'spouse_name',
    contact: 'contact_number',
    birthday: 'birthday',
    civil: 'civil_status',
    lmp: 'lmp',
    edd: 'expected_date_of_delivery',
    philhealth: 'philhealth_member',
    '4ps': 'four_ps_beneficiary',
    wt: 'weight',
    ht: 'height',
    bmi: 'bmi',
    muac: 'muac',
    'given iron with folic acid for': 'iron_folic_acid_type',
    'amount of tabs': 'iron_folic_acid',
  },
  lactatingwoman: {
    'date reg': 'date_of_registration',
    fsn: 'family_serial_number',
    last: 'last_name',
    first: 'first_name',
    middle: 'middle_name',
    spouse: 'spouse_name',
    contact: 'contact_number',
    birthday: 'birthday',
    civil: 'civil_status',
    philhealth: 'philhealth_member',
    '4ps': 'four_ps_beneficiary',
    wt: 'weight',
    ht: 'height',
    bmi: 'bmi',
    muac: 'muac',
    'iron with folic acid': 'iron_folic_acid',
    'date delivered': 'date_delivered',
  },
  monthlynatal: {
    month: 'month',
    mother: 'mother_name',
    'mother birthday': 'mother_birthday',
    age: 'mother_age',
    child: 'child_name',
    dob: 'dob',
    dow: 'dow',
    'birth weight': 'birth_weight',
    'wt (kg)': 'weight_kg',
    'ht (cm)': 'height_cm',
    aim: 'aim',
    'length (cm)': 'length_cm',
    'w/a': 'w_a',
    'h/a': 'h_a',
    'w/l/h': 'w_l_h',
    'iron drops for lbw/preterm': 'iron_status',
    'given vitamin a': 'vitamin_a',
    'vitamin a quantity': 'vitamin_a_count',
    'fully immunized (9–12 months)': 'fully_immunized',
    'newborn babies': 'newborn_babies',
    remarks: 'remarks',
  },
};

export function exportRecordsToExcel(records, fileName) {
  const omitStatus = records.every((record) =>
    record.status == null || record.status === '' || isSyncStatusValue(record.status)
  );
  const rows = records.map((record) =>
    Object.fromEntries(
      Object.entries(record)
        .filter(([key, value]) =>
          !EXCLUDED_EXPORT_FIELDS.has(key) &&
          !(omitStatus && key === 'status') &&
          value !== undefined
        )
        .map(([key, value]) => [
          key,
          value && typeof value === 'object' ? JSON.stringify(value) : value,
        ])
    )
  );
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function exportTableToExcel(headers, rows, fileName) {
  const omittedColumns = new Set(
    headers.flatMap((header, index) => {
      const normalizedHeader = String(header).trim().toLowerCase().replace(/[_-]/g, ' ');
      if (['sync status', 'sync error', 'sync state', 'synced'].includes(normalizedHeader)) {
        return [index];
      }
      if (
        normalizedHeader === 'status' &&
        rows.every((row) => row[index] == null || row[index] === '' || isSyncStatusValue(row[index]))
      ) {
        return [index];
      }
      return [];
    })
  );
  const exportColumnIndexes = headers
    .map((_, index) => index)
    .filter((index) => !omittedColumns.has(index));
  const exportHeaders = exportColumnIndexes.map((index) => headers[index]);
  const data = [
    exportHeaders,
    ...rows.map((row) => exportColumnIndexes.map((index) => {
      const value = row[index];
      return value && typeof value === 'object' ? JSON.stringify(value) : value ?? '';
    })),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const columnWidths = exportHeaders.map((header, columnIndex) => {
    const longestValue = data.reduce((longest, row) => {
      const value = String(row[columnIndex] ?? '');
      return Math.max(longest, ...value.split(/\r?\n/).map((line) => line.length));
    }, String(header).length);
    return { wch: Math.min(42, Math.max(14, longestValue + 4)) };
  });
  worksheet['!cols'] = columnWidths;
  worksheet['!rows'] = data.map((row, rowIndex) => {
    const lineCount = row.reduce((maximum, value, columnIndex) => {
      const width = columnWidths[columnIndex].wch;
      const wrappedLines = String(value ?? '')
        .split(/\r?\n/)
        .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / width)), 0);
      return Math.max(maximum, wrappedLines);
    }, 1);
    return { hpt: rowIndex === 0 ? 30 : Math.min(90, Math.max(26, lineCount * 16 + 8)) };
  });
  data.forEach((row, rowIndex) => {
    row.forEach((_, columnIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[cellAddress];
      if (!cell) return;
      cell.s = {
        alignment: {
          horizontal: 'center',
          vertical: 'center',
          wrapText: true,
        },
        ...(rowIndex === 0
          ? {
              font: { bold: true, color: { rgb: '1F2937' } },
              fill: { fgColor: { rgb: 'F3F4F6' } },
              border: {
                bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
              },
            }
          : {}),
      };
    });
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}

export function normalizeImportedRecordHeaders(rows, category) {
  const aliases = IMPORT_COLUMN_ALIASES[category] || {};
  const ignoredColumns = new Set(['no', 'status']);
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).flatMap(([key, value]) => {
        const normalizedLabel = String(key).trim().toLowerCase();
        if (ignoredColumns.has(normalizedLabel)) return [];
        const field = aliases[normalizedLabel] || key;
        if (field === 'purok' && value && !/^purok\b/i.test(String(value).trim())) {
          return [[field, `Purok ${String(value).trim()}`]];
        }
        if (category === 'monthlynatal' && field === 'sex') {
          const normalizedSex = String(value).trim().toLowerCase();
          return [[field, normalizedSex === 'male' ? 'boys' : normalizedSex === 'female' ? 'girls' : value]];
        }
        if (
          category === 'monthlynatal' &&
          ['fully_immunized', 'newborn_babies'].includes(field)
        ) {
          return [[field, ['✓', 'true', 'yes', '1'].includes(String(value).trim().toLowerCase())]];
        }
        return [[field, value]];
      })
    )
  );
}

export async function readRecordsFromExcel(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The Excel file does not contain a worksheet.');

  const records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: false,
  });
  if (!records.length) throw new Error('The first worksheet does not contain any records.');
  if (records.length > 10000) throw new Error('Import is limited to 10,000 rows at a time.');

  return records
    .map((row) =>
      Object.fromEntries(
        Object.entries(row)
          .filter(([key]) => !EXCLUDED_IMPORT_FIELDS.has(key))
          .map(([key, value]) => [String(key).trim(), value])
      )
    )
    .filter((record) => Object.values(record).some((value) => String(value ?? '').trim()));
}
