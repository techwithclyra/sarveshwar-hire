import ExcelJS from "exceljs";

// Reads the first sheet of an uploaded .xlsx file into an array of plain
// objects, keyed by the header row (row 1). Blank rows are skipped.
export async function parseWorkbookRows(file) {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (!key) return;
      let v = cell.value;
      if (v && typeof v === "object" && "text" in v) v = v.text; // rich text cells
      if (v != null && v !== "") hasValue = true;
      obj[key] = v == null ? "" : String(v);
    });
    if (hasValue) rows.push(obj);
  });
  return rows;
}

// Builds a single-sheet .xlsx from an array of objects and triggers a
// browser download. `columns` is [{ header, key, width? }].
export async function downloadWorkbook(filename, sheetName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 22 }));
  sheet.addRows(rows);
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
