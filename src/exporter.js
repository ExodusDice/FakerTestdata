// Builds the deliverable CSV + XLSX for a generated test data set, in the
// exact column order requested:
// Project name | Test Name | Tester Positions (Jr/Mid/Sr.) | Test Case | Test Data | Test Type
const path = require('path');
const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'Project name', key: 'project_name', width: 24 },
  { header: 'Test Name', key: 'test_name', width: 28 },
  { header: 'Tester Positions (Jr/Mid/Sr.)', key: 'tester_position', width: 16 },
  { header: 'Test Case', key: 'test_case', width: 40 },
  { header: 'Test Data', key: 'test_data', width: 50 },
  { header: 'Test Type', key: 'test_type', width: 16 }
];

const EXPORT_DIR = path.join(__dirname, '..', 'data', 'exports');

async function writeExports(requestId, rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VASUP-Testdata';
  const sheet = workbook.addWorksheet('Test Data');
  sheet.columns = COLUMNS;
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  const xlsxPath = path.join(EXPORT_DIR, `${requestId}.xlsx`);
  await workbook.xlsx.writeFile(xlsxPath);

  const csvPath = path.join(EXPORT_DIR, `${requestId}.csv`);
  await workbook.csv.writeFile(csvPath);

  return { xlsxPath, csvPath };
}

module.exports = { writeExports, COLUMNS };
