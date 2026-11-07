$ErrorActionPreference = 'Stop'
$taskName = 'Wren Discord Bot'

$task = @(Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq $taskName -and $_.TaskPath -eq '\' })
if ($task | Where-Object State -EQ 'Running') {
    throw 'Wren is running. Complete a controlled stop and confirm its child processes have exited before removing the task.'
}
if ($task) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host 'Wren startup task removed.'
} else {
    Write-Host 'Wren startup task is not installed. Legacy tasks are left unchanged; see docs/startup-migration.md.'
}
