param(
  [Parameter(Mandatory = $false)]
  [string]$Executable = "src-tauri\target\debug\yuan.exe",

  [Parameter(Mandatory = $false)]
  [ValidateRange(1, 30)]
  [int]$WaitSeconds = 5
)

$ErrorActionPreference = "Stop"
$resolved = Resolve-Path -LiteralPath $Executable -ErrorAction Stop
$process = Start-Process -FilePath $resolved.Path -PassThru

try {
  if ($process.WaitForExit($WaitSeconds * 1000)) {
    throw "御案启动冒烟测试失败：进程在 $WaitSeconds 秒内提前退出，ExitCode=$($process.ExitCode)，Executable=$($resolved.Path)"
  }

  Write-Host "御案启动冒烟测试通过：进程持续运行 $WaitSeconds 秒，PID=$($process.Id)，Executable=$($resolved.Path)"
}
finally {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    $process.WaitForExit()
  }
}
