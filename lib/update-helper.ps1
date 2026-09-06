# 경로는 JSON으로 전달받아 리터럴 경로로 처리한다. 학습 데이터 폴더는 건드리지 않는다.
$ErrorActionPreference = 'Stop'
$transaction = Get-Content -LiteralPath $env:YOURSQL_UPDATE_TRANSACTION -Raw -Encoding UTF8 | ConvertFrom-Json
$work = Split-Path -Parent $env:YOURSQL_UPDATE_TRANSACTION
$newProcess = $null
$backedUp = $false
function Write-Result($value) { [IO.File]::WriteAllText($transaction.result, $value) }
function Move-App($source, $destination) {
    # 종료 직후 남은 파일 핸들이 해제될 시간을 교체와 복구 모두에 준다.
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { Move-Item -LiteralPath $source -Destination $destination; return }
        catch { if ($attempt -eq 19) { throw }; Start-Sleep -Milliseconds 500 }
    }
}
try {
    [IO.File]::WriteAllText((Join-Path $work 'armed'), 'armed')
    $oldProcess = Get-Process -Id $transaction.parent -ErrorAction SilentlyContinue
    if ($oldProcess -and -not $oldProcess.WaitForExit(120000)) { throw '앱 종료 대기 시간이 초과되었습니다.' }
    # 새 배포본의 기본 테마 대신 사용자가 편집하거나 삭제한 테마 상태를 보존한다.
    $oldTheme = Join-Path $transaction.target 'theme'
    $newTheme = Join-Path $transaction.candidate 'theme'
    if (Test-Path -LiteralPath $newTheme) { Remove-Item -LiteralPath $newTheme -Recurse -Force }
    if (Test-Path -LiteralPath $oldTheme) { Copy-Item -LiteralPath $oldTheme -Destination $newTheme -Recurse -Force }
    else { [IO.Directory]::CreateDirectory($newTheme) | Out-Null }
    Move-App $transaction.target $transaction.backup
    $backedUp = $true
    Move-App $transaction.candidate $transaction.target
    $env:YOURSQL_UPDATE_WORK = $work
    $newProcess = Start-Process -FilePath (Join-Path $transaction.target 'YourSQL.exe') -WorkingDirectory $transaction.target -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while (-not (Test-Path -LiteralPath $transaction.ready)) {
        if ($newProcess.HasExited -or [DateTime]::UtcNow -gt $deadline) { throw '새 앱 시작을 확인하지 못했습니다.' }
        Start-Sleep -Milliseconds 500
    }
    Write-Result 'success'
} catch {
    $_ | Out-String | Set-Content -LiteralPath (Join-Path $work 'error.txt') -Encoding UTF8
    try {
        if ($newProcess -and -not $newProcess.HasExited) { $newProcess.Kill(); $newProcess.WaitForExit() }
        if ($backedUp) {
            if (Test-Path -LiteralPath $transaction.target) { Move-App $transaction.target $transaction.failed }
            Move-App $transaction.backup $transaction.target
            Write-Result 'rollback'
            Remove-Item Env:YOURSQL_UPDATE_WORK -ErrorAction SilentlyContinue
            Start-Process -FilePath (Join-Path $transaction.target 'YourSQL.exe') -WorkingDirectory $transaction.target
        } else { Write-Result 'failed' }
    } catch { Write-Result 'failed' }
    exit 1
}
# 정상 실행이 확인된 뒤에만 백업과 다운로드를 삭제한다.
Set-Location -LiteralPath (Split-Path -Parent $work)
[Environment]::CurrentDirectory = (Split-Path -Parent $work)
Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
exit 0
