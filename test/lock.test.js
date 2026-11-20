const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
test('forced termination releases the real storage lock so scheduled restart can proceed', { skip: process.platform !== 'win32' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-lock-test-'));
  const moduleFile = path.resolve(__dirname, '../src/operation-lock.js');
  const code = 'const {acquireLock}=require(process.argv[1]); acquireLock(process.argv[2]); process.stdout.write("LOCKED\\n"); setInterval(()=>{},1000);';
  const child = spawn(process.execPath, ['-e', code, moduleFile, root], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Synthetic lock startup timeout')), 15000);
      child.stdout.once('data', () => { clearTimeout(timer); resolve(); }); child.once('error', reject); });
    child.kill(); await new Promise(resolve => child.once('exit', resolve));
    const release = require('../src/operation-lock').acquireLock(root); release();
  } finally { child.kill(); fs.rmSync(root, { recursive: true, force: true }); }
});
