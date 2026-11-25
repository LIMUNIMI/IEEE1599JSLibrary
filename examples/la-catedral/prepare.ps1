param([Parameter(Mandatory)][string]$Source)

$ErrorActionPreference = 'Stop'
$Source = (Resolve-Path -LiteralPath $Source).Path
$destination = Join-Path $PSScriptRoot 'local'
$audio = Join-Path $destination 'audio_files'
$score = Join-Path $destination 'score_files'
$null = New-Item -ItemType Directory -Force -Path $audio, "$score\transcription_n.1", "$score\transcription_n.2"

function Convert-Media {
    param([string[]]$Arguments)
    & ffmpeg -hide_banner -loglevel error -nostdin -y @Arguments
    if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed with exit code $LASTEXITCODE" }
}

Copy-Item -LiteralPath "$Source\catedral.xml" -Destination $destination -Force
foreach ($file in 'catedral_barrios_1928.mp3', 'catedral_mavrudis_1990.mp3') {
    Copy-Item -LiteralPath "$Source\audio_files\$file" -Destination $audio -Force
}
Copy-Item -LiteralPath "$Source\score_files\transcription_n.2\catedral_original.jpg" -Destination "$score\transcription_n.2" -Force
Convert-Media @('-i', "$Source\score_files\transcription_n.1\catedral_transcription.tif", '-frames:v', '1', '-pix_fmt', 'rgba', "$score\transcription_n.1\catedral_transcription.png")
$avi = "$Source\audio_files\catedral_vidovic_video.avi"
Convert-Media @('-i', $avi, '-map', '0:v:0', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'baseline', '-level:v', '3.0', '-crf', '20', '-g', '60', '-fps_mode', 'passthrough', '-movflags', '+faststart', "$audio\catedral_vidovic_video.mp4")
Convert-Media @('-i', $avi, '-map', '0:a:0', '-c:a', 'copy', '-write_xing', '0', "$audio\catedral_vidovic_soundtrack.mp3")
