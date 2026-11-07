$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDirectory = Join-Path $root 'logs'
$logPath = Join-Path $logDirectory 'foxxie-quotes.log'

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
Set-Location -LiteralPath $root

# If Task Scheduler stops the windowless host, stop its supervised bot too.
$launcherProcess = $null
$parentId = (Get-CimInstance Win32_Process -Filter "ProcessId = $PID").ParentProcessId
$parentProcess = Get-Process -Id $parentId -ErrorAction SilentlyContinue
if ($null -ne $parentProcess -and $parentProcess.ProcessName -eq 'wscript') {
    $launcherProcess = $parentProcess
    [void]$launcherProcess.Handle
}

while ($null -eq $launcherProcess -or -not $launcherProcess.HasExited) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "[$timestamp] Starting Foxie Quotes"
    $process = $null
    $started = $false
    $exitCode = 1
    try {
        # No console is allocated, even when Windows Terminal is the default host.
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        $startInfo.Arguments = '"' + (Join-Path $root 'src\index.js') + '"'
        $startInfo.WorkingDirectory = $root
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $startInfo
        $started = $process.Start()

        # Drain both streams concurrently to keep live logs and avoid pipe deadlocks.
        $outputTask = $process.StandardOutput.ReadLineAsync()
        $errorTask = $process.StandardError.ReadLineAsync()
        while ($null -ne $outputTask -or $null -ne $errorTask) {
            if ($null -ne $launcherProcess -and $launcherProcess.HasExited) { return }
            if ($null -ne $outputTask -and $outputTask.IsCompleted) {
                $line = $outputTask.GetAwaiter().GetResult()
                if ($null -eq $line) { $outputTask = $null }
                else {
                    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
                    $outputTask = $process.StandardOutput.ReadLineAsync()
                }
            }
            if ($null -ne $errorTask -and $errorTask.IsCompleted) {
                $line = $errorTask.GetAwaiter().GetResult()
                if ($null -eq $line) { $errorTask = $null }
                else {
                    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
                    $errorTask = $process.StandardError.ReadLineAsync()
                }
            }
            if ($null -ne $outputTask -or $null -ne $errorTask) { Start-Sleep -Milliseconds 100 }
        }
        $process.WaitForExit()
        $exitCode = $process.ExitCode
    }
    catch {
        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -LiteralPath $logPath -Value "[$timestamp] Launcher error: $($_.Exception.Message)" -Encoding UTF8
    }
    finally {
        if ($null -ne $process) {
            # Do not leave an orphan if logging or supervision fails.
            if ($started -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
            $process.Dispose()
        }
    }

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "[$timestamp] Foxie Quotes stopped with exit code $exitCode. Restarting in 10 seconds."
    for ($pause = 0; $pause -lt 100; $pause++) {
        if ($null -ne $launcherProcess -and $launcherProcess.HasExited) { return }
        Start-Sleep -Milliseconds 100
    }
}



