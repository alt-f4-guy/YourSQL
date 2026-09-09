// 외부 GitHub 응답만 대체하고 실제 Electron IPC·시작 팝업을 검사한다.
const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const updateFixture=process.platform==='darwin'&&process.arch==='arm64'?{asset:'YourSQL-Mac-arm64.dmg',missing:'Mac 디스크 이미지'}:
  process.platform==='win32'&&process.arch==='x64'?{asset:'YourSQL-Setup-x64.exe',missing:'Windows 설치 파일'}:null;
if(!updateFixture) throw new Error(`지원하지 않는 업데이트 UI 검사 조합입니다: ${process.platform}/${process.arch}`);
const {asset:updateAsset,missing:missingAsset}=updateFixture;
const data=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yoursql-updates-ui-'));
fs.cpSync(path.join(root,'theme'),path.join(data,'theme'),{recursive:true});
async function main() {
  const app=await electron.launch({args:[root],env:{...process.env,SQL_PRACTICE_DATA_DIR:data,YOURSQL_TEST_UPDATE_ASSET:updateAsset}});
  try {
    await app.evaluate(()=>{global.fetch=async()=>({ok:true,json:async()=>({
      tag_name:'v0.0.9',draft:false,prerelease:false,
      assets:[{name:process.env.YOURSQL_TEST_UPDATE_ASSET}]
    })});});
    const page=await app.firstWindow(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.locator('#update-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#update-now').textContent(),'다운로드 페이지 열기');
    assert.equal(await page.locator('#update-now').isDisabled(),false);
    await page.locator('#update-later').click();
    await page.locator('#open-settings').click();
    assert.equal(await page.locator('#update-repository').count(),0);
    assert.equal(await page.locator('#open-update-page').textContent(),'다운로드 페이지 열기');
    await app.evaluate(()=>{global.fetch=async()=>({ok:true,json:async()=>({
      tag_name:'v0.0.9',draft:false,prerelease:false,assets:[]
    })});});
    await page.locator('#check-updates').click();
    await page.waitForFunction(message=>document.getElementById('update-status').textContent.includes(message),missingAsset);
    assert.equal(await page.locator('#open-update-page').isDisabled(),true);
    await app.evaluate(()=>{global.fetch=async()=>{throw new Error('offline');};});
    await page.locator('#check-updates').click();
    await page.waitForFunction(()=>document.getElementById('update-status').textContent.includes('인터넷'));
    assert.equal(await page.locator('#open-update-page').isVisible(),false);
    assert.equal(await page.locator('#update-dialog').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('업데이트 팝업·나중에·오프라인·공식 자산 유무 검사 통과');
  } finally {await app.close();fs.rmSync(data,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
