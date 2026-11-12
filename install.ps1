# Install team skills, no git needed.
#
#   One skill:      & ([scriptblock]::Create((irm https://raw.githubusercontent.com/minhdv-zz/team-skills/main/install.ps1))) copymau-hoidz
#   Several:         ... copymau-hoidz thoidz
#   All:            ... -All
#   List:        ... -List
#   Other dir:   ... copymau-hoidz -Dest C:\temp\skills
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Skill,
    [switch]$All,
    [switch]$List,
    [string]$Dest = (Join-Path $env:USERPROFILE '.claude\skills'),
    [string]$Repo = 'minhdv-zz/team-skills',
    [string]$Ref  = 'main'
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("team-skills-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $zip = Join-Path $tmp 'repo.zip'
    Invoke-WebRequest "https://github.com/$Repo/archive/refs/heads/$Ref.zip" -OutFile $zip -UseBasicParsing
    Expand-Archive $zip -DestinationPath $tmp -Force
    $root = Get-ChildItem $tmp -Directory | Select-Object -First 1
    $available = Get-ChildItem (Join-Path $root.FullName 'plugins') -Directory |
        ForEach-Object { Get-ChildItem (Join-Path $_.FullName 'skills') -Directory }

    if ($List -or (-not $All -and -not $Skill)) {
        Write-Host 'Available skills:'; $available | ForEach-Object { Write-Host "  $($_.Name)" }
        if (-not $List) { Write-Host 'Pick a skill: add its name after the command, or use -All.' }
        return
    }
    $pick = if ($All) { $available } else {
        $Skill | ForEach-Object {
            $n = $_
            $m = $available | Where-Object { $_.Name -eq $n -or $_.Name -eq ($n -replace '-', '_') -or ($_.Name -replace '_', '-') -eq $n }
            if (-not $m) { throw "No skill named '$n'. Run with -List to see the list." }
            $m
        }
    }
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    foreach ($s in $pick) {
        $target = Join-Path $Dest $s.Name
        if (Test-Path $target) { Remove-Item $target -Recurse -Force }
        Copy-Item $s.FullName $target -Recurse
        Write-Host "Installed $($s.Name) -> $target"
    }
    Write-Host 'Done. Restart Claude Code to load the new skills.'
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
