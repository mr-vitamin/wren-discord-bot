$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\operational-logging.ps1')
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('wren-log-test-'+[guid]::NewGuid().ToString('N'))
function Assert($condition){if(-not $condition){throw 'Synthetic logging assertion failed'}}
try {
    $state=New-WrenLog -Directory $fixture -MaxBytes 150 -MaxFiles 3
    Receive-WrenEvent $state 'SECRET_TOKEN PRIVATE_NAME'
    Receive-WrenEvent $state '{broken'
    Receive-WrenEvent $state '{"event":"SECRET_TOKEN"}'
    Assert (@(Get-ChildItem -LiteralPath $fixture -File).Count -eq 0)
    Receive-WrenEvent $state '{"event":"quote_failed","code":50013,"status":403,"requestBody":"SECRET_TOKEN","url":"PRIVATE_NAME"}'
    $text=Get-Content -LiteralPath (Get-ChildItem -LiteralPath $fixture -File)[0].FullName -Raw
    Assert ($text -notmatch 'SECRET|PRIVATE|requestBody|url')
    Assert ($text -match '50013')
    for($i=0;$i -lt 15;$i++){Write-WrenEvent $state 'ready'}
    $files=@(Get-ChildItem -LiteralPath $fixture -File)
    Assert ($files.Count -le 3)
    Assert (@($files | Where-Object Length -GT 150).Count -eq 0)
    foreach($file in $files){$file.LastWriteTimeUtc=[DateTime]::UtcNow.AddDays(-31)}
    Write-WrenEvent $state 'ready'
    Assert (@(Get-ChildItem -LiteralPath $fixture -File).Count -eq 1)
    foreach($file in Get-ChildItem -LiteralPath $fixture -File){$file.LastWriteTimeUtc=[DateTime]::UtcNow.AddDays(-31)}
    Invoke-WrenLogMaintenance $state
    Assert (@(Get-ChildItem -LiteralPath $fixture -File).Count -eq 0)
    Write-Output 'PASS: allowlisted streams, secret exclusion, byte/count/age retention'
} finally {if(Test-Path -LiteralPath $fixture){Remove-Item -LiteralPath $fixture -Recurse -Force}}
