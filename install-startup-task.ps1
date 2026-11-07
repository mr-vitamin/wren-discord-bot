$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = 'Wren Discord Bot'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

# This is a new-install script. Existing installations need the reviewed migration.
$tasks = @(Get-ScheduledTask -ErrorAction Stop)
if ($tasks | Where-Object TaskName -Match '^Foxx?ie Quotes Bot$') {
    throw 'A legacy startup task exists. Use prepare-startup-migration.ps1 and review docs/startup-migration.md before migration.'
}
if ($tasks | Where-Object TaskName -EQ $taskName) {
    throw 'The Wren startup task already exists. Inspect it before making changes; this installer will not overwrite it.'
}
$entryPoint = Join-Path $root 'src\index.js'
$running = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    $_.Name -in @('node.exe', 'powershell.exe', 'wscript.exe') -and
    ($_.CommandLine -like ('*' + $entryPoint + '*') -or
        $_.CommandLine -match '(?i)(run-(wren|foxxie-quotes)\.ps1|start-(wren-hidden|foxxie-quotes-hidden)\.vbs|[\\/]foxxie-quotes-bot[\\/]src[\\/]index\.js)')
})
if ($running.Count) {
    throw 'A Wren runner or bot process is already running. Resolve it before installing another startup task.'
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'token.dat'))) {
    throw 'Run setup-token.ps1 before installing the startup task.'
}

$launcher = Join-Path $root 'start-wren-hidden.vbs'
if (-not (Test-Path -LiteralPath $launcher)) {
    throw 'The hidden startup launcher is missing.'
}
foreach ($required in @('run-wren.ps1', 'src\index.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $required))) { throw "Required Wren file is missing: $required" }
}
$action = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\wscript.exe" `
    -Argument "//B //Nologo `"$launcher`"" `
    -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Runs the locally hosted Wren Discord bot at Windows sign-in.' | Out-Null

Write-Host 'Wren will now start automatically when you sign in to Windows.'
Write-Host 'The task has been installed but not started.'

