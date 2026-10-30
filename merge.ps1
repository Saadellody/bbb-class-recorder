# Merges every downloaded BBB recording into a single .mkv video
# (screen share or webcam video + class audio + chat as subtitles).
# No re-encoding, so it takes only a few seconds per recording.
#
# Usage:  powershell -ExecutionPolicy Bypass -File merge.ps1 [folder]
# Default folder: Downloads\BBB

param([string]$Root = (Join-Path $env:USERPROFILE "Downloads\BBB"))

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "ffmpeg is not installed. Install it with:  winget install Gyan.FFmpeg" -ForegroundColor Red
    Write-Host "Then close and reopen this window and run the script again."
    exit 1
}
if (-not (Test-Path $Root)) {
    Write-Host "Folder not found: $Root" -ForegroundColor Red
    exit 1
}

foreach ($rec in Get-ChildItem -LiteralPath $Root -Directory) {
    $dir = $rec.FullName
    $out = Join-Path $dir "$($rec.Name).mkv"
    if (Test-Path -LiteralPath $out) { Write-Host "Already merged: $($rec.Name)"; continue }

    # webcams.* = downloaded séance, video.webm = live recording
    $cam  = Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Name -like "webcams.*" -or $_.Name -eq "video.webm" } | Select-Object -First 1
    $desk = Get-ChildItem -LiteralPath $dir -File | Where-Object Name -like "deskshare.*" | Select-Object -First 1
    $srt  = Join-Path $dir "chat.srt"
    if (-not $cam) { Write-Host "Skipped (no audio file): $($rec.Name)" -ForegroundColor Yellow; continue }

    Write-Host "Merging: $($rec.Name)" -ForegroundColor Cyan
    $ff = @("-hide_banner", "-loglevel", "error", "-stats")
    if ($desk) {
        # Screen share as the picture, class audio from the webcam file
        $ff += @("-i", $desk.FullName, "-i", $cam.FullName, "-map", "0:v", "-map", "1:a")
    } else {
        $ff += @("-i", $cam.FullName, "-map", "0:v?", "-map", "0:a")
    }
    if (Test-Path -LiteralPath $srt) {
        $idx = if ($desk) { 2 } else { 1 }
        $ff += @("-i", $srt, "-map", "${idx}:s", "-c:s", "srt", "-metadata:s:s:0", "title=Chat")
    }
    $ff += @("-c:v", "copy", "-c:a", "copy", $out)

    & ffmpeg @ff
    if ($LASTEXITCODE -eq 0) { Write-Host "  -> $out" -ForegroundColor Green }
    else { Write-Host "  ffmpeg failed for $($rec.Name)" -ForegroundColor Red }
}
