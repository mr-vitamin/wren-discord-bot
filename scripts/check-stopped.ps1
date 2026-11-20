param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
try {
    $selected=[IO.Path]::GetFullPath($Root).TrimEnd('\')
    $names=@('node.exe','powershell.exe','wscript.exe')
    $running=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        if($_.ProcessId -eq $PID -or $_.Name -notin $names){return $false}
        $command=$_.CommandLine
        # Inability to inspect a relevant process is not proof that it is stopped.
        if(-not $command){
            # Enumeration races with short-lived helper processes. Recheck that exact PID;
            # only a process proved gone can be ignored. A live unknown process still blocks.
            $again=@(Get-CimInstance Win32_Process -Filter ("ProcessId="+$_.ProcessId) -ErrorAction Stop)
            if($again.Count -eq 0){return $false}
            $command=$again[0].CommandLine
            if(-not $command){return $true}
        }
        $inRoot=$command.IndexOf($selected+'\',[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $command.IndexOf($selected+'/',[StringComparison]::OrdinalIgnoreCase) -ge 0
        if($inRoot -and $command -match '(?i)(src[\\/]index\.js|run-wren\.ps1|start-wren-hidden\.vbs)'){return $true}
        return $_.Name -eq 'node.exe' -and $command -match '(?i)[\s"](?:\.\\|\./)?src[\\/]index\.js(?:[\s"]|$)'
    })
    if($running.Count){exit 2}
    exit 0
} catch {exit 3}
