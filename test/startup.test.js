const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

for (const scenario of ['legacy-running', 'legacy-stopped', 'existing-wren', 'orphan-process', 'fresh-install', 'remove-running', 'prepare', 'prepare-whitespace', 'prepare-default-enabled', 'prepare-wrong-logon', 'prepare-conflict', 'prepare-unexpected-action']) {
  test(`Windows startup safety: ${scenario}`, { skip: process.platform !== 'win32' }, () => {
    const result = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'startup.test.ps1'), '-Scenario', scenario],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS/);
  });
}
