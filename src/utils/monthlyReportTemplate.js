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

function reportLine({
  id,
  slug,
  indicator,
  isHeader = false,
  sortOrder,
  reportQuarter = 1,
  month1Name = 'January',
  month2Name = 'February',
  month3Name = 'March',
}) {
  return {
    id,
    slug,
    indicator,
    category: indicator,
    subcategory: isHeader ? '' : indicator,
    groupLabel: indicator,
    isHeader,
    sortOrder: sortOrder ?? id,
    barangay: 'ALAWIHAO',
    reportYear: 2026,
    reportQuarter,
    month1Name,
    month2Name,
    month3Name,
    ...emptyCounts(),
  };
}

/** Default indicator lines shown until a report year is loaded from Supabase. */
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
  reportLine({ id: 16, slug: 'hdr-follow-up-weighing', indicator: 'Follow-up Weighing', isHeader: true }),
  reportLine({ id: 17, slug: 'weighed-0-23-months', indicator: 'No. of 0–23 mos. old weighed (Monthly)' }),
  reportLine({ id: 18, slug: 'hdr-newborn-babies', indicator: 'Newborn Babies', isHeader: true }),
  reportLine({ id: 19, slug: 'newborn-babies-origin', indicator: 'No. of Newborn Babies (origin)' }),
  reportLine({ id: 20, slug: 'hdr-complementary-feeding', indicator: 'Introduce Complementary Feeding', isHeader: true }),
  reportLine({ id: 21, slug: 'comp-feeding-continued', indicator: 'Infants 6–8 months initiated complementary feeding with continued breastfeeding' }),
  reportLine({ id: 22, slug: 'comp-feeding-stopped', indicator: 'Infants 6–8 months initiated complementary feeding but no longer or never been breastfed' }),
  reportLine({ id: 23, slug: 'hdr-breastfeeding-iycf', indicator: 'Breast Feeding IYCF Report', isHeader: true }),
  reportLine({ id: 24, slug: 'exclusive-breastfeeding', indicator: 'Infants exclusively breastfed (3 months & 29 days or 3 months and 1 day before the child turns 6 months)' }),
  reportLine({ id: 25, slug: 'hdr-deliveries', indicator: 'Deliveries', isHeader: true }),
  reportLine({ id: 26, slug: 'deliveries', indicator: 'Deliveries' }),
  reportLine({ id: 27, slug: 'delivery-percentage', indicator: 'Percentage' }),
];

const lineKey = (row) => {
  if (row?.slug) {
    return `${row.reportYear || 2026}:${row.reportQuarter || 1}:${row.slug}`;
  }
  return `${row?.indicator || row?.category || ''}::${row?.subcategory || ''}`;
};

const COUNT_KEYS = ['m1M', 'm1F', 'm2M', 'm2F', 'm3M', 'm3F', 'tM', 'tF'];
const BATCH_MONTHS = [
  ['January', 'February', 'March'],
  ['April', 'May', 'June'],
  ['July', 'August', 'September'],
  ['October', 'November', 'December'],
];

export function mergeMonthlyReportLines(savedRows = []) {
  const saved = Array.isArray(savedRows) ? savedRows : [];
  const savedByKey = new Map(saved.map((row) => [lineKey(row), row]));

  const defaultLines = BATCH_MONTHS.flatMap((months, batchIndex) =>
    DEFAULT_MONTHLY_REPORT_LINES.map((template) => ({
      ...template,
      id: template.id + (batchIndex * DEFAULT_MONTHLY_REPORT_LINES.length),
      reportQuarter: batchIndex + 1,
      month1Name: months[0],
      month2Name: months[1],
      month3Name: months[2],
    }))
  );
  const mergedDefaults = defaultLines.map((template) => {
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
      reportQuarter: existing.reportQuarter ?? template.reportQuarter,
      month1Name: existing.month1Name || template.month1Name,
      month2Name: existing.month2Name || template.month2Name,
      month3Name: existing.month3Name || template.month3Name,
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
