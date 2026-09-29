// Best-effort text extraction from uploaded BRD/FSD, Test Case and Test Plan
// attachments, so their content can be fed into the AI prompt as real context
// instead of just a filename. Falls back gracefully for unsupported formats.
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const ExcelJS = require('exceljs');

const MAX_CHARS = 12000; // keep prompt size sane per attachment

async function extractText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  try {
    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return truncate(result.value);
    }
    if (ext === '.pdf') {
      const buf = fs.readFileSync(filePath);
      const result = await pdfParse(buf);
      return truncate(result.text);
    }
    if (ext === '.txt' || ext === '.md' || ext === '.csv') {
      return truncate(fs.readFileSync(filePath, 'utf8'));
    }
    if (ext === '.xlsx' || ext === '.xls') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      let out = '';
      wb.eachSheet((sheet) => {
        out += `\n# Sheet: ${sheet.name}\n`;
        sheet.eachRow((row) => {
          out += row.values.filter((v) => v !== null && v !== undefined).join(' | ') + '\n';
        });
      });
      return truncate(out);
    }
    return `[Unsupported file type "${ext}" - filename only: ${originalName}]`;
  } catch (err) {
    return `[Could not extract text from ${originalName}: ${err.message}]`;
  }
}

function truncate(str) {
  if (!str) return '';
  return str.length > MAX_CHARS ? str.slice(0, MAX_CHARS) + '\n...[truncated]' : str;
}

module.exports = { extractText };
