const EVENTS = Object.freeze(['ready', 'starting', 'stopped', 'launcher_failed', 'startup_failed',
  'submission_failed', 'quote_failed', 'contributor_failed', 'participation_failed', 'reset_failed',
  'client_failed', 'unhandled_failure', 'dispatch_failed']);
function fields(value) {
  const safe = {};
  for (const key of ['code', 'status', 'exitCode']) {
    try { const n = value?.[key];
      if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= (key === 'status' ? 599 : 999999)) safe[key] = n;
    } catch {} // Error objects can have getters; no getter error may escape logging.
  }
  return safe;
}
function normalizeEvent(line) {
  try {
    if (typeof line !== 'string' || Buffer.byteLength(line) > 4096) return null;
    const data = JSON.parse(line);
    return EVENTS.includes(data?.event) ? { event: data.event, ...fields(data) } : null;
  } catch { return null; }
}
function createLogger(write = line => process.stdout.write(line)) {
  return (event, error) => {
    if (!EVENTS.includes(event)) return;
    try { write(JSON.stringify({ time: new Date().toISOString(), event, ...fields(error) }) + '\n'); } catch {}
  };
}
const log = createLogger();
module.exports = { log, createLogger, normalizeEvent, EVENTS };
