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

Install-YourSQL
# 실행 중인 앱과 창 없이 남은 프로세스 모두 재설치 전에 종료되어야 합니다.
$env:SQL_PRACTICE_DATA_DIR = Join-Path $env:RUNNER_TEMP 'yoursql-installer-running'
$keepAlive = Join-Path $env:RUNNER_TEMP 'yoursql-keep-alive.cjs'
Set-Content -LiteralPath $keepAlive -Value 'setInterval(() => {}, 1000);'
foreach ($headless in @($false, $true)) {
  if ($headless) { $env:ELECTRON_RUN_AS_NODE = '1' }
  $arguments = if ($headless) { @('"' + $keepAlive + '"') } else { @() }
  $running = Start-Process -FilePath (Join-Path $install 'YourSQL.exe') -ArgumentList ($arguments + '--no-sandbox') -PassThru
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
