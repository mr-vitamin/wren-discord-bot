const path = require('node:path');
function readLedgerFor(file, store) {
  const ledgerFile = path.join(path.dirname(file), 'privacy-state.json');
  const state = store.readJson(ledgerFile);
  if (state?.version !== 1 || !Array.isArray(state.subjects) || !state.subjects.every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))
    || !Number.isSafeInteger(state.highWaterMark) || state.highWaterMark < 0 || !Array.isArray(state.requiredFiles)
    || state.pending !== null) throw new Error('Valid authoritative privacy ledger required.');
  return { state, ledgerFile };
}
module.exports = { readLedgerFor };
