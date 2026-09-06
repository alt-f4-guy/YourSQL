// 실제 배포 앱의 복사본을 업데이트한다. 원래 앱과 개인 기록은 사용하지 않는다.
const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const temporary=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yoursql-update-packaged-'));
async function main() {
  const platform=process.platform,arch=process.arch;
  const source=path.join(root,'dist',`YourSQL-${platform}-${arch}`);
  const installed=path.join(temporary,'installed');
  fs.cpSync(source,installed,{recursive:true,verbatimSymlinks:true});
  const executable=platform==='darwin'?path.join(installed,'YourSQL.app','Contents','MacOS','YourSQL'):path.join(installed,'YourSQL.exe');
  const zip=path.join(root,'dist',platform==='darwin'?'YourSQL-Mac-arm64.zip':'YourSQL-Windows-x64.zip');
  const bytes=fs.readFileSync(zip),version=require('../package.json').version;
  const data=path.join(temporary,'data');fs.mkdirSync(data);
  const marker=path.join(data,'my-study-record.txt');fs.writeFileSync(marker,'개인 기록 유지');
  fs.writeFileSync(path.join(installed,'theme','custom-marker.txt'),'내 테마 유지');
  const app=await electron.launch({executablePath:executable,args:[],env:{...process.env,SQL_PRACTICE_DATA_DIR:data}});
  let relaunchedPid;
  try {
    const page=await app.firstWindow();
    // 배포된 앱을 그대로 검증하되, 현재 버전과 GitHub 통신만 고정한다.
    await app.evaluate(({app},fixture)=>{
      const fs=process.getBuiltinModule('node:fs');
      app.getVersion=()=> '0.0.0';
      global.fetch=async url=>url.includes('api.github.com')?new Response(JSON.stringify({tag_name:`v${fixture.version}`,assets:[{name:fixture.name,size:fixture.size,digest:fixture.digest,browser_download_url:`https://github.com/me/YourSQL/releases/download/v${fixture.version}/${fixture.name}`}]})):new Response(fs.readFileSync(fixture.zip));
    },{zip,version,name:path.basename(zip),size:bytes.length,digest:`sha256:${createHash('sha256').update(bytes).digest('hex')}`});
    await page.locator('#open-settings').click();
    await page.locator('#update-repository').fill('me/YourSQL');
    await page.locator('#save-update-repository').click();
    await page.waitForFunction(()=>!document.getElementById('install-update').disabled);
    const appClosed=app.waitForEvent('close');
    await page.locator('#install-update').click();
    const outcome=path.join(data,'update-result.txt');
    let done=false;
    for(let attempt=0;attempt<180;attempt++) {
      if(fs.existsSync(outcome)) {done=true;break;}
      if(!page.isClosed()) {
        const status=await page.locator('#update-status').textContent().catch(()=> '');
        if(status.includes('실패')) throw new Error(status);
      }
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!done) {
      console.error('업데이트 작업 폴더:',temporary);
      throw new Error('실제 업데이트 완료 대기 시간 초과');
    }
    assert.equal(fs.readFileSync(outcome,'utf8').trim(),'success');
    await appClosed;
    assert.equal(fs.readFileSync(marker,'utf8'),'개인 기록 유지');
    assert.equal(fs.readFileSync(path.join(installed,'theme','custom-marker.txt'),'utf8'),'내 테마 유지');
    console.log('실제 배포 ZIP 다운로드·검증·압축 해제·앱 교체·재시작·기록 보존 검사 통과');
  } finally {
    await app.close().catch(()=>{});
    // 재실행된 테스트 앱은 정확한 임시 실행 경로로만 식별해 종료한다.
    const {execFileSync}=require('node:child_process');
    if(process.platform==='darwin') {
      const lines=execFileSync('/bin/ps',['-axo','pid=,command='],{encoding:'utf8'}).split('\n');
      for(const line of lines) {
        const match=line.trim().match(/^(\d+)\s+(.+)$/);
        if(match && (match[2]===fs.realpathSync(executable) || match[2].includes(`--datadir=${path.join(data,'engine','mysql-data')} `))) {relaunchedPid=Number(match[1]);process.kill(relaunchedPid,'SIGTERM');}
      }
    }
    else {
      const code = '$expected = $env:YOURSQL_TEST_EXECUTABLE; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $expected } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';
      execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{env:{...process.env,YOURSQL_TEST_EXECUTABLE:executable}});
    }
    // 실패 자료는 원인 확인을 위해 임시 디렉토리에 남긴다.
    console.log('검사 자료:',temporary);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
