$ErrorActionPreference='Stop'
try{
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 $tasks=@()
 foreach($name in @('Wren Discord Bot','Foxie Quotes Bot')){
  try{
   $task=Get-ScheduledTask -TaskPath '\' -TaskName $name -ErrorAction Stop
  }catch{
   # Only the intentionally retired task may be absent. All other failures stay fatal.
   if($name -eq 'Foxie Quotes Bot' -and $_.FullyQualifiedErrorId -eq 'CmdletizationQuery_NotFound,Get-ScheduledTask' -and $_.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::ObjectNotFound){continue}
   throw
  }
  if($name -eq 'Wren Discord Bot'){
   $sid=([Security.Principal.NTAccount]::new($task.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value
   if($sid -ne $identity.User.Value){throw 'account mismatch'}
  }
  $scheduler=New-Object -ComObject Schedule.Service;$scheduler.Connect()
  $sddl=$scheduler.GetFolder('\').GetTask($name).GetSecurityDescriptor(7)
  $tasks+=@{name=$name;xml=(Export-ScheduledTask -TaskPath '\' -TaskName $name);securityDescriptor=$sddl}
 }
 @{version=1;capturedUtc=[DateTime]::UtcNow.ToString('o');windowsAccountSid=$identity.User.Value;nodeVersion=(& node.exe --version);tasks=$tasks} | ConvertTo-Json -Depth 8 -Compress
}catch{[Console]::Error.WriteLine('WREN_CONTEXT_FAILED');exit 1}
