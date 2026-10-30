// A small .xlsx writer: sheets of plain text and numbers, nothing else, in a ZIP stored without compression.
// Written by hand so the app needs no library.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A ZIP file of [{ name, data: Uint8Array }], each stored as it is.
function zipStored(files, date = new Date()) {
  const enc = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const head = (sig, central) => {
      const b = new Uint8Array((central ? 46 : 30) + name.length), v = new DataView(b.buffer);
      v.setUint32(0, sig, true);
      let p = 4;
      if (central) { v.setUint16(p, 20, true); p += 2; } // made by
      v.setUint16(p, 20, true); // version needed
      v.setUint16(p + 2, 0x0800, true); // UTF-8 names
      v.setUint16(p + 4, 0, true); // stored
      v.setUint16(p + 6, time, true);
      v.setUint16(p + 8, day, true);
      v.setUint32(p + 10, crc, true);
      v.setUint32(p + 14, size, true);
      v.setUint32(p + 18, size, true);
      v.setUint16(p + 22, name.length, true);
      if (central) v.setUint32(p + 36, offset, true); // the rest (extra, comment, disk, attributes) stay 0
      b.set(name, central ? 46 : 30);
      return b;
    };
    const local = head(0x04034b50, false);
    locals.push(local, f.data);
    centrals.push(head(0x02014b50, true));
    offset += local.length + size;
  }
  const dirSize = centrals.reduce((s, b) => s + b.length, 0);
  const end = new Uint8Array(22), v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, files.length, true);
  v.setUint16(10, files.length, true);
  v.setUint32(12, dirSize, true);
  v.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of parts) { out.set(b, p); p += b.length; }
  return out;
}

// An .xlsx file of [{ name, rows: [[cell]] }]: numbers as numbers, everything else as text.
function xlsxFile(sheets) {
  const x = (s) => String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const colName = (i) => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  const strings = [], index = new Map();
  const si = (s) => { if (!index.has(s)) { index.set(s, strings.length); strings.push(s); } return index.get(s); };
  const sheetXml = (rows) => {
    const widths = [];
    for (const r of rows) r.forEach((v, i) => { widths[i] = Math.max(widths[i] || 8, Math.min(60, String(v ?? "").length + 2)); });
    const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
      if (v === "" || v === null || v === undefined) return "";
      const ref = colName(ci) + (ri + 1);
      return typeof v === "number" && Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${si(String(v))}</v></c>`;
    }).join("")}</row>`).join("");
    return `${xml}<worksheet ${ns} xmlns:r="${rel}"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${body}</sheetData></worksheet>`;
  };
  const sheetFiles = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s.rows) }));
  const files = [
    { name: "[Content_Types].xml", text: `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>` },
    { name: "_rels/.rels", text: `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", text: `${xml}<workbook ${ns} xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", text: `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="${rel}/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    { name: "xl/styles.xml", text: `${xml}<styleSheet ${ns}><fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...sheetFiles,
  ];
  // The shared strings last, once every sheet has added its own.
  files.push({ name: "xl/sharedStrings.xml", text: `${xml}<sst ${ns} count="${strings.length}" uniqueCount="${strings.length}">${strings.map((s) => `<si><t xml:space="preserve">${x(s)}</t></si>`).join("")}</sst>` });
  const enc = new TextEncoder();
  return zipStored(files.map((f) => ({ name: f.name, data: enc.encode(f.text) })));
}
