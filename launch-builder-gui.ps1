Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

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

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  throw "Node.js was not found."
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

function Add-FileRow {
  param(
    [System.Windows.Forms.Form]$Form,
    [string]$Label,
    [int]$Top,
    [string]$DefaultPath = "",
    [string]$Filter = "All files (*.*)|*.*"
  )

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Label
  $label.Left = 20
  $label.Top = $Top + 5
  $label.Width = 160
  $Form.Controls.Add($label)

  $textBox = New-Object System.Windows.Forms.TextBox
  $textBox.Left = 185
  $textBox.Top = $Top
  $textBox.Width = 470
  $textBox.Text = $DefaultPath
  $Form.Controls.Add($textBox)

  $button = New-Object System.Windows.Forms.Button
  $button.Text = "Browse"
  $button.Left = 665
  $button.Top = $Top - 1
  $button.Width = 95
  $Form.Controls.Add($button)

  $button.Add_Click({
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Filter = $Filter
    $dialog.CheckFileExists = $true
    $dialog.Multiselect = $false

    if ($textBox.Text -and (Test-Path -LiteralPath $textBox.Text -PathType Leaf)) {
      $dialog.InitialDirectory = Split-Path -Parent $textBox.Text
      $dialog.FileName = Split-Path -Leaf $textBox.Text
    }

    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $textBox.Text = $dialog.FileName
    }
  })

  return $textBox
}

function Write-Log {
  param(
    [System.Windows.Forms.TextBox]$LogBox,
    [string]$Message
  )

  $LogBox.AppendText($Message + [Environment]::NewLine)
}

$scriptDir = Get-ScriptDir
$buildScript = Join-Path $scriptDir "src\buildPodcast.js"
$generatedConfig = Join-Path $scriptDir "config.generated.json"

$form = New-Object System.Windows.Forms.Form
$form.Text = "Video Podcast Builder"
$form.Width = 810
$form.Height = 690
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Yu Gothic UI", 10)
$form.BackColor = [System.Drawing.Color]::FromArgb(248, 245, 239)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Video Podcast Builder"
$title.Left = 20
$title.Top = 18
$title.Width = 400
$title.Font = New-Object System.Drawing.Font("Yu Gothic UI Semibold", 16)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Pick your files, then press Build."
$subtitle.Left = 22
$subtitle.Top = 52
$subtitle.Width = 350
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(90, 90, 90)
$form.Controls.Add($subtitle)

$ffmpegBox = Add-FileRow -Form $form -Label "ffmpeg.exe" -Top 95 -DefaultPath (Get-DefaultFfmpegPath) -Filter "ffmpeg.exe|ffmpeg.exe|All files (*.*)|*.*"
$mainVideoBox = Add-FileRow -Form $form -Label "Main video" -Top 140 -Filter "Video files|*.mp4;*.mov;*.mkv;*.m4v;*.avi|All files (*.*)|*.*"
$introImageBox = Add-FileRow -Form $form -Label "Intro image" -Top 185 -Filter "Image files|*.png;*.jpg;*.jpeg;*.webp|All files (*.*)|*.*"
$jingleImageBox = Add-FileRow -Form $form -Label "Jingle image" -Top 230 -Filter "Image files|*.png;*.jpg;*.jpeg;*.webp|All files (*.*)|*.*"
$bgmBox = Add-FileRow -Form $form -Label "BGM audio" -Top 275 -Filter "Audio files|*.mp3;*.wav;*.m4a;*.aac|All files (*.*)|*.*"
$jingleBox = Add-FileRow -Form $form -Label "Jingle audio" -Top 320 -Filter "Audio files|*.mp3;*.wav;*.m4a;*.aac|All files (*.*)|*.*"
$generatorBox = Add-FileRow -Form $form -Label "Jingle generator (optional)" -Top 365 -Filter "Python files|*.py|All files (*.*)|*.*"

$time1Label = New-Object System.Windows.Forms.Label
$time1Label.Text = "Jingle time 1"
$time1Label.Left = 20
$time1Label.Top = 414
$time1Label.Width = 160
$form.Controls.Add($time1Label)

$time1Box = New-Object System.Windows.Forms.TextBox
$time1Box.Left = 185
$time1Box.Top = 409
$time1Box.Width = 130
$time1Box.Text = "00:03:13"
$form.Controls.Add($time1Box)

$time2Label = New-Object System.Windows.Forms.Label
$time2Label.Text = "Jingle time 2"
$time2Label.Left = 335
$time2Label.Top = 414
$time2Label.Width = 110
$form.Controls.Add($time2Label)

$time2Box = New-Object System.Windows.Forms.TextBox
$time2Box.Left = 445
$time2Box.Top = 409
$time2Box.Width = 130
$time2Box.Text = "00:11:29"
$form.Controls.Add($time2Box)

$nameLabel = New-Object System.Windows.Forms.Label
$nameLabel.Text = "Output file name"
$nameLabel.Left = 20
$nameLabel.Top = 459
$nameLabel.Width = 160
$form.Controls.Add($nameLabel)

$nameBox = New-Object System.Windows.Forms.TextBox
$nameBox.Left = 185
$nameBox.Top = 454
$nameBox.Width = 390
$nameBox.Text = "podcast_episode.mp4"
$form.Controls.Add($nameBox)

$buildButton = New-Object System.Windows.Forms.Button
$buildButton.Text = "Build MP4"
$buildButton.Left = 600
$buildButton.Top = 450
$buildButton.Width = 160
$buildButton.Height = 36
$buildButton.BackColor = [System.Drawing.Color]::FromArgb(216, 113, 55)
$buildButton.ForeColor = [System.Drawing.Color]::White
$buildButton.FlatStyle = "Flat"
$form.Controls.Add($buildButton)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "Status: waiting"
$statusLabel.Left = 20
$statusLabel.Top = 505
$statusLabel.Width = 740
$form.Controls.Add($statusLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Left = 20
$logBox.Top = 535
$logBox.Width = 740
$logBox.Height = 100
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.BackColor = [System.Drawing.Color]::White
$form.Controls.Add($logBox)

$buildButton.Add_Click({
  try {
    $requiredFiles = @(
      @{ Name = "ffmpeg.exe"; Value = $ffmpegBox.Text },
      @{ Name = "Main video"; Value = $mainVideoBox.Text },
      @{ Name = "Intro image"; Value = $introImageBox.Text },
      @{ Name = "Jingle image"; Value = $jingleImageBox.Text },
      @{ Name = "BGM audio"; Value = $bgmBox.Text },
      @{ Name = "Jingle audio"; Value = $jingleBox.Text }
    )

    foreach ($item in $requiredFiles) {
      if ([string]::IsNullOrWhiteSpace($item.Value) -or -not (Test-Path -LiteralPath $item.Value -PathType Leaf)) {
        [System.Windows.Forms.MessageBox]::Show("$($item.Name) is missing.", "Missing file")
        return
      }
    }

    if ($generatorBox.Text -and -not (Test-Path -LiteralPath $generatorBox.Text -PathType Leaf)) {
      [System.Windows.Forms.MessageBox]::Show("Jingle generator script was not found.", "Missing file")
      return
    }

    if ([string]::IsNullOrWhiteSpace($nameBox.Text)) {
      [System.Windows.Forms.MessageBox]::Show("Please enter the output file name.", "Missing value")
      return
    }

    $buildButton.Enabled = $false
    $statusLabel.Text = "Status: building..."
    $logBox.Clear()
    Write-Log -LogBox $logBox -Message "Preparing build..."

    $config = [ordered]@{
      ffmpegPath = $ffmpegBox.Text.Trim()
      outputDir = "./build"
      video = [ordered]@{
        mainVideo = $mainVideoBox.Text.Trim()
        introImage = $introImageBox.Text.Trim()
        jingleImage = $jingleImageBox.Text.Trim()
      }
      audio = [ordered]@{
        bgm = $bgmBox.Text.Trim()
        jingle = $jingleBox.Text.Trim()
        jingleGeneratorScript = $generatorBox.Text.Trim()
        pythonCommand = "python"
      }
      timing = [ordered]@{
        introDurationSec = 8
        jingleDurationSec = 4
        insertTimes = @($time1Box.Text.Trim(), $time2Box.Text.Trim())
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
        fileName = $nameBox.Text.Trim()
      }
    }

    $json = $config | ConvertTo-Json -Depth 10
    Set-Content -LiteralPath $generatedConfig -Value $json -Encoding UTF8

    $nodePath = Find-Node
    Write-Log -LogBox $logBox -Message "Starting ffmpeg pipeline..."

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $nodePath
    $psi.Arguments = "`"$buildScript`" --config `"$generatedConfig`""
    $psi.WorkingDirectory = $scriptDir
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $null = $process.Start()

    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($stdout) {
      Write-Log -LogBox $logBox -Message $stdout.TrimEnd()
    }
    if ($stderr) {
      Write-Log -LogBox $logBox -Message $stderr.TrimEnd()
    }

    if ($process.ExitCode -eq 0) {
      $statusLabel.Text = "Status: done"
      [System.Windows.Forms.MessageBox]::Show("Done. The MP4 is in the build folder.", "Finished")
    } else {
      $statusLabel.Text = "Status: failed"
      [System.Windows.Forms.MessageBox]::Show("Build failed. See the log at the bottom.", "Build failed")
    }
  } catch {
    $statusLabel.Text = "Status: failed"
    Write-Log -LogBox $logBox -Message $_.Exception.Message
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Could not build")
  } finally {
    $buildButton.Enabled = $true
  }
})

[void]$form.ShowDialog()
