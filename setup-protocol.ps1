# One-time setup: lets the team-skills web page install skills with one click.
#   Setup:   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/minhdv-zz/team-skills/main/setup-protocol.ps1)))
#   Remove:  ... -Remove
[CmdletBinding(PositionalBinding = $false)]
param(
    [switch]$Remove,
    [string]$Base = 'https://raw.githubusercontent.com/minhdv-zz/team-skills/main'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$dir = Join-Path $env:LOCALAPPDATA 'TeamSkills'
$key = 'HKCU:\Software\Classes\teamskills'

if ($Remove) {
    Remove-Item $key -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Removed teamskills:// handler.'
    return
}

New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($f in 'install.ps1', 'handler.ps1') {
    $out = Join-Path $dir $f
    if (Test-Path $Base) { Copy-Item (Join-Path $Base $f) $out -Force }
    else { Invoke-WebRequest "$Base/$f" -OutFile $out -UseBasicParsing }
}
New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name '(default)' -Value 'URL:TeamSkills'
New-ItemProperty -Path $key -Name 'URL Protocol' -Value '' -Force | Out-Null
New-Item -Path "$key\shell\open\command" -Force | Out-Null
$cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $dir 'handler.ps1') + '" "%1"'
Set-ItemProperty -Path "$key\shell\open\command" -Name '(default)' -Value $cmd
Write-Host "Done. Handler installed in $dir. Now click Install on the web page."
