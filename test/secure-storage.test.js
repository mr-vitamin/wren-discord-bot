const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../src/secure-storage');

// Inject a deterministic codec only into this test store, never into runtime defaults.
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-storage-'));
  const key = Buffer.alloc(32, 7);
  const crypto = require('node:crypto');
  const store = createStore({
    protect(bytes) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([iv, c.update(bytes), c.final(), c.getAuthTag()]); },
    unprotect(bytes) { const d = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      d.setAuthTag(bytes.subarray(-16)); return Buffer.concat([d.update(bytes.subarray(12, -16)), d.final()]); },
    restrict() {},
  });
  return { dir, store, clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('record and temporary persistence contain ciphertext and preserve every field', () => {
  const f = fixture(); try {
    const file = path.join(f.dir, 'records.json');
    const record = [{ id: 'WP-009', title: 'PRIVATE_SYNTHETIC_TITLE', authorId: '123', submittedById: '456' }];
    f.store.writeJson(file, record);
    assert.equal(fs.readFileSync(file, 'utf8').includes('PRIVATE_SYNTHETIC_TITLE'), false);
    assert.deepEqual(f.store.readJson(file), record);
    assert.deepEqual(fs.readdirSync(f.dir), ['records.json']);
    f.store.writeJson(file, []); assert.deepEqual(f.store.readJson(file), []);
  } finally { f.clean(); }
});

test('plaintext, damaged ciphertext and unknown envelope versions fail closed without overwriting', () => {
  const f = fixture(); try {
    const file = path.join(f.dir, 'records.json');
    for (const bytes of ['[]', '{bad json', '{"format":"wren-dpapi","version":999,"ciphertext":"AA=="}']) {
      fs.writeFileSync(file, bytes);
      assert.throws(() => f.store.readJson(file), /protected storage/i);
      assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    }
    f.store.writeJson(file, ['secret']); const envelope = JSON.parse(fs.readFileSync(file));
    envelope.ciphertext = Buffer.alloc(40).toString('base64'); fs.writeFileSync(file, JSON.stringify(envelope));
    assert.throws(() => f.store.readJson(file), /protected storage/i);
  } finally { f.clean(); }
});

test('encryption failure leaves the original bytes intact and creates no plaintext temporary file', () => {
  const f = fixture(); try {
    const file = path.join(f.dir, 'records.json'); f.store.writeJson(file, ['original']);
    const before = fs.readFileSync(file);
    const broken = createStore({ protect() { throw new Error('sensitive provider failure'); }, unprotect() {}, restrict() {} });
    assert.throws(() => broken.writeJson(file, ['replacement']), /^Error: Protected storage operation failed\.$/);
    assert.deepEqual(fs.readFileSync(file), before); assert.equal(fs.readdirSync(f.dir).length, 1);
  } finally { f.clean(); }
});

test('storage refuses symlinks instead of reading or writing outside its directory', () => {
  const f = fixture(); try {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-outside-'));
    try { fs.symlinkSync(outside, path.join(f.dir, 'redirect'), 'junction');
      assert.throws(() => f.store.writeJson(path.join(f.dir, 'redirect', 'records.json'), ['private']), /protected storage/i);
      assert.deepEqual(fs.readdirSync(outside), []);
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  } finally { f.clean(); }
});

module.exports = { fixture };
