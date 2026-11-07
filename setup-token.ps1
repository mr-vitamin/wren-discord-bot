$ErrorActionPreference = 'Stop'

try {
    $root = Split-Path -Parent $MyInvocation.MyCommand.Path
    $tokenPath = Join-Path $root 'token.dat'

    Add-Type -AssemblyName System.Security

    $Host.UI.RawUI.WindowTitle = 'Wren - Secure Token Setup'
    Write-Host 'Paste your Wren bot token, then press Enter.' -ForegroundColor Cyan
    Write-Host 'Nothing will appear while you paste. That is expected.'
    Write-Host 'The token will be encrypted for this Windows account and will not be stored as plain text.'
    $secureToken = Read-Host 'Bot token' -AsSecureString

    if ($secureToken.Length -lt 20) {
        throw 'Nothing was pasted, or the token was too short. Click after "Bot token:", press Ctrl+V, then press Enter.'
    }

    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
        $tokenBytes = [Text.Encoding]::UTF8.GetBytes($plainToken)
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect(
            $tokenBytes,
            $null,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        [IO.File]::WriteAllText($tokenPath, [Convert]::ToBase64String($protectedBytes), [Text.Encoding]::ASCII)
    }
    finally {
        if ($null -ne $tokenBytes) { [Array]::Clear($tokenBytes, 0, $tokenBytes.Length) }
        if ($null -ne $plainToken) { $plainToken = $null }
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }

    $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & "$env:SystemRoot\System32\icacls.exe" $tokenPath /inheritance:r /grant:r "*$currentUserSid`:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Windows could not restrict access to the encrypted token file.'
    }

    Write-Host ''
    Write-Host 'SUCCESS: Wren token saved securely.' -ForegroundColor Green
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ''
Read-Host 'Press Enter to close this window'
