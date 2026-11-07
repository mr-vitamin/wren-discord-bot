param([Parameter(Mandatory=$true)][string]$Scenario)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('wren-startup-test-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$global:WrenFixtureregistered = $null
$global:WrenFixturetasks = @()
$global:WrenFixtureprocesses = @()
$global:WrenFixturelegacy = [pscustomobject]@{TaskName='Foxie Quotes Bot';TaskPath='\';State='Running';Actions=@([pscustomobject]@{Execute="$env:SystemRoot\System32\wscript.exe";Arguments='//B //Nologo "C:\Old Wren\start-foxxie-quotes-hidden.vbs"';WorkingDirectory='C:\Old Wren'})}
$global:WrenFixturexml = @'
<Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task" version="1.2"><RegistrationInfo><URI>\Foxie Quotes Bot</URI><Description>Old label</Description></RegistrationInfo><Triggers><LogonTrigger><Enabled>true</Enabled><UserId>TEST\operator</UserId></LogonTrigger></Triggers><Principals><Principal id="Author"><UserId>S-1-5-21-1234</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><Enabled>true</Enabled><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings><Actions Context="Author"><Exec><Command>C:\Windows\System32\wscript.exe</Command><Arguments>//B //Nologo "C:\Old Wren\start-foxxie-quotes-hidden.vbs"</Arguments><WorkingDirectory>C:\Old Wren</WorkingDirectory></Exec></Actions></Task>
'@
# Scheduler commands are mocked so these tests cannot affect the real task.
function Get-ScheduledTask { param($TaskName,$TaskPath,$ErrorAction) if($TaskName){@($global:WrenFixturetasks | Where-Object {$_.TaskName -eq $TaskName})}else{$global:WrenFixturetasks} }
function Export-ScheduledTask { param($TaskName,$TaskPath) $global:WrenFixturexml }
function Get-CimInstance { param($ClassName,$Filter) $global:WrenFixtureprocesses }
function Register-ScheduledTask { param($TaskName,$Action,$Trigger,$Settings,$Principal,$Description,[switch]$Force,$Xml) $global:WrenFixtureregistered=$PSBoundParameters }
function Unregister-ScheduledTask { throw 'Unexpected task removal' }
function Stop-ScheduledTask { throw 'Unexpected task stop' }
function Start-ScheduledTask { throw 'Unexpected task start' }
function Disable-ScheduledTask { throw 'Unexpected task disable' }
function Enable-ScheduledTask { throw 'Unexpected task enable' }
function New-ScheduledTaskAction { param($Execute,$Argument,$WorkingDirectory) [pscustomobject]$PSBoundParameters }
function New-ScheduledTaskTrigger { param([switch]$AtLogOn,$User) [pscustomobject]$PSBoundParameters }
function New-ScheduledTaskSettingsSet { param([switch]$AllowStartIfOnBatteries,[switch]$DontStopIfGoingOnBatteries,[switch]$StartWhenAvailable,$ExecutionTimeLimit,$RestartCount,$RestartInterval,$MultipleInstances) [pscustomobject]$PSBoundParameters }
function New-ScheduledTaskPrincipal { param($UserId,$LogonType,$RunLevel) [pscustomobject]$PSBoundParameters }
function Assert-True($Condition,$Message) { if(-not $Condition){throw $Message} }
function Expect-Error($Action,$Pattern) { $caught=$null;try{& $Action}catch{$caught=$_};Assert-True ($null -ne $caught -and $caught.Exception.Message -match $Pattern) "Expected refusal matching $Pattern; got $caught" }
try {
    # Only startup scripts are copied. Never copy live credentials or records into tests.
    foreach($name in @('install-startup-task.ps1','remove-startup-task.ps1','prepare-startup-migration.ps1','start-wren-hidden.vbs','run-wren.ps1')) {
        if(Test-Path -LiteralPath (Join-Path $repo $name)){Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $fixture}
    }
    New-Item -ItemType Directory -Path (Join-Path $fixture 'src') | Out-Null
    Set-Content -LiteralPath (Join-Path $fixture 'src\index.js') -Value '// fixture only'
    Set-Content -LiteralPath (Join-Path $fixture 'token.dat') -Value 'not-a-real-token'
    $installer = Join-Path $fixture 'install-startup-task.ps1'
    $prepare = Join-Path $fixture 'prepare-startup-migration.ps1'
    if($Scenario -eq 'prepare-whitespace') {
        $global:WrenFixturexml=$global:WrenFixturexml.Replace('<Actions Context="Author">', "<Actions Context=`"Author`">`n  ").Replace('</Exec></Actions>', "</Exec>`n</Actions>")
        $Scenario='prepare'
    }
    if($Scenario -eq 'prepare-default-enabled') {
        $global:WrenFixturexml=$global:WrenFixturexml.Replace('<Enabled>true</Enabled>','')
        $Scenario='prepare'
    }
    switch($Scenario) {
        'legacy-running' { $global:WrenFixturetasks=@($global:WrenFixturelegacy);Expect-Error {& $installer} 'legacy|migration' }
        'legacy-stopped' { $global:WrenFixturelegacy.State='Ready';$global:WrenFixturetasks=@($global:WrenFixturelegacy);Expect-Error {& $installer} 'legacy|migration' }
        'existing-wren' { $global:WrenFixturetasks=@([pscustomobject]@{TaskName='Wren Discord Bot';State='Ready'});Expect-Error {& $installer} 'already|existing' }
        'orphan-process' { $global:WrenFixtureprocesses=@([pscustomobject]@{Name='node.exe';CommandLine=('node.exe "' + (Join-Path $fixture 'src\index.js') + '"')});Expect-Error {& $installer} 'running|process' }
        'fresh-install' {
            & $installer
            Assert-True ($global:WrenFixtureregistered.TaskName -eq 'Wren Discord Bot') 'Wrong task name'
            Assert-True ($global:WrenFixtureregistered.Action.Argument -match 'start-wren-hidden\.vbs') 'Wrong launcher'
            Assert-True ($global:WrenFixtureregistered.Settings.MultipleInstances -eq 'IgnoreNew') 'Missing duplicate policy'
            Assert-True (-not $global:WrenFixtureregistered.ContainsKey('Force')) 'Installer must not overwrite a task'
        }
        'remove-running' { $global:WrenFixturetasks=@([pscustomobject]@{TaskName='Wren Discord Bot';TaskPath='\';State='Running'});Expect-Error {& (Join-Path $fixture 'remove-startup-task.ps1')} 'running|stop' }
        'prepare-conflict' { $global:WrenFixturetasks=@($global:WrenFixturelegacy,[pscustomobject]@{TaskName='Wren Discord Bot'});Expect-Error {& $prepare} 'already|conflict' }
        'prepare-unexpected-action' { $global:WrenFixturelegacy.Actions[0].Execute='unrelated.exe';$global:WrenFixturetasks=@($global:WrenFixturelegacy);Expect-Error {& $prepare} 'action|launcher' }
        'prepare-wrong-logon' { $global:WrenFixturexml=$global:WrenFixturexml.Replace('InteractiveToken','Password');$global:WrenFixturetasks=@($global:WrenFixturelegacy);Expect-Error {& $prepare} 'logon|interactive' }
        'prepare' {
            $global:WrenFixturetasks=@($global:WrenFixturelegacy)
            & $prepare
            $prepared = @(Get-ChildItem -LiteralPath (Join-Path $fixture 'work\startup-migration') -Filter 'Wren Discord Bot.xml' -Recurse)
            Assert-True ($prepared.Count -eq 1) 'Replacement XML not prepared'
            [xml]$original=$global:WrenFixturexml
            [xml]$replacement=Get-Content -LiteralPath $prepared[0].FullName -Raw
            Assert-True ($replacement.Task.Settings.Enabled -eq 'false') 'Replacement must be disabled'
            Assert-True ($replacement.Task.Principals.OuterXml -eq $original.Task.Principals.OuterXml) 'Principal changed'
            Assert-True ($replacement.Task.Triggers.OuterXml -eq $original.Task.Triggers.OuterXml) 'Triggers changed'
            $enabled=$original.Task.Settings.SelectSingleNode('*[local-name()="Enabled"]')
            if($null -ne $enabled){[void]$original.Task.Settings.RemoveChild($enabled)}
            $enabled=$replacement.Task.Settings.SelectSingleNode('*[local-name()="Enabled"]')
            [void]$replacement.Task.Settings.RemoveChild($enabled)
            Assert-True ($replacement.Task.Settings.OuterXml -eq $original.Task.Settings.OuterXml) 'Settings changed'
            Assert-True ($replacement.Task.Actions.Context -eq $original.Task.Actions.Context) 'Action context changed'
            Assert-True ($replacement.Task.Actions.Exec.WorkingDirectory -eq $fixture) 'Wrong destination root'
            Assert-True ($replacement.Task.Actions.Exec.Arguments -match 'start-wren-hidden\.vbs') 'Wrong prepared launcher'
            Assert-True ($null -eq $global:WrenFixtureregistered) 'Preparation must not register a task'
        }
    }
    if($Scenario -ne 'fresh-install'){Assert-True ($null -eq $global:WrenFixtureregistered) 'Unexpected task mutation'}
    Write-Output "PASS $Scenario"
} finally {
    $resolved=[IO.Path]::GetFullPath($fixture)
    $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if(-not $resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'wren-startup-test-*'){throw 'Unsafe fixture cleanup path'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
