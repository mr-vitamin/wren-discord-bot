[CmdletBinding()]
param(
    [ValidateSet('Foxie Quotes Bot', 'Foxxie Quotes Bot')]
    [string]$LegacyTaskName = 'Foxie Quotes Bot'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$newName = 'Wren Discord Bot'
$tasks = @(Get-ScheduledTask -ErrorAction Stop)
if ($tasks | Where-Object TaskName -EQ $newName) {
    throw 'A Wren startup task already exists. Resolve the task conflict before preparing migration.'
}
$legacy = @($tasks | Where-Object { $_.TaskName -eq $LegacyTaskName -and $_.TaskPath -eq '\' })
if ($legacy.Count -ne 1) { throw 'Expected exactly one legacy task in the root task folder. Inspect Task Scheduler before proceeding.' }
if (@($tasks | Where-Object TaskName -Match '^Foxx?ie Quotes Bot$').Count -ne 1) {
    throw 'Multiple legacy tasks exist. Resolve this conflict before migration.'
}
$action = @($legacy[0].Actions)
if ($action.Count -ne 1 -or [IO.Path]::GetFileName($action[0].Execute) -ine 'wscript.exe' -or
    $action[0].Arguments -notmatch '^//B //Nologo "(.+\\start-foxxie-quotes-hidden\.vbs)"$') {
    throw 'The legacy task action is not the expected hidden launcher. Review its configuration manually.'
}
$legacyLauncher = $Matches[1]
if ([IO.Path]::GetDirectoryName($legacyLauncher) -ine $action[0].WorkingDirectory) {
    throw 'The legacy launcher and working directory disagree. Inspect the task action before proceeding.'
}
foreach ($required in @('start-wren-hidden.vbs', 'run-wren.ps1', 'src\index.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $required))) { throw "Required Wren file is missing: $required" }
}

# Read-only scheduler access. The saved replacement stays disabled until approval.
$originalXml = Export-ScheduledTask -TaskName $LegacyTaskName -TaskPath '\'
$replacement = New-Object System.Xml.XmlDocument
$replacement.PreserveWhitespace = $true
$replacement.LoadXml($originalXml)
$ns = New-Object System.Xml.XmlNamespaceManager($replacement.NameTable)
$ns.AddNamespace('t', 'http://schemas.microsoft.com/windows/2004/02/mit/task')
$exec = $replacement.SelectSingleNode('/t:Task/t:Actions/t:Exec', $ns)
if ($null -eq $exec -or $replacement.SelectSingleNode('/t:Task/t:Actions', $ns).SelectNodes('*').Count -ne 1) {
    throw 'Unexpected task XML actions; refusing to prepare an incomplete replacement.'
}
$logonType = $replacement.SelectSingleNode('/t:Task/t:Principals/t:Principal/t:LogonType', $ns)
if ($null -eq $logonType -or $logonType.InnerText -ne 'InteractiveToken') {
    throw 'This preparation script supports the existing interactive-user task only. Review other logon types manually.'
}
$exec.SelectSingleNode('t:Arguments', $ns).InnerText = '//B //Nologo "' + (Join-Path $root 'start-wren-hidden.vbs') + '"'
$exec.SelectSingleNode('t:WorkingDirectory', $ns).InnerText = $root
$uri = $replacement.SelectSingleNode('/t:Task/t:RegistrationInfo/t:URI', $ns)
if ($null -ne $uri) { $uri.InnerText = '\' + $newName }
$description = $replacement.SelectSingleNode('/t:Task/t:RegistrationInfo/t:Description', $ns)
if ($null -ne $description) { $description.InnerText = 'Runs the locally hosted Wren Discord bot at Windows sign-in.' }
$settings = $replacement.SelectSingleNode('/t:Task/t:Settings', $ns)
if ($null -eq $settings) { throw 'Task settings are missing; review migration manually.' }
$enabled = $settings.SelectSingleNode('t:Enabled', $ns)
if ($null -eq $enabled) {
    $enabled = $replacement.CreateElement('Enabled', $ns.LookupNamespace('t'))
    [void]$settings.AppendChild($enabled)
}
$enabled.InnerText = 'false'
$output = Join-Path $root ('work\startup-migration\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $output 'legacy-task.xml'), $originalXml, [Text.Encoding]::Unicode)
$replacement.Save((Join-Path $output ($newName + '.xml')))
[pscustomobject]@{
    LegacyTaskName=$LegacyTaskName; NewTaskName=$newName; LegacyRoot=$action[0].WorkingDirectory
    DestinationRoot=$root; LegacyState=[string]$legacy[0].State; ReplacementEnabled=$false
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'migration-plan.json') -Encoding UTF8
Write-Host "Wren migration files prepared in $output"
Write-Host 'No scheduled tasks or bot processes were changed. Follow docs/startup-migration.md after approval.'
