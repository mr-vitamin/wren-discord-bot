function Test-WrenSafePath([string]$Path) {
    $cursor=[IO.Path]::GetFullPath($Path)
    while($cursor){
        if(Test-Path -LiteralPath $cursor){
            if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unsafe log path'}
        }
        $parent=[IO.Path]::GetDirectoryName($cursor)
        if($parent -eq $cursor){break};$cursor=$parent
    }
}
function New-WrenLog {
    param([string]$Directory,[int]$MaxBytes=1048576,[int]$MaxFiles=32,[int]$Days=30)
    Test-WrenSafePath $Directory
    [void][IO.Directory]::CreateDirectory($Directory)
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    foreach($identity in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    }
    [IO.Directory]::SetAccessControl($Directory,$acl)
    return @{Directory=[IO.Path]::GetFullPath($Directory);MaxBytes=$MaxBytes;MaxFiles=$MaxFiles;Days=$Days;Active=$null;Day=$null}
}
function Write-WrenEvent {
    param($State,[string]$Event,$Fields=@{})
    if($Event -notin @('ready','starting','stopped','launcher_failed','startup_failed','submission_failed','quote_failed','contributor_failed','participation_failed','reset_failed','client_failed','unhandled_failure','dispatch_failed')){return}
    Test-WrenSafePath $State.Directory
    $now=[DateTime]::UtcNow
    $record=[ordered]@{time=$now.ToString('o');event=$Event}
    foreach($key in @('code','status','exitCode')){
        $value=$Fields[$key]
        if(($value -is [int] -or $value -is [long]) -and $value -ge 0 -and $value -le 999999 -and ($key -ne 'status' -or $value -le 599)){$record[$key]=$value}
    }
    $line=($record|ConvertTo-Json -Compress)+[Environment]::NewLine
    $encoding=New-Object Text.UTF8Encoding($false)
    $size=$encoding.GetByteCount($line)
    if($size -gt $State.MaxBytes){return}
    Invoke-WrenLogMaintenance $State
    if(-not $State.Active -or -not(Test-Path -LiteralPath $State.Active) -or $State.Day -ne $now.ToString('yyyyMMdd') -or (Get-Item -LiteralPath $State.Active).Length+$size -gt $State.MaxBytes){
        $State.Active=Join-Path $State.Directory ('events-'+$now.ToString('yyyyMMddTHHmmssfffffffZ')+'-'+[guid]::NewGuid().ToString('N')+'.jsonl')
        $State.Day=$now.ToString('yyyyMMdd')
    }
    Test-WrenSafePath $State.Active
    [IO.File]::AppendAllText($State.Active,$line,$encoding)
    Invoke-WrenLogMaintenance $State
}
function Invoke-WrenLogMaintenance($State) {
    Test-WrenSafePath $State.Directory
    $cutoff=[DateTime]::UtcNow.AddDays(-$State.Days)
    $files=@(Get-ChildItem -LiteralPath $State.Directory -File | Where-Object Name -Match '^events-[0-9TZa-f-]+\.jsonl$' | Sort-Object Name)
    foreach($file in $files){
        if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unsafe log file'}
        if($file.LastWriteTimeUtc -lt $cutoff){Remove-Item -LiteralPath $file.FullName -Force}
    }
    $files=@(Get-ChildItem -LiteralPath $State.Directory -File | Where-Object Name -Match '^events-[0-9TZa-f-]+\.jsonl$' | Sort-Object Name)
    if($files.Count -gt $State.MaxFiles){$files|Select-Object -First ($files.Count-$State.MaxFiles)|ForEach-Object {Remove-Item -LiteralPath $_.FullName -Force}}
}
function Receive-WrenEvent {
    param($State,[AllowEmptyString()][string]$Line)
    if(-not $Line -or $Line.Length -gt 4096){return}
    try{$parsed=$Line|ConvertFrom-Json -ErrorAction Stop}catch{return}
    $fields=@{}
    foreach($key in @('code','status','exitCode')){if($null -ne $parsed.$key){$fields[$key]=$parsed.$key}}
    Write-WrenEvent $State ([string]$parsed.event) $fields
}
