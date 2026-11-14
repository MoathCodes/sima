/**
 * CSV for the "Download … (CSV)" links. Owner: lane B. Pure.
 *
 * Plain RFC 4180: comma separated, CRLF line ends, fields quoted when they hold a comma, a quote
 * or a line break. The file starts with `#` lines that say what it is, how it was measured, that
 * finds are candidates and not discoveries, and where the pixels came from; a simulated patch
 * says SIMULATED there (H3). TOPCAT, spreadsheets and `pandas.read_csv(…, comment='#')` read it.
 */

/** One cell. null is written as an empty field; booleans as 1 and 0. */
export type Cell = string | number | boolean | null;

/**
 * One field. Numbers are written in full (String(n)); NaN and infinities are empty. Text is quoted
 * when it holds a comma, a quote, a line break or `#` (so `comment='#'` readers keep it), with
 * quotes doubled.
 */
function field(c: Cell): string {
  if (c === null) return '';
  if (typeof c === 'boolean') return c ? '1' : '0';
  if (typeof c === 'number') return Number.isFinite(c) ? String(c) : '';
  return /[",\r\n#]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
}

/**
 * A table → CSV text. Every line, the last too, ends with CRLF.
 *
 * @param notes Lines written first, each prefixed with "# ". A note with line breaks becomes
 *   several `#` lines.
 * @param header Column names.
 * @param rows One array of cells per row, in header order.
 */
export function toCsv(
  notes: readonly string[],
  header: readonly string[],
  rows: readonly Cell[][],
): string {
  const lines: string[] = [];
  for (const note of notes) for (const line of note.split(/\r\n|\r|\n/)) lines.push(`# ${line}`);
  lines.push(header.map(field).join(','));
  for (const row of rows) lines.push(row.map(field).join(','));
  return lines.map((l) => l + '\r\n').join('');
}
