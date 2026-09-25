/**
 * HTML table extraction for upstream documentation pages.
 *
 * Every <table> is expanded into a rectangular grid with `rowspan` and
 * `colspan` resolved, so each grid position points at the cell that covers
 * it. Each table also carries the nearest preceding h2/h3/h4 headings (the
 * Bailian docs nest "model family" h3 sections and "region" h4 tabs).
 */
import { parse } from "parse5";

type Node = {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
  content?: Node;
};

export interface GridCell {
  /** Whitespace-normalised text of the whole cell. */
  text: string;
  /** Text of each block-level line (<p>, <li>, <br> separated), trimmed. */
  lines: string[];
  rowspan: number;
  colspan: number;
  /** Row/column of the cell's top-left origin in the grid. */
  row: number;
  col: number;
  header: boolean;
  /** Stable identity so callers can tell a spanned cell from a repeated one. */
  id: number;
}

export interface ExtractedTable {
  index: number;
  headings: { h2: string; h3: string; h4: string };
  /** Grid rows from <thead> (or leading all-<th> rows when there is no thead). */
  headerRows: GridCell[][];
  bodyRows: GridCell[][];
  columnCount: number;
}

const BLOCK_TAGS = new Set(["p", "li", "div", "br", "tr", "blockquote", "ul", "ol", "section", "h1", "h2", "h3", "h4", "h5", "h6"]);

function normalise(text: string): string {
  return text.replace(/[\s ​]+/g, " ").trim();
}

function attr(node: Node, name: string): string | undefined {
  return node.attrs?.find((entry) => entry.name === name)?.value;
}

function children(node: Node): Node[] {
  if (node.nodeName === "template" && node.content) return node.content.childNodes || [];
  return node.childNodes || [];
}

function collectText(node: Node, out: string[]): void {
  if (node.nodeName === "#text") {
    out.push(node.value || "");
    return;
  }
  if (node.nodeName === "#comment" || node.nodeName === "script" || node.nodeName === "style") return;
  const block = BLOCK_TAGS.has(node.nodeName);
  if (block) out.push("\n");
  for (const child of children(node)) collectText(child, out);
  if (block) out.push("\n");
}

function cellText(node: Node): { text: string; lines: string[] } {
  const parts: string[] = [];
  collectText(node, parts);
  const raw = parts.join("");
  const lines = raw
    .split("\n")
    .map((line) => normalise(line))
    .filter(Boolean);
  return { text: normalise(raw), lines };
}

function positiveInt(value: string | undefined): number {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 1;
}

function directRows(table: Node): Array<{ row: Node; section: "thead" | "tbody" | "tfoot" | "table" }> {
  const rows: Array<{ row: Node; section: "thead" | "tbody" | "tfoot" | "table" }> = [];
  for (const child of children(table)) {
    if (child.nodeName === "tr") rows.push({ row: child, section: "table" });
    if (child.nodeName === "thead" || child.nodeName === "tbody" || child.nodeName === "tfoot") {
      for (const row of children(child)) {
        if (row.nodeName === "tr") rows.push({ row, section: child.nodeName });
      }
    }
  }
  return rows;
}

let nextCellId = 1;

/** Expands one <table> into a grid with row/col spans resolved. */
export function expandTable(table: Node): { rows: GridCell[][]; headerRowCount: number; columnCount: number } {
  const sourceRows = directRows(table);
  const grid: GridCell[][] = [];
  let explicitHeaderRows = 0;
  sourceRows.forEach(({ row, section }, rowIndex) => {
    if (section === "thead") explicitHeaderRows = rowIndex + 1;
    grid[rowIndex] = grid[rowIndex] || [];
    let col = 0;
    for (const cellNode of children(row)) {
      if (cellNode.nodeName !== "td" && cellNode.nodeName !== "th") continue;
      while (grid[rowIndex][col]) col += 1;
      const rowspan = positiveInt(attr(cellNode, "rowspan"));
      const colspan = positiveInt(attr(cellNode, "colspan"));
      const { text, lines } = cellText(cellNode);
      const cell: GridCell = {
        text,
        lines,
        rowspan,
        colspan,
        row: rowIndex,
        col,
        header: cellNode.nodeName === "th" || section === "thead",
        id: nextCellId++,
      };
      for (let dr = 0; dr < rowspan; dr += 1) {
        // A rowspan may not extend past the table's own rows.
        if (rowIndex + dr >= sourceRows.length) break;
        grid[rowIndex + dr] = grid[rowIndex + dr] || [];
        for (let dc = 0; dc < colspan; dc += 1) {
          grid[rowIndex + dr][col + dc] = cell;
        }
      }
      col += colspan;
    }
  });
  let headerRowCount = explicitHeaderRows;
  if (!headerRowCount) {
    while (headerRowCount < grid.length && grid[headerRowCount].every((cell) => cell?.header)) headerRowCount += 1;
  }
  const columnCount = grid.reduce((max, row) => Math.max(max, row.length), 0);
  // Fill ragged rows so every grid row has columnCount entries.
  for (const row of grid) {
    for (let col = 0; col < columnCount; col += 1) {
      if (!row[col]) {
        row[col] = { text: "", lines: [], rowspan: 1, colspan: 1, row: -1, col, header: false, id: nextCellId++ };
      }
    }
  }
  return { rows: grid, headerRowCount, columnCount };
}

/** Parses an HTML document and returns every table with its section headings. */
export function extractTables(html: string): ExtractedTable[] {
  const document = parse(html) as unknown as Node;
  const headings = { h2: "", h3: "", h4: "" };
  const tables: ExtractedTable[] = [];

  const visit = (node: Node): void => {
    if (node.nodeName === "h2" || node.nodeName === "h3" || node.nodeName === "h4") {
      const text = cellText(node).text;
      if (node.nodeName === "h2") {
        headings.h2 = text;
        headings.h3 = "";
        headings.h4 = "";
      } else if (node.nodeName === "h3") {
        headings.h3 = text;
        headings.h4 = "";
      } else {
        headings.h4 = text;
      }
      return;
    }
    if (node.nodeName === "table") {
      const expanded = expandTable(node);
      tables.push({
        index: tables.length,
        headings: { ...headings },
        headerRows: expanded.rows.slice(0, expanded.headerRowCount),
        bodyRows: expanded.rows.slice(expanded.headerRowCount),
        columnCount: expanded.columnCount,
      });
      return; // nested tables are not used by these pages
    }
    for (const child of children(node)) visit(child);
  };
  visit(document);
  return tables;
}

/** Header label for a column: every distinct header cell text above it, joined. */
export function columnHeader(table: ExtractedTable, col: number): string {
  const seen = new Set<number>();
  const parts: string[] = [];
  for (const row of table.headerRows) {
    const cell = row[col];
    if (!cell || seen.has(cell.id)) continue;
    seen.add(cell.id);
    parts.push(cell.text);
  }
  return parts.join(" / ");
}

/** Text of the lowest header cell above a column (the most specific label). */
export function leafHeader(table: ExtractedTable, col: number): string {
  for (let index = table.headerRows.length - 1; index >= 0; index -= 1) {
    const cell = table.headerRows[index][col];
    if (cell && cell.text) return cell.text;
  }
  return "";
}

/** Compact form for keyword matching: no whitespace. */
export function compact(text: string): string {
  return text.replace(/[\s ​]+/g, "");
}
