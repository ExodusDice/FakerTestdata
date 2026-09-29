// Tiny file-backed JSON data store. This is an internal low-volume tool
// (approval workflow + test data requests for a QA team), so a single JSON
// file with atomic writes is simpler and more portable than standing up a
// real database engine, and avoids native module builds entirely.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY = {
  users: [],
  requests: [],
  tokenUsage: [],
  emailLog: [],
  actionTokens: [] // one-time tokens for approve/reject/reset links
};

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY, null, 2));
    return structuredClone(EMPTY);
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(data) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

// Simple synchronous "transaction" - fine at this scale (single node process).
function update(fn) {
  const data = load();
  const result = fn(data);
  save(data);
  return result;
}

module.exports = { load, save, update };
