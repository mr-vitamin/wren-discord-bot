const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const script=path.resolve(__dirname,'../scripts/read-backup-context.ps1').replace(/'/g,"''");
const windowsOnly={skip:process.platform!=='win32'};
function readContext(mode){
 // Replace only Windows task-service boundaries; execute the real context reader and identity check.
 const source=`
$ProgressPreference='SilentlyContinue'
$mode='${mode}'
function Get-ScheduledTask {
 [CmdletBinding()]param([string]$TaskName,[string]$TaskPath)
 if($TaskPath -ne '\\'){throw 'wrong task folder'}
 if(($TaskName -eq 'Foxie Quotes Bot' -and $mode -eq 'legacy-absent') -or ($TaskName -eq 'Wren Discord Bot' -and $mode -eq 'active-absent')){
  $id=if($TaskPath){'CmdletizationQuery_NotFound'}else{'CmdletizationQuery_NotFound_TaskName'}
  $PSCmdlet.ThrowTerminatingError([Management.Automation.ErrorRecord]::new([Exception]::new('synthetic missing task'),$id,[Management.Automation.ErrorCategory]::ObjectNotFound,$TaskName))
 }
 if($TaskName -eq 'Foxie Quotes Bot' -and $mode -eq 'legacy-denied'){throw [UnauthorizedAccessException]::new('synthetic denied')}
 if($TaskName -eq 'Foxie Quotes Bot' -and $mode -eq 'legacy-other-error'){throw 'synthetic unexpected task failure'}
 $account=[Security.Principal.WindowsIdentity]::GetCurrent().Name
 if($TaskName -eq 'Wren Discord Bot' -and $mode -eq 'identity-mismatch'){$account='NT AUTHORITY\\SYSTEM'}
 [pscustomobject]@{Principal=[pscustomobject]@{UserId=$account}}
}
function Export-ScheduledTask {
 param([string]$TaskName,[string]$TaskPath)
 if($TaskPath -ne '\\'){throw 'wrong task folder'}
 if($TaskName -eq 'Wren Discord Bot' -and $mode -eq 'active-export-denied'){throw [UnauthorizedAccessException]::new('synthetic denied')}
 '<Task name="'+$TaskName+'" />'
}
$handle=[pscustomobject]@{}
$handle | Add-Member ScriptMethod GetSecurityDescriptor {param($flags) if($mode -eq 'acl-denied'){throw [UnauthorizedAccessException]::new('synthetic denied')};'synthetic-security-descriptor'}
$folder=[pscustomobject]@{}
$folder | Add-Member ScriptMethod GetTask {param($name) $handle}
$scheduler=[pscustomobject]@{}
$scheduler | Add-Member ScriptMethod Connect {}
$scheduler | Add-Member ScriptMethod GetFolder {param($folderPath) if($folderPath -ne '\\'){throw 'wrong task folder'};$folder}
function New-Object {param([string]$ComObject) if($ComObject -ne 'Schedule.Service'){throw 'unexpected COM request'};$scheduler}
& '${script}'
`;
 return spawnSync(ps,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:30000});
}
test('context succeeds with the retired legacy task absent and preserves active task metadata',windowsOnly,()=>{
 const r=readContext('legacy-absent');assert.equal(r.status,0,r.stderr);const c=JSON.parse(r.stdout);
 assert.deepEqual(c.tasks.map(t=>t.name),['Wren Discord Bot']);assert.equal(c.tasks[0].xml,'<Task name="Wren Discord Bot" />');
 assert.equal(c.tasks[0].securityDescriptor,'synthetic-security-descriptor');assert.match(c.windowsAccountSid,/^S-1-/);assert.equal(c.version,1);
});
test('context still captures the legacy task when it is present',windowsOnly,()=>{
 const r=readContext('both-present');assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).tasks.map(t=>t.name),['Wren Discord Bot','Foxie Quotes Bot']);
});
for(const mode of ['active-absent','identity-mismatch','legacy-denied','legacy-other-error','acl-denied','active-export-denied']){
 test(`context refuses ${mode} without emitting private context`,windowsOnly,()=>{
  const r=readContext(mode);assert.equal(r.status,1);assert.equal(r.stdout.trim(),'');assert.equal(r.stderr.trim(),'WREN_CONTEXT_FAILED');
 });
}
