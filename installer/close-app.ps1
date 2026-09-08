param([Parameter(Mandatory = $true)][string]$InstallDirectory)
$ErrorActionPreference = 'Stop'

try {
  # 설치 대상 경로만 종료하여 다른 폴더의 앱은 보호합니다.
  $executable = Join-Path $InstallDirectory 'YourSQL.exe'
  $running = @(Get-Process -Name YourSQL -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable })
  foreach ($process in $running) {
    if (-not $process.HasExited) { [void]$process.CloseMainWindow() }
  }
  # 정상 종료 시 기존 앱의 초안 저장과 엔진 정리가 먼저 실행됩니다.
  $deadline = (Get-Date).AddSeconds(10)
  foreach ($process in $running) {
    $remaining = [Math]::Max(0, [int]($deadline - (Get-Date)).TotalMilliseconds)
    if (-not $process.HasExited -and -not $process.WaitForExit($remaining)) {
      & "$env:SystemRoot\System32\taskkill.exe" /PID $process.Id /T /F | Out-Null
      if (-not $process.WaitForExit(5000)) { throw 'YourSQL 프로세스가 종료되지 않았습니다.' }
    }
  }
  if (Get-Process -Name YourSQL -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $executable }) {
    throw 'YourSQL이 아직 실행 중입니다.'
  }
  exit 0
} catch {
  Write-Output $_.Exception.Message
  exit 1
}
