const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { secureStore } = require('../src/secure-storage');
test('real Windows helper protects and restores synthetic bytes under the scheduled-account execution policy', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-dpapi-'));
  try { const file = path.join(dir, 'data.json'); const data = { title: 'SYNTHETIC_PRIVATE_TEXT' };
    secureStore.writeJson(file, data);
    assert.equal(fs.readFileSync(file, 'utf8').includes(data.title), false);
    assert.deepEqual(secureStore.readJson(file), data);
    secureStore.writeJson(file, { title: 'SECOND_SYNTHETIC_VALUE' });
    assert.deepEqual(secureStore.readJson(file), { title: 'SECOND_SYNTHETIC_VALUE' });
    const { spawnSync } = require('node:child_process');
    const script = '$a=[IO.File]::GetAccessControl($args[0]);$u=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$ok=$a.AreAccessRulesProtected;foreach($r in $a.Access){$s=$r.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value;if($r.AccessControlType -eq "Allow" -and $s -notin @($u,"S-1-5-18")){$ok=$false}};if($ok){"PROTECTED"}else{"UNPROTECTED"}';
    const permissions = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', `& {${script}} '${file.replaceAll("'", "''")}'`], { encoding: 'utf8', windowsHide: true });
    assert.equal(permissions.status, 0); assert.equal(permissions.stdout.trim(), 'PROTECTED');
    const envelope = JSON.parse(fs.readFileSync(file)); envelope.ciphertext = Buffer.alloc(100).toString('base64');
    fs.writeFileSync(file, JSON.stringify(envelope));
    assert.throws(() => secureStore.readJson(file), /Protected storage operation failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('maintenance CLI initializes a fresh installation without credentials and rejects secret-like input without echo', { skip: process.platform !== 'win32' }, () => {
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wren-cli-'));
  const script = path.resolve(__dirname, '../scripts/privacy-maintenance.js');
  try {
    const initialized = spawnSync(process.execPath, [script, 'migrate', '--root', dir, '--apply'], { encoding: 'utf8', windowsHide: true });
    assert.equal(initialized.status, 0, initialized.stdout + initialized.stderr);
    assert.equal(JSON.parse(initialized.stdout).applied, true);
    const inspect = spawnSync(process.execPath, [script, 'inspect', '--root', dir], { encoding: 'utf8', windowsHide: true });
    assert.equal(inspect.status, 0); assert.equal(JSON.parse(inspect.stdout).pending, false);
    const invalid = spawnSync(process.execPath, [script, 'erase', '--root', dir], { input: 'SECRET_TOKEN PRIVATE_NAME', encoding: 'utf8', windowsHide: true });
    assert.equal(invalid.status, 1); assert.doesNotMatch(invalid.stdout + invalid.stderr, /SECRET|PRIVATE/);
    assert.equal(fs.existsSync(path.join(dir, 'token.dat')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
