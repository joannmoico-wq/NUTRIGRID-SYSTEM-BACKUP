function recordDate(record) {
  const value = record.created_at
    || record.visit_date
    || record.date_of_registration
    || record.dow
    || record.updated_at
    || record.month;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateMonthlyTrend(records, now = new Date()) {
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const previousEnd = new Date(previousStart);
  previousEnd.setDate(Math.min(now.getDate(), previousLastDay) + 1);
  let currentCount = 0;
  let previousCount = 0;

  records.forEach((record) => {
    const date = recordDate(record);
    if (!date) return;
    if (date >= currentStart && date < currentEnd) currentCount += 1;
    else if (date >= previousStart && date < previousEnd) previousCount += 1;
  });

  const percent = previousCount
    ? Math.round(((currentCount - previousCount) / previousCount) * 100)
    : currentCount > 0 ? 100 : 0;

  return {
    percent,
    isPositive: percent >= 0,
    label: `${percent > 0 ? '+' : ''}${percent}%`,
    currentCount,
    previousCount,
    description: `Compared with the same period last month: ${currentCount} record${currentCount === 1 ? '' : 's'} this month versus ${previousCount} last month.`,
  };
}
