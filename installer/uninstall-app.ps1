param([Parameter(Mandatory = $true)][string]$InstallDirectory, [switch]$Force)
$ErrorActionPreference = 'Stop'
$lock = $null; $task = $null; $taskXML = $null; $wasEnabled = $false; $taskDeleted = $false; $deleting = $false; $code = 1
try {
  $install = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
  $expected = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\YourSQL')).TrimEnd('\')
  if (-not $install.Equals($expected, [StringComparison]::OrdinalIgnoreCase)) { throw 'YourSQL 설치 경로가 아닙니다.' }
  if ((Get-Content -LiteralPath (Join-Path $install '.yoursql-install') -Raw) -ne 'YourSQL') { throw '설치 표식이 일치하지 않습니다.' }
  if ((Get-Item -LiteralPath $install).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '연결된 설치 경로는 제거하지 않습니다.' }
  $executable = Join-Path $install 'YourSQL.exe'
  $marker = Join-Path $install '.yoursql-uninstall'
  $lock = [IO.File]::Open($marker, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
  $bytes = [Text.Encoding]::UTF8.GetBytes((@{pid=$PID;installDirectory=$install} | ConvertTo-Json -Compress))
  $lock.SetLength(0); $lock.Write($bytes,0,$bytes.Length); $lock.Flush($true)
  $scheduler = New-Object -ComObject 'Schedule.Service'; $scheduler.Connect()
  $folder = $scheduler.GetFolder('\'); $taskName = 'YourSQL Daily Reminder'
  function Get-ReminderTask {
    try { return $folder.GetTask($taskName) }
    catch { $errorObject=$_.Exception; while ($errorObject.InnerException) { $errorObject=$errorObject.InnerException }; if ($errorObject.HResult -eq -2147024894) { return $null }; throw }
  }
  $candidate = Get-ReminderTask
  if ($null -ne $candidate) {
    $definition = $candidate.Definition
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $owner = $definition.Principal.UserId
    if ($owner -and -not $owner.StartsWith('S-1-')) { $owner = ([Security.Principal.NTAccount]::new($owner)).Translate([Security.Principal.SecurityIdentifier]).Value }
    if ($owner -eq $sid -and $definition.Actions.Count -eq 1 -and [IO.Path]::GetFullPath($definition.Actions.Item(1).Path).Equals($executable,[StringComparison]::OrdinalIgnoreCase)) {
      $task=$candidate; $taskXML=$task.Xml; $wasEnabled=$task.Enabled; $task.Enabled=$false
    }
  }
  $arguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'close-app.ps1'),'-InstallDirectory',$install)
  if ($Force) { $arguments += '-Force' }
  & "$PSHOME\powershell.exe" @arguments
  if ($LASTEXITCODE -ne 0) { $code=$LASTEXITCODE; throw '앱 종료를 확인하지 못해 제거를 중단합니다.' }
  if ($task) {
    $folder.DeleteTask($taskName,0); $taskDeleted=$true
    if ($null -ne (Get-ReminderTask)) { throw '예약 작업이 남아 있어 제거를 중단합니다.' }
  }
  $programs=[Environment]::GetFolderPath('Programs'); $wsh=New-Object -ComObject WScript.Shell
  foreach ($shortcut in @((Join-Path $programs 'YourSQL\YourSQL.lnk'),(Join-Path $programs 'YourSQL\YourSQL Reminders.lnk'),(Join-Path $programs 'YourSQL.lnk'))) {
    if (Test-Path -LiteralPath $shortcut) {
      $target=$wsh.CreateShortcut($shortcut).TargetPath
      if ($target -and [IO.Path]::GetFullPath($target).Equals($executable,[StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $shortcut -Force }
    }
  }
  $startFolder=Join-Path $programs 'YourSQL'
  if ((Test-Path -LiteralPath $startFolder) -and @(Get-ChildItem -LiteralPath $startFolder -Force).Count -eq 0) { Remove-Item -LiteralPath $startFolder }
  # 네이티브 64비트 PowerShell에서 현재 사용자 알림 등록의 대상 경로를 확인한다.
  $clsid='HKCU:\Software\Classes\CLSID\{C00C9F0B-5698-4B7D-9845-487475797391}'
  if (Test-Path -LiteralPath "$clsid\LocalServer32") {
    $server=(Get-Item -LiteralPath "$clsid\LocalServer32").GetValue('')
    if ($server -and ($server.StartsWith('"'+$executable+'"',[StringComparison]::OrdinalIgnoreCase) -or $server.Equals($executable,[StringComparison]::OrdinalIgnoreCase))) {
      Remove-Item -LiteralPath $clsid -Recurse -Force
      $appId='HKCU:\Software\Classes\AppUserModelId\local.yoursql.practice'
      if (Test-Path -LiteralPath $appId) { Remove-Item -LiteralPath $appId -Recurse -Force }
    }
  }
  $deleting=$true
  # 실패하면 제거 프로그램과 설치 표식·레지스트리는 남아 다시 실행할 수 있다.
  Get-ChildItem -LiteralPath $install -Force | Where-Object { $_.Name -notin @('Uninstall.exe','.yoursql-install','.yoursql-uninstall') } | Remove-Item -Recurse -Force
  $left=@(Get-ChildItem -LiteralPath $install -Force | Where-Object { $_.Name -notin @('Uninstall.exe','.yoursql-install','.yoursql-uninstall') })
  if ($left.Count -gt 0) { throw '앱 파일이 남아 있습니다.' }
  $code=0
} catch {
  Write-Output $_.Exception.Message
  if (-not $deleting -and $task) {
    try {
      if ($taskDeleted) { $restored=$folder.RegisterTask($taskName,$taskXML,6,$null,$null,3,$null); $restored.Enabled=$wasEnabled }
      else { $task.Enabled=$wasEnabled }
    } catch { Write-Output "예약 상태 복원 실패: $($_.Exception.Message)" }
  }
} finally {
  if ($lock) { $lock.Dispose(); Remove-Item -LiteralPath $marker -Force -ErrorAction SilentlyContinue }
}
exit $code
