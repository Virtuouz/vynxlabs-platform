import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type Result, toCsv, toXlsx } from "./kit/export.ts";

const result = (names: [string, string][], rows: unknown[][]): Result => ({
  columns: names.map(([name]) => ({ name })),
  rows,
});

describe("a result as a file", () => {
  const awkward = result(
    [
      ["name", "text"],
      ["n", "number"],
      ["note", "text"],
    ],
    [
      ['Say "hi"', 1.5, "a,b"],
      ["=SUM(A1)", null, "line\nbreak"],
      ["<&>", 0, { a: 1 }],
    ],
  );

  test("as CSV, quoted where it must be, and never read as a formula", () => {
    expect(toCsv(awkward)).toBe(
      [
        "name,n,note",
        '"Say ""hi""",1.5,"a,b"',
        `'=SUM(A1),,"line\nbreak"`,
        '<&>,0,"{""a"":1}"',
      ].join("\r\n"),
    );
  });

  test("as a spreadsheet, a zip that a reader of the format opens to the same values", () => {
    const bytes = toXlsx(awkward, "Fees: 2026");
    // A zip begins with a local file header and ends with the end of its directory.
    expect([...bytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect([...bytes.subarray(bytes.length - 22, bytes.length - 18)]).toEqual([
      0x50, 0x4b, 0x05, 0x06,
    ]);
    // Read back by Python's zip reader, which checks each file's checksum, and by an XML parser.
    const file = join(mkdtempSync(join(tmpdir(), "vx-xlsx-")), "result.xlsx");
    writeFileSync(file, bytes);
    const read = execFileSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import sys, zipfile, json, xml.etree.ElementTree as ET",
          "z = zipfile.ZipFile(sys.argv[1])",
          "assert z.testzip() is None",
          "for name in z.namelist(): ET.fromstring(z.read(name))",
          "ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}",
          "sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))",
          "rows = [[(c.get('r'), c.get('t'), (c.find('m:v', ns).text if c.find('m:v', ns) is not None else c.find('m:is/m:t', ns).text)) for c in r.findall('m:c', ns)] for r in sheet.findall('m:sheetData/m:row', ns)]",
          "book = ET.fromstring(z.read('xl/workbook.xml'))",
          "print(json.dumps({'files': sorted(z.namelist()), 'rows': rows, 'sheet': book.find('m:sheets/m:sheet', ns).get('name')}))",
        ].join("\n"),
        file,
      ],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(read);
    expect(parsed.files).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
    // A sheet's name cannot hold a colon.
    expect(parsed.sheet).toBe("Fees  2026");
    expect(parsed.rows).toEqual([
      [
        ["A1", "inlineStr", "name"],
        ["B1", "inlineStr", "n"],
        ["C1", "inlineStr", "note"],
      ],
      [
        ["A2", "inlineStr", 'Say "hi"'],
        ["B2", null, "1.5"],
        ["C2", "inlineStr", "a,b"],
      ],
      // Text is text in a spreadsheet's own format: nothing reads it as a formula. An empty cell is left out.
      [
        ["A3", "inlineStr", "=SUM(A1)"],
        ["C3", "inlineStr", "line\nbreak"],
      ],
      [
        ["A4", "inlineStr", "<&>"],
        ["B4", null, "0"],
        ["C4", "inlineStr", '{"a":1}'],
      ],
    ]);
  });
});
