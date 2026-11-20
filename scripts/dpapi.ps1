param([Parameter(Mandatory=$true)][ValidateSet('protect','unprotect','restrict')][string]$Operation,
      [string]$Path)
$ErrorActionPreference='Stop'
try {
    if ($Operation -eq 'restrict') {
        $item=Get-Item -LiteralPath $Path -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unsafe path' }
        $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
        if ($item.PSIsContainer) {
            $acl=New-Object Security.AccessControl.DirectorySecurity
            $inherit=[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
        } else {
            $acl=New-Object Security.AccessControl.FileSecurity
            $inherit=[Security.AccessControl.InheritanceFlags]::None
        }
        $acl.SetAccessRuleProtection($true,$false)
        foreach($identity in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
            $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl',$inherit,'None','Allow')
            $acl.AddAccessRule($rule)
        }
        # Persist only the DACL; changing owner/audit metadata can require extra privileges.
        if ($item.PSIsContainer) { [IO.Directory]::SetAccessControl($Path,$acl) }
        else { [IO.File]::SetAccessControl($Path,$acl) }
        exit 0
    }
    Add-Type -AssemblyName System.Security
    $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd())
    $entropy=[Text.Encoding]::UTF8.GetBytes('Wren protected storage v1')
    if ($Operation -eq 'protect') {
        $outputBytes=[Security.Cryptography.ProtectedData]::Protect($inputBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    } else {
        $outputBytes=[Security.Cryptography.ProtectedData]::Unprotect($inputBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    }
    [Console]::Out.Write([Convert]::ToBase64String($outputBytes))
} catch {
    [Console]::Error.WriteLine('WREN_SECURITY_FAILURE')
    exit 1
} finally {
    if ($null -ne $inputBytes) { [Array]::Clear($inputBytes,0,$inputBytes.Length) }
    if ($null -ne $outputBytes) { [Array]::Clear($outputBytes,0,$outputBytes.Length) }
}
