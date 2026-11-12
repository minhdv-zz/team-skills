# Handler for teamskills:// links. Installed by setup-protocol.ps1.
param([string]$Url)
$ErrorActionPreference = 'Stop'
try {
    if ($Url -notmatch '^teamskills://install/?\?(.+)$') { throw 'Invalid link.' }
    $q = @{}
    foreach ($p in ($Matches[1].TrimEnd('/') -split '&')) {
        $kv = $p -split '=', 2
        if ($kv.Count -eq 2) { $q[$kv[0]] = [uri]::UnescapeDataString($kv[1]) }
    }
    $skill = $q['skill']
    if ($skill -notmatch '^[A-Za-z0-9_-]{1,64}$') { throw 'Invalid skill name.' }
    $dest = switch ($q['target']) {
        'claude'     { Join-Path $env:USERPROFILE '.claude\skills' }
        'claude-api' { Join-Path $env:USERPROFILE '.claude-api\skills' }
        default      { throw 'Invalid target.' }
    }
    Write-Host "TeamSkills: installing $skill -> $dest"
    & (Join-Path $PSScriptRoot 'install.ps1') $skill -Dest $dest
    Write-Host 'OK. This window closes in 4 seconds.'
    Start-Sleep -Seconds 4
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Press Enter to close.'
    [void](Read-Host)
}
