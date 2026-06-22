param()

$ErrorActionPreference = "Stop"

function Get-ScriptDir {
  if ($PSScriptRoot) {
    return $PSScriptRoot
  }

  if ($PSCommandPath) {
    return (Split-Path -Parent $PSCommandPath)
  }

  throw "Could not determine the script folder."
}

function Test-PortOpen {
  param(
    [string]$Host,
    [int]$Port
  )

  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect($Host, $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(500)
    if (-not $ok) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  throw "Node.js was not found."
}

$preferredFfmpeg = "C:\Users\Public\AppData\Roaming\Flixmate\ffmpeg.exe"
if (Test-Path -LiteralPath $preferredFfmpeg -PathType Leaf) {
  $env:PODCAST_FFMPEG_PATH = $preferredFfmpeg
}

$scriptDir = Get-ScriptDir
$serverPath = Join-Path $scriptDir "web\server.js"
$nodePath = Find-Node
$url = "http://127.0.0.1:3210"
$logDir = Join-Path $scriptDir "logs"
$stdoutLog = Join-Path $logDir "web-stdout.log"
$stderrLog = Join-Path $logDir "web-stderr.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-PortOpen -Host "127.0.0.1" -Port 3210)) {
  Start-Process -FilePath $nodePath `
    -ArgumentList "`"$serverPath`"" `
    -WorkingDirectory $scriptDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  Start-Sleep -Seconds 2
}

Start-Process $url
