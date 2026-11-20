const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const FAILURE = 'Protected storage operation failed.';
const MAX_BYTES = 32 * 1024 * 1024;
function assertSafePath(file) {
  let current = path.resolve(file);
  for (;;) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error(FAILURE); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error(FAILURE); }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
function windowsSecurity(operation, input, target) {
  if (process.platform !== 'win32') throw new Error(FAILURE);
  const result = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../scripts/dpapi.ps1'), '-Operation', operation,
      ...(target ? ['-Path', target] : [])],
    { input: input?.toString('base64') || '', encoding: 'utf8', windowsHide: true, maxBuffer: MAX_BYTES * 2, timeout: 30_000 });
  if (result.error || result.status !== 0) throw new Error(FAILURE);
  return operation === 'restrict' ? undefined : Buffer.from(result.stdout.trim(), 'base64');
}
function createStore({ protect = bytes => windowsSecurity('protect', bytes),
  unprotect = bytes => windowsSecurity('unprotect', bytes), restrict = file => windowsSecurity('restrict', null, file) } = {}) {
  function encode(bytes) {
    try {
      if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) throw new Error();
      const cipher = protect(bytes); if (!Buffer.isBuffer(cipher) || !cipher.length) throw new Error();
      return Buffer.from(JSON.stringify({ format: 'wren-dpapi', version: 1, ciphertext: cipher.toString('base64') }) + '\n');
    } catch { throw new Error(FAILURE); }
  }
  function decode(bytes) {
    try {
      if (bytes.length > MAX_BYTES * 2) throw new Error();
      const value = JSON.parse(bytes.toString('utf8'));
      if (value?.format !== 'wren-dpapi' || value.version !== 1 || typeof value.ciphertext !== 'string'
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.ciphertext)
        || !value.ciphertext.length || Object.keys(value).sort().join(',') !== 'ciphertext,format,version') throw new Error();
      const plain = unprotect(Buffer.from(value.ciphertext, 'base64'));
      if (!Buffer.isBuffer(plain) || plain.length > MAX_BYTES) throw new Error();
      return plain;
    } catch { throw new Error(FAILURE); }
  }
  function writeEncoded(file, encoded) {
    let temporary;
    try {
      assertSafePath(file);
      const directory = path.dirname(path.resolve(file)); fs.mkdirSync(directory, { recursive: true });
      assertSafePath(directory); restrict(directory);
      temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
      fs.writeFileSync(temporary, encoded, { flag: 'wx', mode: 0o600 }); restrict(temporary);
      assertSafePath(file); fs.renameSync(temporary, file); temporary = null;
    } catch { throw new Error(FAILURE); }
    finally { if (temporary) { try { fs.unlinkSync(temporary); } catch {} } }
  }
  return {
    encode, decode, writeEncoded, assertSafePath,
    readBytes(file) { try { assertSafePath(file); return decode(fs.readFileSync(file)); } catch { throw new Error(FAILURE); } },
    writeBytes(file, bytes) { writeEncoded(file, encode(bytes)); },
    readJson(file) { try { return JSON.parse(this.readBytes(file).toString('utf8')); } catch { throw new Error(FAILURE); } },
    writeJson(file, data) { try { this.writeBytes(file, Buffer.from(JSON.stringify(data))); } catch { throw new Error(FAILURE); } },
  };
}
const secureStore = createStore();
module.exports = { createStore, secureStore, assertSafePath };
