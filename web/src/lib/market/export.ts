import { deflateRawSync } from "node:zlib";

export const MARKET_EXPORT_LIMIT = 10_000;

export function parseUtcInstant(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface ExportPoint {
  symbol: string;
  asset: string;
  source: string;
  timestamp: Date;
  currency: string;
  unit: string;
  frequency: string;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string;
  volume: string | null;
  corrected: boolean | null;
  missing: boolean | null;
}

const HEADERS = [
  "ativo",
  "nome",
  "fonte",
  "data_utc",
  "moeda",
  "unidade",
  "frequencia",
  "abertura",
  "maxima",
  "minima",
  "fechamento",
  "volume",
  "corrigido",
  "ausente",
];

function fields(point: ExportPoint): (string | number | Date | null)[] {
  return [
    point.symbol,
    point.asset,
    point.source,
    point.timestamp,
    point.currency,
    point.unit,
    point.frequency,
    point.open,
    point.high,
    point.low,
    point.close,
    point.volume,
    point.corrected == null ? "não informado" : point.corrected ? "sim" : "não",
    point.missing == null ? "não informado" : point.missing ? "sim" : "não",
  ];
}

function safeText(value: string): string {
  return /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number | Date | null, numeric: boolean): string {
  if (value == null) return "";
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const formatted = numeric ? raw.replace(".", ",") : safeText(raw);
  return `"${formatted.replaceAll('"', '""')}"`;
}

export function toMarketCsv(points: ExportPoint[]): Buffer {
  const lines = [HEADERS.map((h) => csvCell(h, false)).join(";")];
  for (const point of points) {
    lines.push(
      fields(point)
        .map((value, index) => csvCell(value, index >= 7 && index <= 11))
        .join(";")
    );
  }
  return Buffer.from(`\uFEFF${lines.join("\r\n")}\r\n`, "utf8");
}

const xml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

function column(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    n--;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function excelDate(value: Date): number {
  return (value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function worksheet(points: ExportPoint[]): string {
  const rows = [HEADERS, ...points.map(fields)];
  const body = rows
    .map(
      (row, ri) =>
        `<row r="${ri + 1}">${row
          .map((value, ci) => {
            if (value == null) return "";
            const ref = `${column(ci)}${ri + 1}`;
            if (value instanceof Date) return `<c r="${ref}" s="1"><v>${excelDate(value)}</v></c>`;
            if (ri > 0 && ci >= 7 && ci <= 11)
              return `<c r="${ref}"><v>${xml(String(value))}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t>${xml(safeText(String(value)))}</t></is></c>`;
          })
          .join("")}</row>`
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const raw = Buffer.from(content);
    const compressed = deflateRawSync(raw);
    const checksum = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(checksum, 14);
    lh.writeUInt32LE(compressed.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(filename.length, 26);
    local.push(lh, filename, compressed);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(checksum, 16);
    ch.writeUInt32LE(compressed.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(filename.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, filename);
    offset += lh.length + filename.length + compressed.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

export function toMarketXlsx(points: ExportPoint[]): Buffer {
  return zip({
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Histórico" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml":
      '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="164" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    "xl/worksheets/sheet1.xml": worksheet(points),
  });
}
