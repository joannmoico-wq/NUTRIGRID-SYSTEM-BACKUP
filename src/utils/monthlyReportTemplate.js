const emptyCounts = () => ({
  m1M: 0,
  m1F: 0,
  m2M: 0,
  m2F: 0,
  m3M: 0,
  m3F: 0,
  tM: 0,
  tF: 0,
});

function reportLine({ id, slug, indicator, isHeader = false, sortOrder }) {
  return {
    id,
    slug,
    indicator,
    category: indicator,
    subcategory: isHeader ? '' : indicator,
    groupLabel: indicator,
    isHeader,
    sortOrder: sortOrder ?? id,
    barangay: 'CAMAMBUGAN',
    reportYear: 2026,
    ...emptyCounts(),
  };
}

/** Essential health services lines (UI template — local storage only for now). */
export const DEFAULT_MONTHLY_REPORT_LINES = [
  reportLine({ id: 1, slug: 'hdr-new-cases', indicator: 'New Cases of', isHeader: true }),
  reportLine({ id: 2, slug: 'wasted-mam', indicator: 'Wasted (MAM)' }),
  reportLine({ id: 3, slug: 'severely-wasted-sam', indicator: 'Severely Wasted (SAM)' }),
  reportLine({ id: 4, slug: 'hdr-vitamin-a', indicator: 'Given Vitamin A', isHeader: true }),
  reportLine({ id: 5, slug: 'vit-a-6-11', indicator: '6–11 months old (100,000 IU)' }),
  reportLine({ id: 6, slug: 'vit-a-12-59', indicator: '12–59 months old (200,000 IU)' }),
  reportLine({ id: 7, slug: 'vit-a-postpartum', indicator: 'Post-partum Women (200,000 IU)' }),
  reportLine({ id: 8, slug: 'hdr-iron-folic', indicator: 'No. Given Iron with Folic Acid', isHeader: true }),
  reportLine({ id: 9, slug: 'iron-pregnant', indicator: 'Pregnant (180 tabs)' }),
  reportLine({ id: 10, slug: 'iron-adolescent', indicator: 'Adolescent Pregnant (180 tabs)' }),
  reportLine({ id: 11, slug: 'iron-lactating', indicator: 'Lactating Women (90 tabs)' }),
  reportLine({ id: 12, slug: 'hdr-iron-drops', indicator: 'No. of Infants Given Iron Drops', isHeader: true }),
  reportLine({ id: 13, slug: 'iron-lbw', indicator: 'LBW/Preterm Babies' }),
  reportLine({ id: 14, slug: 'hdr-nip', indicator: 'National Immunization Program', isHeader: true }),
  reportLine({ id: 15, slug: 'fic-9-12', indicator: 'Fully Immunized Children (9–12 months)' }),
];

const lineKey = (row) => {
  if (row?.slug) return String(row.slug);
  return `${row?.indicator || row?.category || ''}::${row?.subcategory || ''}`;
};

const COUNT_KEYS = ['m1M', 'm1F', 'm2M', 'm2F', 'm3M', 'm3F', 'tM', 'tF'];

export function mergeMonthlyReportLines(savedRows = []) {
  const saved = Array.isArray(savedRows) ? savedRows : [];
  const savedByKey = new Map(saved.map((row) => [lineKey(row), row]));

  const mergedDefaults = DEFAULT_MONTHLY_REPORT_LINES.map((template) => {
    const existing = savedByKey.get(lineKey(template));
    if (!existing) return { ...template };
    savedByKey.delete(lineKey(template));
    return {
      ...template,
      ...existing,
      id: existing.id ?? template.id,
      slug: existing.slug || template.slug,
      indicator: existing.indicator || template.indicator,
      isHeader: existing.isHeader ?? template.isHeader,
      sortOrder: existing.sortOrder ?? template.sortOrder,
    };
  });

  const extras = [...savedByKey.values()].sort(
    (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)
  );

  return [...mergedDefaults, ...extras].map((row) => {
    const next = { ...row };
    COUNT_KEYS.forEach((key) => {
      if (next[key] == null || next[key] === '') next[key] = 0;
    });
    return next;
  });
}
