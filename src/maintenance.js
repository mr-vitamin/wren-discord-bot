const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { secureStore, assertSafePath } = require('./secure-storage');
const { parseSubmissions, submissionPayload } = require('./submissions');
const { validateIssue } = require('./contributor');
const { acquireLock } = require('./operation-lock');

const NAMES = { submissions: 'submissions.json', issue: 'contributor-issue.json' };
function subjectHash(id) { return createHash('sha256').update(`Wren deletion v1\0${id}`).digest('hex'); }
function createMaintenance({ root, store = secureStore, assertStopped } = {}) {
  root = path.resolve(root);
  const dataDir = path.join(root, 'data'), backupDir = path.join(root, 'backups/managed');
  const stateFile = path.join(dataDir, 'privacy-state.json');
  const target = key => path.join(dataDir, NAMES[key]);
  function exists(file) { assertSafePath(file); return fs.existsSync(file); }
  function state() {
    if (!exists(stateFile)) {
      const initialized = exists(path.join(dataDir, 'privacy-initialized.json'))
        || (exists(backupDir) && fs.readdirSync(backupDir).length > 0)
        || Object.keys(NAMES).some(key => exists(target(key)) && (() => {
          try { return JSON.parse(fs.readFileSync(target(key), 'utf8'))?.format === 'wren-dpapi'; } catch { return true; }
        })());
      if (initialized) throw new Error('Authoritative privacy ledger missing; recovery required.');
      return { version: 1, subjects: [], highWaterMark: 0, backupRoots: [], requiredFiles: [], pending: null };
    }
    const s = store.readJson(stateFile);
    if (s?.version !== 1 || !Array.isArray(s.subjects) || s.subjects.some(v => !/^[a-f0-9]{64}$/.test(v))
      || !Number.isSafeInteger(s.highWaterMark) || s.highWaterMark < 0 || !Array.isArray(s.backupRoots)
      || s.backupRoots.some(v => typeof v !== 'string' || !path.isAbsolute(v))
      || !Array.isArray(s.requiredFiles) || s.requiredFiles.some(v => !Object.values(NAMES).includes(v))
      || ![null, 'erase', 'migration', 'restore'].includes(s.pending)) throw new Error('Invalid maintenance state.');
    return s;
  }
  function normalize(key, value) {
    return key === 'submissions' ? submissionPayload(parseSubmissions(value)) : validateIssue(value);
  }
  function readActive(allowLegacy = false) {
    const files = {}, originals = {};
    for (const key of Object.keys(NAMES)) {
      if (!exists(target(key))) continue;
      const bytes = fs.readFileSync(target(key));
      let parsed; try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('Invalid protected data; migration refused.'); }
      if (parsed?.format === 'wren-dpapi') files[key] = normalize(key, store.readJson(target(key)));
      else {
        if (!allowLegacy) throw new Error('Protected storage migration required.');
        files[key] = normalize(key, parsed); originals[key] = bytes.toString('base64');
      }
    }
    return { files, originals };
  }
  function validateBackup(b) {
    if (!b || b.version !== 1 || !['wren-backup', 'wren-originals'].includes(b.format)
      || !b.files || typeof b.files !== 'object' || Array.isArray(b.files)) throw new Error('Invalid backup.');
    for (const [key, value] of Object.entries(b.files)) {
      if (!Object.hasOwn(NAMES, key)) throw new Error('Invalid backup.');
      normalize(key, value);
    }
    if (b.originals) {
      for (const [key, value] of Object.entries(b.originals)) {
        if (!Object.hasOwn(NAMES, key) || typeof value !== 'string') throw new Error('Invalid backup.');
        normalize(key, JSON.parse(Buffer.from(value, 'base64').toString('utf8')));
      }
    }
    return b;
  }
  function inventory(s) {
    const entries = [], seen = new Set(); let unresolvedLocations = 0;
    if (exists(dataDir)) {
      // A process killed between temp creation and rename may leave a decryptable prior copy.
      unresolvedLocations += fs.readdirSync(dataDir).filter(name => name.endsWith('.tmp')).length;
    }
    function walk(dir, optional = false) {
      try {
        assertSafePath(dir);
        if (!fs.existsSync(dir)) { if (!optional) unresolvedLocations++; return; }
        const canonical = fs.realpathSync(dir).toLowerCase(); if (seen.has(canonical)) return; seen.add(canonical);
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, item.name);
          try {
            assertSafePath(file);
            if (item.isDirectory()) { walk(file); continue; }
            if (!item.isFile() || !item.name.endsWith('.wren')) throw new Error();
            entries.push({ file, payload: validateBackup(store.readJson(file)) });
          } catch { unresolvedLocations++; }
        }
      } catch { unresolvedLocations++; }
    }
    walk(backupDir, true); for (const dir of s.backupRoots) walk(dir);
    return { entries, unresolvedLocations };
  }
  function stopped() {
    if (typeof assertStopped !== 'function') throw new Error('Stopped-bot verification required.');
    assertStopped(root);
  }
  function attest(options) {
    if (!options.verifiedRequest || !options.inventoryConfirmed) throw new Error('Request verification and inventory confirmation required.');
  }
  function filtered(files, s) {
    if (!files.submissions) return { files, removed: 0, cleared: 0 };
    const original = normalize('submissions', files.submissions);
    if (original.deletionGeneration > s.subjects.length) throw new Error('Authoritative ledger is older than stored data.');
    const hashes = new Set(s.subjects.slice(original.deletionGeneration)); let removed = 0, cleared = 0;
    const records = original.records.filter(r => { if (hashes.has(subjectHash(r.authorId))) { removed++; return false; } return true; }).map(r => {
      const copy = { ...r };
      for (const key of ['editorId', 'submittedById']) if (copy[key] && hashes.has(subjectHash(copy[key]))) { copy[key] = null; cleared++; }
      return copy;
    });
    return { files: { ...files, submissions: { ...original, highWaterMark: Math.max(original.highWaterMark, s.highWaterMark), deletionGeneration: s.subjects.length, records } }, removed, cleared };
  }
  function filteredBackup(b, s) {
    const result = { ...b, files: filtered(b.files, s).files };
    if (b.originals) {
      result.originals = { ...b.originals };
      for (const [key, value] of Object.entries(b.originals)) {
        if (key !== 'submissions') continue;
        const original = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
        const clean = filtered({ submissions: normalize('submissions', original) }, s).files.submissions;
        result.originals[key] = Buffer.from(JSON.stringify(clean)).toString('base64');
      }
    }
    return result;
  }
  function newBackup(prefix, payload) {
    const name = `${prefix}-${Date.now()}-${randomUUID()}.wren`;
    const file = path.join(backupDir, name); store.writeJson(file, payload);
    const restored = store.readJson(file);
    if (JSON.stringify(restored) !== JSON.stringify(payload)) throw new Error('Backup verification failed.');
    return name;
  }
  function migrate(options = {}) {
    if (options.apply) stopped();
    const s = state(); if (s.pending && s.pending !== 'migration') throw new Error('Pending maintenance must finish first.');
    const active = readActive(true); const keys = Object.keys(active.originals);
    const result = { operation: 'migrate', applied: false, wouldChangeFiles: keys.length };
    if (!options.apply) return result;
    s.highWaterMark = Math.max(s.highWaterMark, active.files.submissions?.highWaterMark || 0);
    s.requiredFiles = [...new Set([...s.requiredFiles, ...Object.keys(active.files).map(k => NAMES[k])])];
    s.pending = 'migration'; store.writeJson(stateFile, s);
    if (keys.length) {
      const snapshot = { format: 'wren-originals', version: 1, files: active.files, originals: active.originals };
      newBackup('original', s.subjects.length ? filteredBackup(snapshot, s) : snapshot);
      for (const key of keys) store.writeJson(target(key), filtered(active.files, s).files[key]);
    }
    store.writeJson(path.join(dataDir, 'privacy-initialized.json'), { version: 1 });
    s.pending = null; store.writeJson(stateFile, s); result.applied = true; return result;
  }
  function backup(options = {}) {
    if (options.apply) stopped(); assertReady(); const s = state(); const active = readActive();
    const result = { operation: 'backup', applied: false, wouldChangeFiles: 1 };
    if (options.apply) { newBackup('backup', { format: 'wren-backup', version: 1, files: filtered(active.files, s).files }); result.applied = true; }
    return result;
  }
  function erase(id, options = {}) {
    if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) throw new Error('Invalid request identifier.');
    return eraseHashes(subjectHash(id), options);
  }
  function eraseHashes(hash, options = {}) {
    if (options.apply) { attest(options); stopped(); }
    const s = state(); if (s.pending && s.pending !== 'erase') throw new Error('Pending maintenance must finish first.');
    if (hash) s.subjects.push(hash); // Each legitimate new request applies to activity since the prior request too.
    const active = readActive(); s.highWaterMark = Math.max(s.highWaterMark, active.files.submissions?.highWaterMark || 0);
    const inv = inventory(s), clean = filtered(active.files, s);
    const result = { operation: 'erase', applied: false, activeRemovedRecords: clean.removed,
      activeClearedReferences: clean.cleared, backupFiles: inv.entries.length, unresolvedLocations: inv.unresolvedLocations,
      registeredScopeComplete: false };
    if (!options.apply) return result;
    if (inv.unresolvedLocations) throw new Error('Backup inventory incomplete; no deletion applied.');
    s.pending = 'erase'; store.writeJson(stateFile, s);
    try {
      for (const entry of inv.entries) store.writeJson(entry.file, filteredBackup(entry.payload, s));
      if (clean.files.submissions) store.writeJson(target('submissions'), clean.files.submissions);
      s.pending = null; store.writeJson(stateFile, s);
    } catch { throw new Error('Deletion maintenance pending; resume before starting Wren.'); }
    result.applied = true; result.registeredScopeComplete = true; return result;
  }
  function restore(name, options = {}) {
    if (options.apply) stopped(); const s = state(); if (s.pending) throw new Error('Pending maintenance must finish first.');
    if (typeof name !== 'string' || path.basename(name) !== name || !name.endsWith('.wren')) throw new Error('Invalid backup selection.');
    const file = path.join(backupDir, name); assertSafePath(file);
    const snapshot = validateBackup(store.readJson(file)); const files = filtered(snapshot.files, s).files;
    const current = readActive();
    if (files.submissions) files.submissions.highWaterMark = Math.max(files.submissions.highWaterMark, current.files.submissions?.highWaterMark || 0, s.highWaterMark);
    const result = { operation: 'restore', applied: false, wouldChangeFiles: Object.keys(files).length };
    if (options.apply) {
      newBackup('before-restore', { format: 'wren-backup', version: 1, files: filtered(current.files, s).files });
      s.pending = 'restore'; s.restoreFiles = files; store.writeJson(stateFile, s);
      for (const [key, value] of Object.entries(files)) store.writeJson(target(key), value);
      s.highWaterMark = Math.max(s.highWaterMark, files.submissions?.highWaterMark || 0);
      s.pending = null; delete s.restoreFiles; store.writeJson(stateFile, s); result.applied = true;
    }
    return result;
  }
  function registerBackupRoot(directory, options = {}) {
    if (options.apply) stopped(); assertSafePath(directory);
    const s = state(); if (s.pending) throw new Error('Pending maintenance must finish first.');
    const selected = path.resolve(directory); if (!s.backupRoots.includes(selected)) s.backupRoots.push(selected);
    const inv = inventory(s);
    if (options.apply) { if (inv.unresolvedLocations) throw new Error('Backup inventory incomplete.'); store.writeJson(stateFile, s); }
    return { operation: 'register-backup', applied: Boolean(options.apply), backupFiles: inv.entries.length, unresolvedLocations: inv.unresolvedLocations };
  }
  function assertReady() {
    if (!exists(stateFile)) throw new Error('Protected storage migration required: authoritative ledger missing.');
    const s = state(); if (s.pending) throw new Error('Pending maintenance must finish before startup.');
    if (exists(dataDir) && fs.readdirSync(dataDir).some(name => name.endsWith('.tmp'))) throw new Error('Unresolved protected temporary copy requires operator review.');
    if (s.requiredFiles.some(name => !exists(path.join(dataDir, name)))) throw new Error('Required active storage missing; restore required.');
    if (s.highWaterMark > 0 && !exists(target('submissions'))) throw new Error('Required submission storage missing; restore required.');
    const active = readActive();
    if (!exists(stateFile) && Object.keys(active.files).length) throw new Error('Protected storage migration required.');
    if (active.files.submissions && active.files.submissions.deletionGeneration !== s.subjects.length) throw new Error('Deletion maintenance must be replayed.');
    return true;
  }
  function resume(options = {}) {
    const s = state();
    if (s.pending === 'erase') return eraseHashes(null, options);
    if (s.pending === 'migration') return migrate(options);
    if (s.pending !== 'restore' || !s.restoreFiles) throw new Error('No resumable maintenance found.');
    for (const [key, value] of Object.entries(s.restoreFiles)) {
      if (!Object.hasOwn(NAMES, key)) throw new Error('Invalid recovery state.'); normalize(key, value);
    }
    if (options.apply) {
      stopped();
      const files = filtered(s.restoreFiles, s).files;
      for (const [key, value] of Object.entries(files)) store.writeJson(target(key), value);
      s.highWaterMark = Math.max(s.highWaterMark, files.submissions?.highWaterMark || 0);
      s.pending = null; delete s.restoreFiles; store.writeJson(stateFile, s);
    }
    return { operation: 'resume', applied: Boolean(options.apply), wouldChangeFiles: Object.keys(s.restoreFiles || {}).length };
  }
  function locked(operation) {
    return (...args) => {
      const options = args.at(-1);
      if (!options?.apply) return operation(...args);
      stopped(); const release = acquireLock(root);
      try { return operation(...args); } finally { release(); }
    };
  }
  return { migrate: locked(migrate), backup: locked(backup), erase: locked(erase), restore: locked(restore), registerBackupRoot: locked(registerBackupRoot), assertReady,
    inspect() { const s = state(); const inv = inventory(s); return { operation: 'inspect', backupFiles: inv.entries.length, unresolvedLocations: inv.unresolvedLocations, pending: Boolean(s.pending) }; },
    resume: locked(resume),
  };
}
module.exports = { createMaintenance };
