const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('Mac 작업은 현지 20시·로그인 검사와 escape된 실제 실행 경로를 사용한다',()=>{const {launchAgentXML}=require('../lib/reminder-scheduler.cjs');const xml=launchAgentXML({executable:'/A & B/YourSQL.app/Contents/MacOS/YourSQL',label:'local.yoursql.practice.reminder'});assert.match(xml,/<integer>20<\/integer>/);assert.match(xml,/<key>RunAtLoad<\/key><true\/>/);assert.match(xml,/A &amp; B/);assert.match(xml,/--reminder-check/);assert.doesNotMatch(xml,/KeepAlive/);});
test('Windows 작업은 로그인 사용자·현지 20시·놓친 실행을 쓰며 컴퓨터를 깨우지 않는다',()=>{const {windowsTaskXML}=require('../lib/reminder-scheduler.cjs');const xml=windowsTaskXML({executable:'C:\\A & B\\YourSQL.exe',sid:'S-1-5-21-123'});assert.match(xml,/20:00:00/);assert.match(xml,/<LogonType>InteractiveToken/);assert.match(xml,/<StartWhenAvailable>true/);assert.match(xml,/<WakeToRun>false/);assert.match(xml,/<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);assert.match(xml,/<LogonTrigger>/);assert.match(xml,/A &amp; B/);assert.doesNotMatch(xml,/HighestAvailable/);});
test('임시 사용자 데이터는 실제 예약 등록과 해제를 차단한다',async()=>{const {createScheduler}=require('../lib/reminder-scheduler.cjs');let called=false;const s=createScheduler({platform:'darwin',executable:'/test',packaged:true,testData:true,run:async()=>{called=true;}});await assert.rejects(s.register(),/테스트/);await assert.rejects(s.unregister(),/테스트/);assert.equal(called,false);});
test('Mac 등록 실패는 이전 plist를 복원한다',async t=>{const {createScheduler}=require('../lib/reminder-scheduler.cjs');const home=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-scheduler-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const folder=path.join(home,'Library/LaunchAgents');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'local.yoursql.practice.reminder.plist');fs.writeFileSync(file,'previous');const s=createScheduler({platform:'darwin',executable:'/new/app',packaged:true,home,run:async(_exe,args)=>{if(args[0]==='bootstrap')throw new Error('denied');}});await assert.rejects(s.register(),/denied/);assert.equal(fs.readFileSync(file,'utf8'),'previous');});
test('Windows 제거는 x64 알림 등록과 Electron 자동 바로가기를 정리한다',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../installer/YourSQL.nsi'),'utf8').split('Section "Uninstall"')[1];
 assert.match(source,/SetRegView 64[\s\S]*DeleteRegKey HKCU "Software\\Classes\\CLSID\\\{C00C9F0B-5698-4B7D-9845-487475797391\}"[\s\S]*SetRegView 32/);
 assert.ok(source.includes('Delete "$SMPROGRAMS\\YourSQL.lnk"'));
});
test('중복 monitor·dispose와 실행 중 dispose는 타이머와 resume 리스너를 남기지 않는다',async()=>{
 const vm=require('node:vm'),{EventEmitter}=require('node:events'),file=path.join(__dirname,'../lib/reminder-runtime.cjs'),module={exports:{}};
 const actual=require('node:module').createRequire(file),powerMonitor=new EventEmitter(),timers=new Set();let reconcile=async()=>{},checks=0;
 class Reminders{async reconcile(){await reconcile();}async check(){checks++;return {};}state(){return {};}}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,process:{platform:'darwin',env:{}},require:n=>n==='./reminders.cjs'?{Reminders}:n==='./reminder-scheduler.cjs'?{createScheduler:()=>({})}:actual(n),setInterval:fn=>{timers.add(fn);return fn;},clearInterval:id=>timers.delete(id),setTimeout,clearTimeout});
 const r=module.exports.createReminderRuntime({app:{getPath:()=>'/tmp'},Notification:{},powerMonitor});
 await Promise.all([r.monitor(),r.monitor()]);assert.equal(timers.size,1);assert.equal(powerMonitor.listenerCount('resume'),1);
 powerMonitor.emit('resume');await Promise.resolve();assert.ok(checks>=2);
 r.dispose();r.dispose();assert.equal(timers.size,0);assert.equal(powerMonitor.listenerCount('resume'),0);
 await r.monitor();assert.equal(timers.size,1);r.dispose();
 let release;reconcile=()=>new Promise(resolve=>release=resolve);const pending=r.monitor();r.dispose();release();await pending;
 assert.equal(timers.size,0);assert.equal(powerMonitor.listenerCount('resume'),0);
});
