const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { assertSafePath } = require('./secure-storage');
function acquireLock(root) {
  if (process.platform === 'win32') {
    assertSafePath(root);
    const name = createHash('sha256').update(fs.realpathSync(root).toLowerCase()).digest('hex');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-mutex-')); const signal = path.join(directory, 'status');
    const helper = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../scripts/storage-lock.ps1'), '-Name', name, '-Signal', signal],
      { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    helper.on('error', () => {});
    const deadline = Date.now() + 10000;
    const wait = new Int32Array(new SharedArrayBuffer(4));
    try {
      let status;
      while (Date.now() < deadline) {
        if (fs.existsSync(signal)) status = fs.readFileSync(signal, 'utf8');
        if (['locked', 'busy', 'failed'].includes(status)) break;
        Atomics.wait(wait, 0, 0, 10);
      }
      if (status !== 'locked') throw new Error('Storage is locked or lock verification failed.');
    } catch (error) { helper.kill(); helper.stdin.destroy(); throw error; }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
    helper.unref(); helper.stdin.unref();
    let released = false;
    return () => { if (!released) { released = true; helper.kill(); helper.stdin.destroy(); } };
  }
  // Non-Windows tests may use an injected codec; production DPAPI remains Windows-only.
  const directory = path.join(path.resolve(root), 'data'); const file = path.join(directory, '.privacy.lock');
  assertSafePath(file); fs.mkdirSync(directory, { recursive: true });
  let fd;
  try { fd = fs.openSync(file, 'wx', 0o600); fs.writeFileSync(fd, String(process.pid)); }
  catch { if (fd !== undefined) { fs.closeSync(fd); fs.unlinkSync(file); } throw new Error('Storage is locked; verify stopped processes and stale locks.'); }
  let released = false;
  return () => { if (!released) { released = true; fs.closeSync(fd); fs.unlinkSync(file); } };
}
module.exports = { acquireLock };
