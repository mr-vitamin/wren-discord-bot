$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = 'Foxie Quotes Bot'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath (Join-Path $root 'token.dat'))) {
    throw 'Run setup-token.ps1 before installing the startup task.'
}

$launcher = Join-Path $root 'start-foxxie-quotes-hidden.vbs'
if (-not (Test-Path -LiteralPath $launcher)) {
    throw 'The hidden startup launcher is missing.'
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
    -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'Runs the locally hosted Foxie Quotes Discord bot at Windows sign-in.' `
    -Force | Out-Null

Write-Host 'Foxie Quotes will now start automatically when you sign in to Windows.'
Write-Host 'The task has been installed but not started.'

