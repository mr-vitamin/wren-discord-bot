const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
for (const [scenario, expected] of [['exited-during-enumeration', 0], ['live-uninspectable', 2]]) {
  test(`stopped-process check handles ${scenario} without weakening unknown-live refusal`, { skip: process.platform !== 'win32' }, () => {
    const helper = path.resolve(__dirname, '../scripts/check-stopped.ps1').replaceAll("'", "''");
    const command = `function Get-CimInstance {param($ClassName,$Filter,$ErrorAction) if($Filter -and '${scenario}' -eq 'exited-during-enumeration'){return @()}; [pscustomobject]@{ProcessId=424242;Name='node.exe';CommandLine=$null} }; & '${helper}' -Root 'C:\\SyntheticWren'; exit $LASTEXITCODE`;
    const result = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, expected, result.stdout + result.stderr);
  });
}
