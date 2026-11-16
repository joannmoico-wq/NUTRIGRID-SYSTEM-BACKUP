export function removeNotesColumns(headers, rows, columnStyles = {}) {
  const removedIndexes = new Set(
    headers.flatMap((header, index) =>
      /\bnotes?\b|\bremarks?\b/i.test(String(header)) ? [index] : []
    )
  );
  if (!removedIndexes.size) return { headers, rows, columnStyles };

  const keptIndexes = headers.map((_, index) => index).filter((index) => !removedIndexes.has(index));
  const nextColumnStyles = Object.fromEntries(
    Object.entries(columnStyles)
      .filter(([index]) => keptIndexes.includes(Number(index)))
      .map(([index, style]) => [String(keptIndexes.indexOf(Number(index))), style])
  );

  return {
    headers: keptIndexes.map((index) => headers[index]),
    rows: rows.map((row) => keptIndexes.map((index) => row[index] ?? '')),
    columnStyles: nextColumnStyles,
  };
}
