const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-reminder-ui-'));
const packaged=process.argv.includes('--packaged'),executable=process.platform==='darwin'?path.join(root,'dist/YourSQL-darwin-arm64/YourSQL.app/Contents/MacOS/YourSQL'):path.join(root,'dist/YourSQL-win32-x64/YourSQL.exe');
const env={...process.env,SQL_PRACTICE_DATA_DIR:directory,YOURSQL_TEST_HIDDEN:'1'};
fs.cpSync(path.join(root,'theme'),path.join(directory,'theme'),{recursive:true});
fs.writeFileSync(path.join(directory,'updates.json'),JSON.stringify({repository:''}));
(async()=>{let app;try{
 app=await electron.launch({...(packaged?{executablePath:executable,args:[]}:{args:[root]}),env,timeout:60000});const page=await app.firstWindow();
 await page.locator('#open-settings').click();
 await page.locator('#reminder-enabled').waitFor({timeout:5000});
 assert.equal(await page.locator('#reminder-enabled').isChecked(),false);
 assert.match(await page.locator('#reminder-status').textContent(),/꺼짐/);
 await page.screenshot({path:path.join(root,'artifacts/daily-reminder-settings-off.png')});
 await page.locator('#reminder-enabled').click();
 await page.waitForFunction(()=>document.getElementById('reminder-status').textContent.includes('등록 실패'));
 assert.equal(await page.locator('#reminder-enabled').isChecked(),false);
 assert.match(await page.locator('#reminder-status').textContent(),/테스트 데이터/);
 assert.equal(await page.locator('#retry-reminder').isVisible(),true);
 await page.screenshot({path:path.join(root,'artifacts/daily-reminder-settings.png')});
 if(process.argv.includes('--notify')){
   const result=await page.evaluate(()=>window.practice.testReminder());
   assert.equal(result.requested,true,result.lastError);
   assert.equal(result.deliveryConfirmed,false);
   console.log('배포 앱 테스트 알림: OS 요청 성공 (실제 배너·클릭 확인과 별개)');
 }
 await page.locator('[aria-label="설정 닫기"]').click();
 await page.waitForFunction(()=>!document.getElementById('start-daily').disabled);
 await page.locator('.learning-nav [data-mode="query"]').click();
 await page.locator('#catalog-rows button').first().click();
 await page.locator('#editor').fill('SELECT 987 AS reminder_draft');
 // 검사 요청은 현재 모드와 숨김 상태를 바꾸지 않는다.
 const before=await page.locator('body').getAttribute('data-mode');
 await app.evaluate(({app})=>app.emit('second-instance',{},['--reminder-check']));
 assert.equal(await page.locator('body').getAttribute('data-mode'),before);
 assert.equal(await page.locator('#editor').inputValue(),'SELECT 987 AS reminder_draft');
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
 // 클릭 전달은 기존 초안 저장 경로를 통해 오늘 화면으로 이동한다.
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('practice:reminderOpen'));
 await page.waitForFunction(()=>document.body.dataset.mode==='today');
 await page.locator('.learning-nav [data-mode="query"]').click();
 await page.locator('#catalog-rows button').first().click();
 assert.equal(await page.locator('#editor').inputValue(),'SELECT 987 AS reminder_draft');
 console.log('학습 알림 설정·등록 실패 표시·백그라운드 단일 인스턴스·클릭 화면 이동 PASS');
 }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
