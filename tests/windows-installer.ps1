$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'GitHub Actions에서만 실행할 수 있습니다.' }
if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) { throw 'RUNNER_TEMP가 필요합니다.' }
$root = Split-Path -Parent $PSScriptRoot
$installer = Join-Path $root 'dist\YourSQL-Setup-x64.exe'
$install = Join-Path $env:LOCALAPPDATA 'Programs\YourSQL'
$data = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'YourSQL'
$theme = Join-Path $data 'theme'
$appKey = 'HKCU:\Software\YourSQL'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'YourSQL\YourSQL.lnk'
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version

if (Test-Path $data) { throw "기존 사용자 데이터가 있어 검사를 중단합니다: $data" }
New-Item -ItemType Directory -Force -Path $theme | Out-Null
Set-Content -LiteralPath (Join-Path $data 'installer-preserved.txt') -Value 'preserve' -NoNewline
Set-Content -LiteralPath (Join-Path $theme 'custom.json') -Value '{"personal":true}' -NoNewline

function Install-YourSQL {
  $process = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
  if ($process.ExitCode -ne 0) { throw "설치 실패: $($process.ExitCode)" }
  if (-not (Test-Path (Join-Path $install 'YourSQL.exe'))) { throw 'YourSQL.exe가 설치되지 않았습니다.' }
  if (-not (Test-Path (Join-Path $install 'Uninstall.exe'))) { throw '제거 프로그램이 설치되지 않았습니다.' }
  if ((Get-ItemPropertyValue $appKey InstallLocation) -ne $install) { throw '현재 사용자 설치 경로가 등록되지 않았습니다.' }
  if ((Get-ItemPropertyValue $uninstallKey DisplayVersion) -ne $version) { throw '제거 프로그램 버전이 일치하지 않습니다.' }
  if (-not (Test-Path $shortcut)) { throw '시작 메뉴 바로가기가 없습니다.' }
}

# NSIS 기본 실행기는 임시 제거 프로세스를 띄운 뒤 0으로 끝난다.
# 임시 복사본에 _?=를 전달하여 실제 제거 프로세스의 종료 코드를 검사한다.
function Invoke-YourSQLUninstall {
  param([switch]$Force)
  $temporary=Join-Path $env:RUNNER_TEMP ('yoursql-uninstall-'+[Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $temporary | Out-Null
  $copy=Join-Path $temporary 'Uninstall.exe'
  Copy-Item -LiteralPath (Join-Path $install 'Uninstall.exe') -Destination $copy
  $arguments='/S'
  if($Force){$arguments+=' /FORCE'}
  # NSIS의 _?= 경로는 마지막 인수이며 따옴표로 감싸지 않는다.
  $arguments+=' _?='+$install
  try { Start-Process -FilePath $copy -ArgumentList $arguments -WorkingDirectory $temporary -Wait -PassThru }
  finally { Remove-Item -LiteralPath $temporary -Recurse -Force }
}

Install-YourSQL
# 실행 중인 앱과 창 없이 남은 프로세스 모두 재설치 전에 종료되어야 합니다.
$env:SQL_PRACTICE_DATA_DIR = Join-Path $env:RUNNER_TEMP 'yoursql-installer-running'
$keepAlive = Join-Path $env:RUNNER_TEMP 'yoursql-keep-alive.cjs'
Set-Content -LiteralPath $keepAlive -Value 'setInterval(() => {}, 1000);'
foreach ($headless in @($false, $true)) {
  if ($headless) { $env:ELECTRON_RUN_AS_NODE = '1' }
  $arguments = @('--no-sandbox')
  if ($headless) { $arguments = @('"' + $keepAlive + '"') }
  $running = Start-Process -FilePath (Join-Path $install 'YourSQL.exe') -ArgumentList $arguments -PassThru
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  try {
    $deadline = (Get-Date).AddSeconds(60)
    do {
      Start-Sleep -Milliseconds 200
      $running.Refresh()
      if ($running.HasExited) { throw '재설치 검사 전에 앱이 종료되었습니다.' }
    } while (-not $headless -and $running.MainWindowHandle -eq 0 -and (Get-Date) -lt $deadline)
    if (-not $headless -and $running.MainWindowHandle -eq 0) { throw '앱 창이 열리지 않았습니다.' }
    Install-YourSQL
    if (-not $running.WaitForExit(5000)) { throw '재설치 후 이전 앱이 계속 실행 중입니다.' }
  } finally {
    if (-not $running.HasExited) { Stop-Process -Id $running.Id -Force }
  }
}
Remove-Item Env:SQL_PRACTICE_DATA_DIR
Install-YourSQL
if ((Get-Content -LiteralPath (Join-Path $data 'installer-preserved.txt') -Raw) -ne 'preserve') { throw '재설치 중 사용자 데이터가 변경되었습니다.' }
if ((Get-Content -LiteralPath (Join-Path $theme 'custom.json') -Raw) -ne '{"personal":true}') { throw '재설치 중 사용자 테마가 변경되었습니다.' }
$env:YOURSQL_TEST_EXECUTABLE = Join-Path $install 'YourSQL.exe'
& npm run test:packaged
if ($LASTEXITCODE -ne 0) { throw "설치 앱 검사 실패: $LASTEXITCODE" }
& npm run test:reminder
if ($LASTEXITCODE -ne 0) { throw "설치 앱 복습 알림 검사 실패: $LASTEXITCODE" }

$uninstaller = Join-Path $install 'Uninstall.exe'
$process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "제거 실패: $($process.ExitCode)" }
if (Test-Path $install) { throw '설치 폴더가 제거되지 않았습니다.' }
if (Test-Path $appKey) { throw '설치 위치 레지스트리가 제거되지 않았습니다.' }
if (Test-Path $uninstallKey) { throw '제거 프로그램 레지스트리가 제거되지 않았습니다.' }
if (Test-Path $shortcut) { throw '시작 메뉴 바로가기가 제거되지 않았습니다.' }
if ((Get-Content -LiteralPath (Join-Path $data 'installer-preserved.txt') -Raw) -ne 'preserve') { throw '사용자 데이터가 변경되었습니다.' }
if ((Get-Content -LiteralPath (Join-Path $theme 'custom.json') -Raw) -ne '{"personal":true}') { throw '사용자 테마가 변경되었습니다.' }
Write-Host 'Windows 설치·재설치·실행·제거·등록 정보·사용자 데이터·테마 보존 검사 통과'

# 별도 설치 경로의 프로세스와 개인 기록 해시를 보호하는 제거 회귀 검사.
$preserved = @((Join-Path $data 'installer-preserved.txt'),(Join-Path $theme 'custom.json'))
$beforeHashes = @($preserved | ForEach-Object { (Get-FileHash -LiteralPath $_).Hash })
$other = Join-Path $env:RUNNER_TEMP 'yoursql-other-install'
Copy-Item -LiteralPath (Join-Path $root 'dist\YourSQL-win32-x64') -Destination $other -Recurse -Force
$env:ELECTRON_RUN_AS_NODE='1'
$otherProcess = Start-Process -FilePath (Join-Path $other 'YourSQL.exe') -ArgumentList ('"'+$keepAlive+'"') -PassThru
Remove-Item Env:ELECTRON_RUN_AS_NODE
try {
  foreach ($scenario in @('normal','reminder','unresponsive')) {
    Install-YourSQL
    $env:SQL_PRACTICE_DATA_DIR=Join-Path $env:RUNNER_TEMP ('yoursql-uninstall-'+$scenario)
    if ($scenario -eq 'unresponsive') { $env:ELECTRON_RUN_AS_NODE='1'; $launchArguments=@('"'+$keepAlive+'"') }
    elseif ($scenario -eq 'reminder') { $launchArguments=@('--reminder-check') }
    else { $launchArguments=@('--no-sandbox') }
    $running=Start-Process -FilePath (Join-Path $install 'YourSQL.exe') -ArgumentList $launchArguments -PassThru
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    try {
      if ($scenario -ne 'reminder') { Start-Sleep -Seconds 3; $running.Refresh(); if($running.HasExited){throw '제거 검사 프로세스가 일찍 종료되었습니다.'} }
      $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $action=New-ScheduledTaskAction -Execute (Join-Path $install 'YourSQL.exe') -Argument '--reminder-check'
      Register-ScheduledTask -TaskName 'YourSQL Daily Reminder' -Action $action -Principal (New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive) -Force | Out-Null
      $process=Invoke-YourSQLUninstall
      if($scenario -eq 'unresponsive') {
        if($process.ExitCode -eq 0){throw '강제 옵션 없는 무인 제거가 성공으로 표시되었습니다.'}
        if(-not(Test-Path (Join-Path $install 'YourSQL.exe')) -or -not(Test-Path $uninstallKey)){throw '실패한 제거가 앱 또는 등록을 삭제했습니다.'}
        if((Get-ScheduledTask -TaskName 'YourSQL Daily Reminder').State -eq 'Disabled'){throw '종료 보류 후 예약을 복원하지 않았습니다.'}
        $process=Invoke-YourSQLUninstall -Force
      }
      if($process.ExitCode -ne 0){throw "실행 중 제거 실패: $scenario"}
      if(-not $running.WaitForExit(5000)){throw '대상 프로세스가 남아 있습니다.'}
      if(Test-Path $install){throw '앱 파일이 남아 있습니다.'}
      if(Get-ScheduledTask -TaskName 'YourSQL Daily Reminder' -ErrorAction SilentlyContinue){throw '예약이 남아 있습니다.'}
      $otherProcess.Refresh();if($otherProcess.HasExited){throw '다른 설치본의 프로세스를 종료했습니다.'}
      if((@($preserved | ForEach-Object {(Get-FileHash -LiteralPath $_).Hash}) -join ',') -ne ($beforeHashes -join ',')){throw '사용자 기록 해시가 변경되었습니다.'}
    }finally{if(-not $running.HasExited){Stop-Process -Id $running.Id -Force};Remove-Item Env:SQL_PRACTICE_DATA_DIR -ErrorAction SilentlyContinue}
  }
  # 실제 Windows 공유 잠금 중에는 일반·예약 실행 모두 종료하고, 잠금 해제 후 표식이 남아도 실행된다.
  Install-YourSQL
  $marker=Join-Path $install '.yoursql-uninstall'
  $lock=[IO.File]::Open($marker,[IO.FileMode]::Create,[IO.FileAccess]::ReadWrite,[IO.FileShare]::Read)
  try {
    $bytes=[Text.Encoding]::UTF8.GetBytes((@{pid=$PID;installDirectory=$install}|ConvertTo-Json -Compress));$lock.Write($bytes,0,$bytes.Length);$lock.Flush($true)
    foreach($launchArguments in @('--no-sandbox','--reminder-check')){
      $blocked=Start-Process -FilePath (Join-Path $install 'YourSQL.exe') -ArgumentList $launchArguments -PassThru
      if(-not $blocked.WaitForExit(10000)){Stop-Process -Id $blocked.Id -Force;throw '제거 잠금 중 재실행되었습니다.'}
    }
  }finally{$lock.Dispose()}
  $env:SQL_PRACTICE_DATA_DIR=Join-Path $env:RUNNER_TEMP 'yoursql-stale-uninstall'
  $restarted=Start-Process -FilePath (Join-Path $install 'YourSQL.exe') -ArgumentList '--no-sandbox' -PassThru
  Start-Sleep -Seconds 3;$restarted.Refresh();if($restarted.HasExited){throw '중단된 제거 표식이 앱을 영구 차단했습니다.'}
  $process=Invoke-YourSQLUninstall
  if($process.ExitCode -ne 0){throw '표식 복구 후 제거 실패'}
}finally{
  Remove-Item Env:SQL_PRACTICE_DATA_DIR -ErrorAction SilentlyContinue
  if(-not $otherProcess.HasExited){Stop-Process -Id $otherProcess.Id -Force}
}
Write-Host '정상/알림/무응답 제거·명시적 강제·경로 격리·잠금·중단 복구·기록 해시 PASS'

# 예약 삭제 거부를 성공으로 오인하지 않으며 앱·제거 등록과 예약 상태를 보존한다.
Install-YourSQL
$action=New-ScheduledTaskAction -Execute (Join-Path $install 'YourSQL.exe') -Argument '--reminder-check'
Register-ScheduledTask -TaskName 'YourSQL Daily Reminder' -Action $action -Principal (New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive) -Force | Out-Null
$schedule=New-Object -ComObject 'Schedule.Service';$schedule.Connect();$folder=$schedule.GetFolder('\');$protectedTask=$folder.GetTask('YourSQL Daily Reminder')
# 관리자 CI의 DACL 삭제 거부가 재현되지 않아 삭제 API만 오류를 주입한다.
# 실제 작업의 조회·비활성화·실패 후 활성화는 Task Scheduler에서 수행한다.
$denialOutput=& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'fixtures\deny-task-delete.ps1') -Helper (Join-Path $root 'installer\uninstall-app.ps1') -InstallDirectory $install
if($LASTEXITCODE -eq 0){throw '예약 삭제 API 권한 오류를 성공으로 표시했습니다.'}
if(($denialOutput -join ' ') -notmatch 'Injected task deletion denied'){throw ('삭제 경계까지 도달하지 못했습니다: '+($denialOutput -join ' '))}
if(-not(Test-Path (Join-Path $install 'YourSQL.exe')) -or -not(Test-Path $uninstallKey)){throw '예약 삭제 실패 전에 앱을 삭제했습니다.'}
if(-not $folder.GetTask('YourSQL Daily Reminder').Enabled){throw '예약 삭제 실패 후 원래 활성 상태를 복원하지 않았습니다.'}
Write-Host '예약 삭제 API 오류 주입·실제 예약 활성 상태 복원 PASS'
# 삭제 중 파일 잠금 실패도 다시 실행할 수 있는 제거 프로그램과 등록을 남긴다.
$lockedFile=Join-Path $install 'locked-removal-check.txt';Set-Content -LiteralPath $lockedFile -Value 'held'
$held=[IO.File]::Open($lockedFile,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
  $process=Invoke-YourSQLUninstall
  if($process.ExitCode -eq 0){throw '삭제 도중 실패를 성공으로 표시했습니다.'}
  if(-not(Test-Path (Join-Path $install 'Uninstall.exe')) -or -not(Test-Path $uninstallKey)){throw '삭제 실패 후 재시도 정보를 잃었습니다.'}
}finally{$held.Dispose()}
$process=Invoke-YourSQLUninstall
if($process.ExitCode -ne 0 -or (Test-Path $install)){throw '파일 잠금 해제 후 제거 재시도 실패'}
Write-Host '예약 삭제 API 오류·실제 파일 잠금 실패·재시도 PASS'

# 마지막 설치 키 삭제가 거부되어도 제거 프로그램과 제어판 진입점을 복원한다.
Install-YourSQL
$oldAcl=Get-Acl -LiteralPath $appKey
$denyDelete=[Security.AccessControl.RegistryAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.RegistryRights]::Delete,[Security.AccessControl.AccessControlType]::Deny)
$deniedAcl=Get-Acl -LiteralPath $appKey;$deniedAcl.AddAccessRule($denyDelete)
try{
  Set-Acl -LiteralPath $appKey -AclObject $deniedAcl
  $process=Invoke-YourSQLUninstall
  if($process.ExitCode -eq 0){throw '마지막 등록 삭제 거부를 성공으로 표시했습니다.'}
  if(-not(Test-Path (Join-Path $install 'Uninstall.exe')) -or -not(Test-Path $uninstallKey)){throw '마지막 등록 삭제 실패 후 재시도 진입점이 없습니다.'}
  if((Get-ItemProperty -LiteralPath $uninstallKey).UninstallString -ne ('"'+(Join-Path $install 'Uninstall.exe')+'"')){throw '복원한 제거 명령이 올바르지 않습니다.'}
}finally{Set-Acl -LiteralPath $appKey -AclObject $oldAcl}
$process=Invoke-YourSQLUninstall
if($process.ExitCode -ne 0 -or (Test-Path $install)){throw '레지스트리 권한 복원 후 제거 재시도 실패'}
Write-Host '마지막 레지스트리 삭제 실패 후 재시도 PASS'
