param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$Name,
      [Parameter(Mandatory=$true)][string]$Signal)
$ErrorActionPreference='Stop'
$mutex=$null;$owned=$false
try {
    $mutex=New-Object Threading.Mutex($false,('Global\WrenPrivacy_'+$Name))
    try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true}
    if(-not $owned){[IO.File]::WriteAllText($Signal,'busy');exit 2}
    [IO.File]::WriteAllText($Signal,'locked')
    # EOF follows parent termination, including Task Scheduler/TerminateProcess shutdown.
    [void][Console]::In.ReadLine()
} catch {try{[IO.File]::WriteAllText($Signal,'failed')}catch{};exit 1}
finally {if($owned){$mutex.ReleaseMutex()};if($null -ne $mutex){$mutex.Dispose()}}
