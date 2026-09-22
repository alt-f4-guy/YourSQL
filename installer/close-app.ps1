param([Parameter(Mandatory = $true)][string]$InstallDirectory, [switch]$Force)
$ErrorActionPreference = 'Stop'
try {
  $executable = [IO.Path]::GetFullPath((Join-Path $InstallDirectory 'YourSQL.exe'))
  function Get-TargetProcesses {
    @(Get-Process -Name YourSQL -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -and [IO.Path]::GetFullPath($_.Path).Equals($executable, [StringComparison]::OrdinalIgnoreCase)
    })
  }
  $running = @(Get-TargetProcesses)
  if ($running.Count -gt 0) {
    # 창 없는 알림 실행에도 동일 설치 경로의 단일 인스턴스로 정상 종료를 요청한다.
    Start-Process -FilePath $executable -ArgumentList '--quit-for-uninstall' | Out-Null
    foreach ($target in $running) { if (-not $target.HasExited) { [void]$target.CloseMainWindow() } }
    $deadline = (Get-Date).AddSeconds(15)
    do { if (@(Get-TargetProcesses).Count -eq 0) { exit 0 }; Start-Sleep -Milliseconds 200 } while ((Get-Date) -lt $deadline)
  }
  $remaining = @(Get-TargetProcesses)
  if ($remaining.Count -gt 0 -and -not $Force) { Write-Output 'YourSQL이 종료를 보류했습니다. 저장되지 않은 내용이 있을 수 있습니다.'; exit 2 }
  foreach ($target in $remaining) {
    # 재조회한 대상 PID와 그 자식만 종료한다. 다른 설치 경로와 MySQL 서버는 건드리지 않는다.
    & "$env:SystemRoot\System32\taskkill.exe" /PID $target.Id /T /F | Out-Null
    if ($LASTEXITCODE -ne 0 -and -not $target.HasExited) { throw '강제 종료 요청에 실패했습니다.' }
    if (-not $target.WaitForExit(5000)) { throw 'YourSQL 프로세스가 종료되지 않았습니다.' }
  }
  if (@(Get-TargetProcesses).Count -gt 0) { throw 'YourSQL이 아직 실행 중입니다.' }
  exit 0
} catch { Write-Output $_.Exception.Message; exit 1 }
