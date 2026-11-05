import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { toMarketCsv, toMarketXlsx, type ExportPoint } from "./export";

const point: ExportPoint = {
  symbol: "HRC",
  asset: '=HYPERLINK("https://evil.test")',
  source: "MANUAL_IMPORT",
  timestamp: new Date("2026-11-05T00:00:00.000Z"),
  currency: "BRL",
  unit: "kg",
  frequency: "observação",
  open: "1.2500",
  high: "2.2500",
  low: "1.0000",
  close: "2.0000",
  volume: null,
  corrected: false,
  missing: false,
};

function zipEntry(file: Buffer, name: string): string {
  let offset = 0;
  while (file.readUInt32LE(offset) === 0x04034b50) {
    const size = file.readUInt32LE(offset + 18);
    const filenameLength = file.readUInt16LE(offset + 26);
    const extraLength = file.readUInt16LE(offset + 28);
    const filename = file.subarray(offset + 30, offset + 30 + filenameLength).toString();
    const start = offset + 30 + filenameLength + extraLength;
    if (filename === name) return inflateRawSync(file.subarray(start, start + size)).toString();
    offset = start + size;
  }
  throw new Error(`Arquivo ${name} ausente.`);
}

describe("exportação de histórico", () => {
  it("gera CSV UTF-8, decimal pt-BR e neutraliza fórmula externa", () => {
    const csv = toMarketCsv([point]).toString("utf8");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("2026-11-05T00:00:00.000Z");
    expect(csv).toContain('"2,0000"');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });

  it("gera XLSX válido com número e data tipados, sem célula de fórmula", () => {
    const xlsx = toMarketXlsx([point]);
    expect(xlsx.readUInt32LE(0)).toBe(0x04034b50);
    const sheet = zipEntry(xlsx, "xl/worksheets/sheet1.xml");
    expect(sheet).toContain('<c r="D2" s="1"><v>');
    expect(sheet).toContain('<c r="K2"><v>2.0000</v></c>');
    expect(sheet).toContain("&apos;=HYPERLINK");
    expect(sheet).not.toContain("<f>");
  });
});
