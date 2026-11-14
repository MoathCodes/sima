/**
 * CSV for the "Download … (CSV)" links. Owner: lane B. Pure.
 *
 * Plain RFC 4180: comma separated, CRLF line ends, fields quoted when they hold a comma, a quote
 * or a line break. The file starts with `#` lines that say what it is, how it was measured, that
 * finds are candidates and not discoveries, and where the pixels came from; a simulated patch
 * says SIMULATED there (H3). TOPCAT, spreadsheets and `pandas.read_csv(…, comment='#')` read it.
 *
 * PHASE 0 STUB: returns a fixed fake file.
 */

/** One cell. null is written as an empty field; booleans as 1 and 0. */
export type Cell = string | number | boolean | null;

/**
 * A table → CSV text.
 * PHASE 0 STUB: always a one-line file that says it is a stub.
 *
 * @param notes Lines written first, each prefixed with "# ".
 * @param header Column names.
 * @param rows One array of cells per row, in header order.
 */
export function toCsv(
  notes: readonly string[],
  header: readonly string[],
  rows: readonly Cell[][],
): string {
  return '# Phase 0 stub: no data\r\n';
}
