// 외부 GitHub 응답만 대체하고 실제 Electron 설정·IPC·시작 팝업을 검사한다.
const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const data=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yoursql-updates-ui-'));
fs.cpSync(path.join(root,'theme'),path.join(data,'theme'),{recursive:true});
fs.writeFileSync(path.join(data,'updates.json'),JSON.stringify({repository:''}));
async function main() {
  const app=await electron.launch({args:[root],env:{...process.env,SQL_PRACTICE_DATA_DIR:data}});
  try {
    const page=await app.firstWindow(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await app.evaluate(()=>{global.fetch=async()=>({ok:true,json:async()=>({tag_name:'v0.0.2',assets:[]})});});
    await page.locator('#open-settings').click();
    await page.locator('#update-repository').fill('https://evil.test/a/b');
    await page.locator('#save-update-repository').click();
    await page.waitForFunction(()=>document.getElementById('update-status').textContent.includes('형식'));
    await page.locator('#update-repository').fill('https://github.com/me/YourSQL');
    await page.locator('#save-update-repository').click();
    await page.waitForFunction(()=>document.getElementById('update-version').textContent.includes('최신 0.0.2'));
    assert.equal(JSON.parse(fs.readFileSync(path.join(data,'updates.json'),'utf8')).repository,'me/YourSQL');
    assert.equal(await page.locator('#update-dialog').isVisible(),false);
    await page.reload();
    await page.locator('#update-dialog').waitFor({state:'visible'});
    assert.equal(await page.locator('#update-dialog-title').textContent(),'업데이트가 있습니다');
    assert.equal(await page.locator('#update-now').isDisabled(),true);
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts','update-startup.png')});
    await page.locator('#update-later').click();
    await page.locator('#open-settings').click();
    await page.screenshot({path:path.join(root,'artifacts','update-settings.png')});
    await app.evaluate(()=>{global.fetch=async()=>{throw new Error('offline');};});
    await page.locator('#check-updates').click();
    await page.waitForFunction(()=>document.getElementById('update-status').textContent.includes('인터넷'));
    assert.equal(await page.locator('#install-update').isVisible(),false);
    await page.reload();
    await page.waitForFunction(()=>document.getElementById('update-status').textContent.includes('인터넷'));
    assert.equal(await page.locator('#update-dialog').isVisible(),false);
    await page.locator('#open-settings').click();
    await page.locator('#update-repository').fill('');
    await page.locator('#save-update-repository').click();
    await page.waitForFunction(()=>document.getElementById('update-status').textContent.includes('해제'));
    await page.reload();
    assert.equal(await page.locator('#update-repository').inputValue(),'');
    assert.deepEqual(errors,[]);
    console.log('업데이트 설정 저장·시작 팝업·나중에·오프라인·자동 확인 해제 검사 통과');
  } finally {await app.close();fs.rmSync(data,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
