$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('wren-supervision-'+[guid]::NewGuid().ToString('N'))
$launcher=$null
function FixtureProcesses {
    @(Get-CimInstance Win32_Process | Where-Object {$_.Name -in @('node.exe','powershell.exe','wscript.exe') -and $_.CommandLine -and $_.CommandLine.IndexOf($fixture,[StringComparison]::OrdinalIgnoreCase) -ge 0})
}
function FixtureLogs {
    $logDir=Join-Path $fixture 'logs\operational'
    if(-not(Test-Path -LiteralPath $logDir)){return ''}
    $combined=''
    foreach($file in Get-ChildItem -LiteralPath $logDir -File){
        $stream=[IO.File]::Open($file.FullName,'Open','Read',([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
        $reader=New-Object IO.StreamReader($stream)
        try{$combined+=$reader.ReadToEnd()}finally{$reader.Dispose()}
    }
    return $combined
}
try {
    New-Item -ItemType Directory -Path (Join-Path $fixture 'src'),(Join-Path $fixture 'scripts') -Force|Out-Null
    foreach($name in @('start-wren-hidden.vbs','run-wren.ps1')){Copy-Item -LiteralPath (Join-Path $repo $name) -Destination $fixture}
    Copy-Item -LiteralPath (Join-Path $repo 'scripts\operational-logging.ps1') -Destination (Join-Path $fixture 'scripts')
    @'
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../count.txt');const count=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8'))+1:1;
fs.writeFileSync(file,String(count));
fs.writeFileSync(path.join(__dirname,'../pid.txt'),String(process.pid));
console.error('SECRET_TOKEN PRIVATE_NAME https://discord.com/interactions/PRIVATE_TOKEN');
console.log(JSON.stringify({event:'ready',requestBody:'SECRET_TOKEN',username:'PRIVATE_NAME'}));
if(count===1)setTimeout(()=>process.exit(23),100);else setInterval(()=>console.log(JSON.stringify({event:'ready'})),200);
'@ | Set-Content -LiteralPath (Join-Path $fixture 'src\index.js') -Encoding UTF8
    $launcher=Start-Process -FilePath "$env:SystemRoot\System32\wscript.exe" -ArgumentList ('//B //Nologo "'+(Join-Path $fixture 'start-wren-hidden.vbs')+'"') -WindowStyle Hidden -PassThru
    $deadline=(Get-Date).AddSeconds(25)
    do {
        Start-Sleep -Milliseconds 250
        $logs=FixtureLogs
        $starts=([regex]::Matches($logs,'"event":"starting"')).Count
    } while($starts -lt 2 -and (Get-Date) -lt $deadline)
    Start-Sleep -Milliseconds 500
    $logs=FixtureLogs
    if($starts -lt 2 -or $logs -notmatch '"exitCode":23' -or $logs -notmatch '"event":"ready"'){throw 'Synthetic supervision restart failed'}
    if($logs -match 'SECRET|PRIVATE|requestBody|username|https'){throw 'Synthetic stream filtering failed'}
    $fixturePid=[int](Get-Content -LiteralPath (Join-Path $fixture 'pid.txt') -Raw)
    $fixtureNode=Get-Process -Id $fixturePid -ErrorAction Stop
    $otherNodes=@(FixtureProcesses|Where-Object {$_.Name -eq 'node.exe' -and $_.ProcessId -ne $fixturePid})
    if($fixtureNode.ProcessName -ne 'node' -or $otherNodes.Count -gt 0 -or [int](Get-Content -LiteralPath (Join-Path $fixture 'count.txt') -Raw) -ne 2){throw 'Synthetic bot count failed'}
    Stop-Process -Id $launcher.Id
    $deadline=(Get-Date).AddSeconds(8)
    do{Start-Sleep -Milliseconds 200;$remaining=@(FixtureProcesses)}while($remaining.Count -and (Get-Date) -lt $deadline)
    if($remaining.Count){throw 'Synthetic parent-exit cleanup failed'}
    Write-Output 'PASS: actual hidden launcher, filtered streams, exit-code restart, one child, parent-exit cleanup'
} finally {
    foreach($process in @(FixtureProcesses)){Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue}
    if(Test-Path -LiteralPath $fixture){Remove-Item -LiteralPath $fixture -Recurse -Force}
}
