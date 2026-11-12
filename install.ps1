# Cài skill của team, không cần git.
#
#   Cài 1 skill:   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/minhdv-zz/team-skills/main/install.ps1))) copymau-hoidz
#   Cài nhiều:     ... copymau-hoidz thoidz
#   Cài tất cả:    ... -All
#   Xem danh sách: ... -List
#   Thử vào thư mục khác: ... copymau-hoidz -Dest C:\temp\skills
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
        Write-Host 'Skill có sẵn:'; $available | ForEach-Object { Write-Host "  $($_.Name)" }
        if (-not $List) { Write-Host 'Chọn skill: thêm tên skill phía sau, hoặc -All để cài hết.' }
        return
    }
    $pick = if ($All) { $available } else {
        $Skill | ForEach-Object {
            $n = $_
            $m = $available | Where-Object { $_.Name -eq $n -or $_.Name -eq ($n -replace '-', '_') -or ($_.Name -replace '_', '-') -eq $n }
            if (-not $m) { throw "Không có skill '$n'. Chạy với -List để xem danh sách." }
            $m
        }
    }
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    foreach ($s in $pick) {
        $target = Join-Path $Dest $s.Name
        if (Test-Path $target) { Remove-Item $target -Recurse -Force }
        Copy-Item $s.FullName $target -Recurse
        Write-Host "Đã cài $($s.Name) -> $target"
    }
    Write-Host 'Xong. Mở lại Claude Code để nhận skill mới.'
} finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
