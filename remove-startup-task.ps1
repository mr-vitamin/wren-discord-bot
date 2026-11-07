$ErrorActionPreference = 'Stop'
$taskName = 'Foxie Quotes Bot'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host 'Foxie Quotes startup task removed.'
} else {
    Write-Host 'Foxie Quotes startup task is not installed.'
}
