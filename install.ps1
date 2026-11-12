# Cài skill của team vào máy (cách dự phòng, khi không dùng plugin).
# Dùng:  .\install.ps1          -> copy skill vào ~/.claude/skills
#        .\install.ps1 -Link    -> tạo junction, sau này chỉ cần git pull
param([switch]$Link)

$src  = Join-Path $PSScriptRoot 'plugins'
$dest = Join-Path $env:USERPROFILE '.claude\skills'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Get-ChildItem $src -Directory | ForEach-Object { Get-ChildItem (Join-Path $_.FullName 'skills') -Directory } | ForEach-Object {
    $target = Join-Path $dest $_.Name
    if (Test-Path $target) {
        $item = Get-Item $target -Force
        if ($item.LinkType) { $item.Delete() }
        else { Remove-Item $target -Recurse -Force }
    }
    if ($Link) {
        New-Item -ItemType Junction -Path $target -Target $_.FullName | Out-Null
        Write-Host "Linked  $($_.Name)"
    } else {
        Copy-Item $_.FullName $target -Recurse
        Write-Host "Copied  $($_.Name)"
    }
}
Write-Host "Xong. Mở lại Claude Code để nhận skill mới."
