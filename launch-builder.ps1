param()

$ErrorActionPreference = "Stop"

function Get-ScriptDir {
  if ($PSScriptRoot) {
    return $PSScriptRoot
  }

  if ($PSCommandPath) {
    return (Split-Path -Parent $PSCommandPath)
  }

  if ($MyInvocation -and $MyInvocation.MyCommand -and $MyInvocation.MyCommand.Path) {
    return (Split-Path -Parent $MyInvocation.MyCommand.Path)
  }

  throw "Could not determine the script folder."
}

function Prompt-Value {
  param(
    [string]$Label,
    [string]$Default = "",
    [switch]$Required
  )

  while ($true) {
    if ($Default) {
      $value = Read-Host "$Label [$Default]"
      if ([string]::IsNullOrWhiteSpace($value)) {
        $value = $Default
      }
    } else {
      $value = Read-Host $Label
    }

    if (-not $Required -and [string]::IsNullOrWhiteSpace($value)) {
      return ""
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }

    Write-Host "Please enter a value." -ForegroundColor Yellow
  }
}

function Prompt-ExistingFile {
  param(
    [string]$Label,
    [string]$Default = "",
    [switch]$Optional
  )

  while ($true) {
    $value = Prompt-Value -Label $Label -Default $Default -Required:(-not $Optional)
    if ([string]::IsNullOrWhiteSpace($value) -and $Optional) {
      return ""
    }

    if (Test-Path -LiteralPath $value -PathType Leaf) {
      return (Resolve-Path -LiteralPath $value).Path
    }

    Write-Host "File not found: $value" -ForegroundColor Red
  }
}

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  throw "Node.js was not found. Please install Node.js or ask me to switch this tool to a different runtime."
}

function Get-DefaultFfmpegPath {
  $candidates = @(
    "C:\Users\Public\AppData\Roaming\Flixmate\ffmpeg.exe",
    "C:\Program Files\Wondershare\Wondershare UniConverter 16\ffmpeg.exe",
    "C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    "C:\ffmpeg\bin\ffmpeg.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }

  return ""
}

function Start-Builder {
  $scriptDir = Get-ScriptDir
  $buildScript = Join-Path $scriptDir "src\buildPodcast.js"
  $configPath = Join-Path $scriptDir "config.generated.json"

  if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) {
    throw "Build script was not found: $buildScript"
  }

  Write-Host ""
  Write-Host "Video Podcast Builder" -ForegroundColor Cyan
  Write-Host "Paste each file path when asked." -ForegroundColor Gray
  Write-Host ""

  $ffmpegPath = Prompt-ExistingFile -Label "ffmpeg.exe path" -Default (Get-DefaultFfmpegPath)
  $mainVideo = Prompt-ExistingFile -Label "Main video path"
  $introImage = Prompt-ExistingFile -Label "Intro image path"
  $jingleImage = Prompt-ExistingFile -Label "Jingle image path"
  $bgm = Prompt-ExistingFile -Label "BGM audio path"
  $jingle = Prompt-ExistingFile -Label "Jingle audio path"
  $jingleGeneratorScript = Prompt-ExistingFile -Label "Jingle generator script path (optional)" -Optional
  $pythonCommand = Prompt-Value -Label "Python command for jingle regeneration (optional)" -Default "python"
  $insert1 = Prompt-Value -Label "First jingle insert time" -Default "00:03:13" -Required
  $insert2 = Prompt-Value -Label "Second jingle insert time" -Default "00:11:29" -Required
  $outputName = Prompt-Value -Label "Output file name" -Default "podcast_episode.mp4" -Required

  $config = [ordered]@{
    ffmpegPath = $ffmpegPath
    outputDir = "./build"
    video = [ordered]@{
      mainVideo = $mainVideo
      introImage = $introImage
      jingleImage = $jingleImage
    }
    audio = [ordered]@{
      bgm = $bgm
      jingle = $jingle
      jingleGeneratorScript = $jingleGeneratorScript
      pythonCommand = $pythonCommand
    }
    timing = [ordered]@{
      introDurationSec = 8
      jingleDurationSec = 4
      insertTimes = @($insert1, $insert2)
    }
    mix = [ordered]@{
      introBgmVolume = 1.0
      mainBgmVolume = 0.1
      jingleVolume = 0.4
      introFadeInSec = 2
    }
    output = [ordered]@{
      width = 1920
      height = 1080
      videoCodec = "libx264"
      audioCodec = "aac"
      audioBitrate = "192k"
      pixelFormat = "yuv420p"
      fileName = $outputName
    }
  }

  $json = $config | ConvertTo-Json -Depth 10
  Set-Content -LiteralPath $configPath -Value $json -Encoding UTF8

  $nodePath = Find-Node

  Write-Host ""
  Write-Host "Starting build..." -ForegroundColor Green
  Write-Host ""

  & $nodePath $buildScript --config $configPath
  $exitCode = $LASTEXITCODE

  Write-Host ""
  if ($exitCode -eq 0) {
    Write-Host "Finished. Check the build folder." -ForegroundColor Green
  } else {
    Write-Host "Build failed with exit code $exitCode." -ForegroundColor Red
  }

  return $exitCode
}

try {
  $code = Start-Builder
  Write-Host ""
  Read-Host "Press Enter to close"
  exit $code
} catch {
  Write-Host ""
  Write-Host "The builder could not start." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
  Write-Host ""
  Read-Host "Press Enter to close"
  exit 1
}
