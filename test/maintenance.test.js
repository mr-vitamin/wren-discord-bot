const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/secure-storage');
const { createMaintenance } = require('../src/maintenance');
const { addSubmission } = require('../src/submissions');
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-maintenance-'));
  const crypto = require('node:crypto'), key = crypto.randomBytes(32);
  const store = createStore({ protect(b) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
    return Buffer.concat([iv, c.update(b), c.final(), c.getAuthTag()]); },
  unprotect(b) { const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));d.setAuthTag(b.subarray(-16));return Buffer.concat([d.update(b.subarray(12, -16)), d.final()]); }, restrict() {} });
  fs.mkdirSync(path.join(root, 'data'));
  const records = [];
  addSubmission(records, { title: 'SYNTHETIC_A', authorId: '111', submittedById: '222' });
  const other = addSubmission(records, { title: 'SYNTHETIC_B', authorId: '333', submittedById: '111' }); other.editorId = '111';
  const file = path.join(root, 'data/submissions.json'); fs.writeFileSync(file, JSON.stringify(records));
  let stopped = true;
  const maintenance = createMaintenance({ root, store, assertStopped() { if (!stopped) throw new Error('Bot must be stopped.'); } });
  return { root, file, store, maintenance, running() { stopped = false; }, clean() { fs.rmSync(root, { recursive: true, force: true }); } };
}
const apply = { apply: true, verifiedRequest: true, inventoryConfirmed: true };
test('migration previews do not mutate and apply preserves records plus encrypted original-byte recovery', () => {
  const f = setup(); try {
    const before = fs.readFileSync(f.file);
    const preview = f.maintenance.migrate(); assert.equal(preview.wouldChangeFiles, 1);
    assert.deepEqual(fs.readFileSync(f.file), before);
    f.maintenance.migrate({ apply: true });
    assert.doesNotMatch(fs.readFileSync(f.file, 'utf8'), /SYNTHETIC|authorId/);
    assert.equal(f.store.readJson(f.file).records.length, 2);
    const backup = fs.readdirSync(path.join(f.root, 'backups/managed'))[0];
    const payload = f.store.readJson(path.join(f.root, 'backups/managed', backup));
    assert.deepEqual(Buffer.from(payload.originals.submissions, 'base64'), before);
    f.maintenance.assertReady();
  } finally { f.clean(); }
});
test('deletion filters authored records and references in active data and every backup without reusing IDs', () => {
  const f = setup(); try {
    f.maintenance.migrate({ apply: true }); f.maintenance.backup({ apply: true });
    const before = fs.readFileSync(f.file); const preview = f.maintenance.erase('111');
    assert.equal(preview.activeRemovedRecords, 1); assert.deepEqual(fs.readFileSync(f.file), before);
    f.maintenance.erase('111', apply);
    const data = f.store.readJson(f.file); assert.equal(data.records.length, 1);
    assert.equal(data.records[0].editorId, null); assert.equal(data.records[0].submittedById, null);
    assert.equal(data.highWaterMark, 2);
    for (const name of fs.readdirSync(path.join(f.root, 'backups/managed'))) {
      const backup = f.store.readJson(path.join(f.root, 'backups/managed', name));
      assert.equal(JSON.stringify(backup).includes('"111"'), false);
      if (backup.originals?.submissions) assert.equal(Buffer.from(backup.originals.submissions, 'base64').toString().includes('"111"'), false);
    }
    const { loadSubmissions, saveSubmissions } = require('../src/submissions');
    const records = loadSubmissions(f.file, f.store); const next = addSubmission(records, { title: 'new', authorId: '444', submittedById: '222' });
    assert.equal(next.id, 'WP-003'); saveSubmissions(f.file, records, f.store);
  } finally { f.clean(); }
});
test('restore of an older encrypted backup replays deletion decisions and preserves the high-water mark', () => {
  const f = setup(); try {
    f.maintenance.migrate({ apply: true }); f.maintenance.backup({ apply: true });
    const backupDir = path.join(f.root, 'backups/managed'); const name = fs.readdirSync(backupDir).find(n => n.startsWith('backup-'));
    const old = fs.readFileSync(path.join(backupDir, name)); f.maintenance.erase('111', apply);
    fs.writeFileSync(path.join(backupDir, name), old); // An old external backup reappears.
    f.maintenance.restore(name, { apply: true });
    assert.equal(f.store.readJson(f.file).records.some(r => r.authorId === '111'), false);
    assert.equal(f.store.readJson(f.file).highWaterMark, 2);
  } finally { f.clean(); }
});
test('running bot, malformed data, missing attestations and unknown backups prevent mutation', () => {
  const f = setup(); try {
    assert.throws(() => f.maintenance.assertReady(), /migration|protected/i);
    f.running(); const original = fs.readFileSync(f.file);
    assert.throws(() => f.maintenance.migrate({ apply: true }), /stopped/);
    assert.deepEqual(fs.readFileSync(f.file), original);
  } finally { f.clean(); }
  const g = setup(); try {
    g.maintenance.migrate({ apply: true }); const original = fs.readFileSync(g.file);
    assert.throws(() => g.maintenance.erase('111', { apply: true }), /verification|inventory/i);
    fs.writeFileSync(path.join(g.root, 'backups/managed/unknown.txt'), 'SYNTHETIC_UNKNOWN');
    const preview = g.maintenance.erase('111'); assert.equal(preview.unresolvedLocations, 1);
    assert.throws(() => g.maintenance.erase('111', apply), /inventory/i);
    assert.deepEqual(fs.readFileSync(g.file), original);
  } finally { g.clean(); }
});
test('interrupted deletion stays pending, blocks startup, and resumes without losing the deletion decision', () => {
  const f = setup(); try {
    f.maintenance.migrate({ apply: true }); f.maintenance.backup({ apply: true });
    const originalWrite = f.store.writeJson;
    f.store.writeJson = function(file, value) { if (file === f.file) throw new Error('synthetic storage failure'); return originalWrite.call(this, file, value); };
    assert.throws(() => f.maintenance.erase('111', apply), /maintenance/i);
    assert.throws(() => f.maintenance.assertReady(), /pending/i);
    f.store.writeJson = originalWrite; f.maintenance.resume(apply); f.maintenance.assertReady();
    assert.equal(f.store.readJson(f.file).records.length, 1);
  } finally { f.clean(); }
});
test('interrupted restore replays its encrypted journal without replacing the deletion ledger', () => {
  const f = setup(); try {
    f.maintenance.migrate({ apply: true }); f.maintenance.backup({ apply: true });
    const name = fs.readdirSync(path.join(f.root, 'backups/managed')).find(n => n.startsWith('backup-'));
    f.maintenance.erase('111', apply);
    const originalWrite = f.store.writeJson;
    f.store.writeJson = function(file, value) { if (file === f.file) throw new Error('synthetic interruption'); return originalWrite.call(this, file, value); };
    assert.throws(() => f.maintenance.restore(name, { apply: true }));
    assert.throws(() => f.maintenance.assertReady(), /pending/i);
    f.store.writeJson = originalWrite; f.maintenance.resume({ apply: true }); f.maintenance.assertReady();
    assert.equal(f.store.readJson(f.file).records.length, 1);
    assert.equal(f.store.readJson(path.join(f.root, 'data/privacy-state.json')).subjects.length, 1);
  } finally { f.clean(); }
});
test('migration cannot reintroduce an erased subject through its original-byte recovery snapshot', () => {
  const f = setup(); try {
    const legacy = fs.readFileSync(f.file);
    f.maintenance.migrate({ apply: true }); f.maintenance.erase('111', apply);
    fs.writeFileSync(f.file, legacy); f.maintenance.migrate({ apply: true });
    for (const name of fs.readdirSync(path.join(f.root, 'backups/managed'))) {
      const b = f.store.readJson(path.join(f.root, 'backups/managed', name));
      if (b.originals?.submissions) assert.equal(Buffer.from(b.originals.submissions, 'base64').toString().includes('"111"'), false);
    }
  } finally { f.clean(); }
});
test('malformed legacy records are refused before backup or replacement', () => {
  const f = setup(); try {
    fs.writeFileSync(f.file, '[{"id":"WP-001"}]'); const before = fs.readFileSync(f.file);
    assert.throws(() => f.maintenance.migrate({ apply: true }), /Invalid submission/);
    assert.deepEqual(fs.readFileSync(f.file), before);
    assert.equal(fs.existsSync(path.join(f.root, 'backups/managed')), false);
  } finally { f.clean(); }
});
test('active runtime or another maintenance operation locks out applying mutations', () => {
  const f = setup(); try {
    const release = require('../src/operation-lock').acquireLock(f.root); const original = fs.readFileSync(f.file);
    try { assert.throws(() => f.maintenance.migrate({ apply: true }), /locked/); assert.deepEqual(fs.readFileSync(f.file), original); }
    finally { release(); }
    f.maintenance.migrate({ apply: true }); f.maintenance.assertReady();
  } finally { f.clean(); }
});
test('a lost authoritative ledger cannot be recreated by restore, migration or erasure', () => {
  const f = setup(); try {
    f.maintenance.migrate({ apply: true }); f.maintenance.backup({ apply: true });
    const dir = path.join(f.root, 'backups/managed'), name = fs.readdirSync(dir).find(n => n.startsWith('backup-'));
    const old = fs.readFileSync(path.join(dir, name)); f.maintenance.erase('111', apply); fs.writeFileSync(path.join(dir, name), old);
    fs.unlinkSync(path.join(f.root, 'data/privacy-state.json'));
    const before = fs.readFileSync(f.file);
    for (const operation of [() => f.maintenance.restore(name, { apply: true }), () => f.maintenance.migrate({ apply: true }), () => f.maintenance.erase('111', apply)]) {
      assert.throws(operation, /ledger|state/i); assert.deepEqual(fs.readFileSync(f.file), before);
    }
  } finally { f.clean(); }
});
test('a missing active tracker is refused and older restore retains the independently reserved ID watermark', () => {
  const f = setup(); try {
    f.maintenance.migrate({ apply: true }); f.maintenance.backup({ apply: true });
    const name = fs.readdirSync(path.join(f.root, 'backups/managed')).find(n => n.startsWith('backup-'));
    const { loadSubmissions, saveSubmissions } = require('../src/submissions');
    const records = loadSubmissions(f.file, f.store); addSubmission(records, { title: 'third', authorId: '555', submittedById: '222' });
    saveSubmissions(f.file, records, f.store); fs.unlinkSync(f.file);
    assert.throws(() => f.maintenance.assertReady(), /missing/i);
    assert.throws(() => loadSubmissions(f.file, f.store), /missing/i);
    f.maintenance.restore(name, { apply: true }); assert.equal(f.store.readJson(f.file).highWaterMark, 3);
  } finally { f.clean(); }
});
test('managed temporary copies block deletion completeness instead of retaining erased information unnoticed', () => {
  const f = setup(); try {
    f.maintenance.migrate({ apply: true });
    const temporary = path.join(f.root, 'data/.submissions.json.synthetic.tmp'); fs.copyFileSync(f.file, temporary);
    const preview = f.maintenance.erase('111'); assert.equal(preview.unresolvedLocations, 1);
    assert.throws(() => f.maintenance.erase('111', apply), /inventory/i);
    assert.throws(() => f.maintenance.assertReady(), /temporary/i);
  } finally { f.clean(); }
});
test('genuinely new activity after erasure survives restart and backup while older snapshots remain filtered', () => {
  const f = setup(); try {
    f.maintenance.migrate({ apply: true }); f.maintenance.erase('111', apply);
    const { loadSubmissions, saveSubmissions } = require('../src/submissions');
    const records = loadSubmissions(f.file, f.store); addSubmission(records, { title: 'new activity', authorId: '111', submittedById: '111' });
    saveSubmissions(f.file, records, f.store); f.maintenance.assertReady();
    f.maintenance.backup({ apply: true });
    const dir = path.join(f.root, 'backups/managed'), name = fs.readdirSync(dir).find(n => n.startsWith('backup-'));
    assert.equal(f.store.readJson(path.join(dir, name)).files.submissions.records.some(r => r.title === 'new activity'), true);
    f.maintenance.erase('111', apply); assert.equal(f.store.readJson(f.file).records.some(r => r.authorId === '111'), false);
  } finally { f.clean(); }
});
