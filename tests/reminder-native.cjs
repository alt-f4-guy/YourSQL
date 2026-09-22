const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {promisify}=require('node:util'),exec=promisify(require('node:child_process').execFile);
const {_electron:electron}=require('@playwright/test');
const {createScheduler}=require('../lib/reminder-scheduler.cjs');
const root=path.resolve(__dirname,'..');
const executable=process.platform==='darwin'?path.join(root,'dist/YourSQL-darwin-arm64/YourSQL.app/Contents/MacOS/YourSQL'):path.join(root,'dist/YourSQL-win32-x64/YourSQL.exe');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-native-reminder-'));let app,scheduler;
 const env={...process.env,SQL_PRACTICE_DATA_DIR:directory,YOURSQL_TEST_HIDDEN:'1'};
 try{
   // 실제 배포 앱의 --reminder-check는 창·학습 배정·엔진 없이 종료한다.
   await exec(executable,['--reminder-check'],{env,timeout:30000});
   for(const file of ['learning.json','learning-v2.json','engine','updates.json'])assert.equal(fs.existsSync(path.join(directory,file)),false,file);
   console.log('배포 앱 알림 전용 실행: 학습 파일·MySQL 엔진 생성 없음 PASS');
   // 검사 중 일반 실행: 검사만 잠시 보류하고 실제 Electron 두 프로세스로 전달한다.
   fs.writeFileSync(path.join(directory,'updates.json'),JSON.stringify({repository:''}));
   app=await electron.launch({args:[path.join(__dirname,'fixtures/reminder-held.cjs'),'--reminder-check'],env,timeout:60000});
   assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),0);
   assert.equal(fs.existsSync(path.join(directory,'engine')),false);
   await exec(require('electron'),[root],{env,timeout:30000});
   const page=await app.firstWindow();await page.locator('#open-settings').waitFor();
   await app.evaluate(()=>{global.releaseReminderCheck=true;});
   assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
   assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
   await page.waitForFunction(()=>!document.getElementById('start-daily').disabled);
   await app.close();app=null;
   console.log('알림 검사 중 일반 앱 실행: 창 1개로 전환·숨김 유지 PASS');
   if(process.platform==='darwin'){
     const home=path.join(directory,'scheduler-home');
     scheduler=createScheduler({platform:'darwin',executable,packaged:true,testData:true,testId:`test-${process.pid}`,directory:path.join(directory,'scheduled-data'),home});
     await scheduler.register();
     const {stdout}=await exec('/bin/launchctl',['print',`gui/${process.getuid()}/${scheduler.label}`]);
     assert.match(stdout,/--reminder-check/);
     await scheduler.unregister();
     assert.equal(fs.existsSync(scheduler.file),false);
     // bootout 응답 이후에도 launchd 조회에는 종료 중인 작업이 잠시 남을 수 있다.
     let removed=false;
     for(let attempt=0;attempt<50;attempt++){
       try{await exec('/bin/launchctl',['print',`gui/${process.getuid()}/${scheduler.label}`]);}
       catch{removed=true;break;}
       await new Promise(resolve=>setTimeout(resolve,100));
     }
     assert.equal(removed,true,'전용 테스트 LaunchAgent가 해제되지 않았습니다.');
     scheduler=null;
     console.log('전용 테스트 LaunchAgent 등록·조회·해제 PASS');
   }
 }finally{if(app)await app.close();if(scheduler)await scheduler.unregister().catch(console.error);fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
