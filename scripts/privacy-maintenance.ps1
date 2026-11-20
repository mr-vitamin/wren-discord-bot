param([Parameter(Mandatory=$true)][ValidateSet('erase','resume')][string]$Operation,
      [switch]$Apply,[switch]$VerifiedRequest,[switch]$InventoryConfirmed)
$ErrorActionPreference='Stop'
try {
    $node=(Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $start=New-Object Diagnostics.ProcessStartInfo
    $start.FileName=$node
    $arguments='"'+(Join-Path $PSScriptRoot 'privacy-maintenance.js')+'" '+$Operation
    if($Apply){$arguments+=' --apply'}
    if($VerifiedRequest){$arguments+=' --verified-request'}
    if($InventoryConfirmed){$arguments+=' --inventory-confirmed'}
    $start.Arguments=$arguments;$start.UseShellExecute=$false;$start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
    if($Operation -eq 'erase') {
        $secure=Read-Host 'Verified Discord user ID (hidden)' -AsSecureString
        $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try{$subject=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
        if($subject -notmatch '^\d{17,20}$'){throw 'Invalid identifier'}
    }
    $child=New-Object Diagnostics.Process;$child.StartInfo=$start;[void]$child.Start()
    $outTask=$child.StandardOutput.ReadToEndAsync();$errorTask=$child.StandardError.ReadToEndAsync()
    if($Operation -eq 'erase'){$child.StandardInput.Write($subject);$subject=$null}
    $child.StandardInput.Close();$child.WaitForExit()
    $result=$outTask.GetAwaiter().GetResult()|ConvertFrom-Json
    # Only aggregate fields emitted by our CLI are displayed; never raw stderr.
    $safe=[ordered]@{ok=($result.ok -eq $true)}
    foreach($key in @('applied','registeredScopeComplete')){if($result.$key -is [bool]){$safe[$key]=$result.$key}}
    foreach($key in @('activeRemovedRecords','activeClearedReferences','backupFiles','unresolvedLocations')){
        if($result.$key -is [int] -or $result.$key -is [long]){$safe[$key]=$result.$key}
    }
    $safe|ConvertTo-Json -Compress
    exit $child.ExitCode
} catch {[Console]::Out.WriteLine('{"ok":false,"reason":"maintenance_refused"}');exit 1}
finally {if($null -ne $child){$child.Dispose()};$subject=$null}
