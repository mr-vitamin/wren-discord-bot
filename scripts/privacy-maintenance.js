const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createMaintenance } = require('../src/maintenance');
function checkStopped(root) {
  if (process.platform !== 'win32') throw new Error('Windows stopped-process verification required.');
  const r = spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'check-stopped.ps1'), '-Root', root],
    { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  if (r.error || r.status !== 0) throw new Error('Bot must be stopped and verifiably inspectable.');
}
function main(args = process.argv.slice(2)) {
  const command = args.shift(); const options = {};
  const values = new Map();
  while (args.length) {
    const key = args.shift();
    if (['--apply', '--verified-request', '--inventory-confirmed'].includes(key)) {
      if (values.has(key)) throw new Error('Invalid arguments.'); values.set(key, true);
    } else if (['--root', '--backup', '--directory'].includes(key) && args[0] && !args[0].startsWith('--')) {
      if (values.has(key)) throw new Error('Invalid arguments.'); values.set(key, args.shift());
    } else throw new Error('Invalid arguments.');
  }
  options.apply = Boolean(values.get('--apply')); options.verifiedRequest = Boolean(values.get('--verified-request'));
  options.inventoryConfirmed = Boolean(values.get('--inventory-confirmed'));
  const root = values.get('--root') || path.resolve(__dirname, '..');
  const m = createMaintenance({ root, assertStopped: checkStopped });
  let result;
  switch (command) {
    case 'inspect': if (options.apply) throw new Error(); result = m.inspect(); break;
    case 'migrate': result = m.migrate(options); break;
    case 'backup': result = m.backup(options); break;
    case 'restore': result = m.restore(values.get('--backup'), options); break;
    case 'register-backup': if (!values.get('--directory')) throw new Error(); result = m.registerBackupRoot(values.get('--directory'), options); break;
    case 'erase': {
      let id = fs.readFileSync(0, 'utf8').trim();
      if (!/^\d{17,20}$/.test(id)) throw new Error('Invalid subject.');
      try { result = m.erase(id, options); } finally { id = null; }
      break;
    }
    case 'resume': result = m.resume(options); break;
    default: throw new Error('Invalid command.');
  }
  process.stdout.write(JSON.stringify({ ok: true, ...result }) + '\n');
}
if (require.main === module) {
  try { main(); } catch { process.stdout.write('{"ok":false,"reason":"maintenance_refused","help":"docs/privacy-operations.md"}\n'); process.exitCode = 1; }
}
module.exports = { main, checkStopped };
