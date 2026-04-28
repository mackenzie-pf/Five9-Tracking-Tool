/**
 * Converts an array of row-arrays to a valid RFC 4180 CSV string.
 */
function toCSV(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\r\n");
}

/**
 * Triggers a browser file download for a string payload.
 */
function download(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Builds and downloads a multi-section operations report as a single CSV file.
 *
 * @param {Array<{ title: string, headers?: string[], rows: Array<Array<any>> }>} sections
 * @param {string} filename
 */
export function exportReportCSV(sections, filename) {
  const allRows = [];

  for (const section of sections) {
    // Section title row
    allRows.push([section.title]);
    if (section.headers?.length) allRows.push(section.headers);
    for (const row of section.rows ?? []) allRows.push(row);
    // Blank separator between sections
    allRows.push([]);
  }

  download(toCSV(allRows), filename, "text/csv;charset=utf-8;");
}

/**
 * Exports a plain table (array of objects) directly to CSV.
 *
 * @param {object[]} data
 * @param {string}   filename
 */
export function exportTableCSV(data, filename) {
  if (!data?.length) return;
  const headers = Object.keys(data[0]);
  const rows    = data.map((row) => headers.map((h) => row[h] ?? ""));
  download(toCSV([headers, ...rows]), filename, "text/csv;charset=utf-8;");
}
