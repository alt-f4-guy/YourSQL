// 앱 창, 네이티브 파일 대화상자, 로컬 엔진의 생명주기를 연결한다.
const {app,BrowserWindow,ipcMain,dialog,Menu,session,shell,Notification,powerMonitor} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {Engine} = require('./lib/engine.cjs');
const {PracticeService} = require('./lib/service.cjs');
const {readThemes,deleteTheme,seedThemes} = require('./lib/themes.cjs');
const {themeDirectories} = require('./lib/platform.cjs');
const {Updater}=require('./lib/updates.cjs');
const {createReminderRuntime}=require('./lib/reminder-runtime.cjs');
const {assertAvailable}=require('./lib/storage.cjs');
const appName='YourSQL';
app.setName(appName);
app.setPath('userData',path.join(app.getPath('appData'),'YourSQL')); 
if (process.env.SQL_PRACTICE_DATA_DIR) app.setPath('userData',path.resolve(process.env.SQL_PRACTICE_DATA_DIR));
let window,engine,service,themeWatcher,themeTimer,closing=false,stopped=false;
let reminderMode=process.argv.includes('--reminder-check'),reminderRuntime,normalStarting,exitTimer,createWindow;
const hidden=process.env.YOURSQL_TEST_HIDDEN==='1';
if((reminderMode||hidden)&&process.platform==='darwin')app.setActivationPolicy('accessory');
async function openToday(){
  await startNormal();
  if(!hidden){window.show();window.focus();}
  window.webContents.send('practice:reminderOpen');
}
function startNormal(){
  const wasReminder=reminderMode;reminderMode=false;clearTimeout(exitTimer);
  if(!hidden&&process.platform==='darwin')app.setActivationPolicy('regular');
  if(!normalStarting){if(wasReminder)reminderRuntime.reminders.reload(true);normalStarting=createWindow().then(()=>{void reminderRuntime.monitor();});}
  return normalStarting;
}
const page = path.join(__dirname,'ui/index.html');
const pageURL = pathToFileURL(page).href;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',(_event,argv)=>{
    void app.whenReady().then(async()=>{
      if(argv.includes('--reminder-check')){await reminderRuntime.check();return;}
      await startNormal();
      if(!hidden){window?.show();window?.focus();}
    });
  });
  app.on('activate',()=>{if(reminderRuntime)void startNormal();});
  createWindow=async function(){
    const directory=app.getPath('userData');
    const packagedThemes=app.isPackaged?themeDirectories(process.execPath,directory):null;
    const themeDirectory=process.env.SQL_PRACTICE_DATA_DIR ? path.join(directory,'theme') :
      packagedThemes?.active || path.join(__dirname,'theme');
    if(app.isPackaged) seedThemes(themeDirectory,[packagedThemes.legacy,process.resourcesPath]);
    else fs.mkdirSync(themeDirectory,{recursive:true});
    engine=new Engine(path.join(directory,'engine'));
    let learning,storageFailure;
    const loadStores=()=>{
      storageFailure=null;
      try{
        service=new PracticeService(path.join(__dirname,'content'),directory,engine);
        learning=new (require('./lib/learning.cjs').Learning)(directory,undefined,service.store.logs());
      }catch(error){storageFailure={status:'blocked',issues:[{file:directory,code:error.code||'EREAD',message:error.message}]};}
    };
    const storageState=()=>{
      const stores=[storageFailure,service?.store.storage,learning?.storage,reminderRuntime.reminders.storage].filter(Boolean);
      return {status:stores.some(s=>s.status==='blocked')?'blocked':stores.some(s=>s.status==='recovered')?'recovered':'ok',
        issues:[...stores.flatMap(s=>s.issues),...(service?.store.logIssues||[])],directory};
    };
    loadStores();
    const updater=new Updater(app,value=>{
      if (window && !window.isDestroyed()) window.webContents.send('practice:updateChanged',value);
    },url=>shell.openExternal(url));
    const starting=storageState().status==='blocked'?Promise.resolve():engine.start().catch(()=>{});
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const handle=(name,callback)=>ipcMain.handle(`practice:${name}`,async(event,arg)=>{
      if (event.sender !== window?.webContents || event.senderFrame?.url !== pageURL) throw new Error('허용되지 않은 요청입니다.');
      const safe=['storageState','retryStorage','openStorageFolder','themes','updateState','checkUpdates','openUpdatePage','openMySQLPage','reminderState'];
      if(!safe.includes(name))assertAvailable(storageState());
      try{return await callback(arg);}catch(error){
        if(['EACCES','ENOSPC','EPERM','EIO','EROFS','EINVALID'].includes(error.code)){
          storageFailure={status:'blocked',issues:[{file:error.path||directory,code:error.code,message:error.message}]};
          window.webContents.send('practice:storageChanged',storageState());
        }
        throw error;
      }
    });
    handle('storageState',storageState);
    handle('openStorageFolder',async()=>{const error=await shell.openPath(directory);if(error)throw new Error(error);});
    handle('retryStorage',async()=>{
      if(service?.busy)throw new Error('현재 실행이 끝난 뒤 복구를 다시 시도해 주세요.');
      await reminderRuntime.reminders.exclusive(()=>reminderRuntime.reminders.reload(true));
      loadStores();
      if(storageState().status!=='blocked'&&!engine.ready)await engine.start().catch(()=>{});
      return storageState();
    });
    handle('bootstrap',()=>service.bootstrap());
    handle('updateState',()=>({...updater.state}));
    handle('checkUpdates',()=>updater.check());
    handle('openUpdatePage',()=>updater.open());
    // 화면에서 받은 주소를 열지 않고 공식 MySQL 서버 설치 페이지만 허용한다.
    handle('openMySQLPage',()=>shell.openExternal('https://dev.mysql.com/downloads/mysql/8.4.html'));
    handle('themes',deleted=>{
      // 이전 버전에서 숨긴 테마도 한 번만 실제 파일 삭제로 이관한다.
      if (Array.isArray(deleted) && deleted.length <= 1000 && deleted.every(id=>typeof id==='string')) {
        for (const theme of readThemes(themeDirectory).themes) {
          if (deleted.includes(theme.id) && readThemes(themeDirectory).themes.length > 1) deleteTheme(themeDirectory,theme.id);
        }
      }
      return readThemes(themeDirectory);
    });
    handle('deleteTheme',id=>deleteTheme(themeDirectory,id));
    handle('openThemeFolder',async()=>{
      const error=await shell.openPath(themeDirectory);
      if (error) throw new Error(error);
    });
    handle('saveDraft',value=>service.saveDraft(value));
    handle('run',value=>service.run(value));
    handle('submit',async value=>{const result=await service.submit(value);learning.queryResult(value.id,result,value.review);return result;});
    handle('learning',()=>learning.snapshot());
    handle('learningSettings',()=>learning.snapshot().settings);
    handle('reminderState',()=>reminderRuntime.reminders.state());
    handle('setReminderEnabled',value=>reminderRuntime.reminders.setEnabled(value));
    handle('testReminder',()=>reminderRuntime.check({test:true}));
    handle('setDailyGoal',value=>learning.setDailyGoal(value));
    handle('startExtra',()=>learning.startExtra());
    handle('blankAnswer',value=>learning.answer(value));
    handle('blankReveal',id=>learning.reveal(id));
    handle('learningAssist',id=>{service.entry(id);learning.assist(id);});
    handle('study',()=>service.store.study());
    handle('history',()=>service.store.logs());
    handle('solution',id=>{const p=service.entry(id).problem;return {sql:p.solution,explanation:p.explanation};});
    handle('retryEngine',()=>service.exclusive(async()=>{
      try {await engine.start();} catch {}
      return {ready:engine.ready,message:engine.message,missing:engine.missing};
    }));
    handle('exportLog',async id=>{
      const log=service.store.logs().find(item=>item.id===id);
      if (!log) throw new Error('오답 기록을 찾을 수 없습니다.');
      const result=await dialog.showSaveDialog(window,{title:'오답 기록 저장',defaultPath:`오답_${log.problemId}_${log.createdAt.slice(0,10)}.json`,filters:[{name:'JSON 기록',extensions:['json']}]});
      if (result.canceled) return {canceled:true};
      fs.writeFileSync(result.filePath,JSON.stringify(log,null,2),{mode:0o600});
      return {canceled:false,path:result.filePath};
    });
    handle('importPack',async()=>{
      const result=await dialog.showOpenDialog(window,{title:'문제 팩 추가',properties:['openFile'],filters:[{name:'SQL 연습장 문제 팩',extensions:['json']}]});
      if (result.canceled) return {canceled:true};
      return service.importPack(result.filePaths[0]);
    });
    ipcMain.on('practice:closeReady',event=>{
      if (event.sender === window?.webContents) {closing=true;window.close();}
    });
    window=new BrowserWindow({width:1440,height:940,minWidth:1100,minHeight:750,title:appName,backgroundColor:'#15141b',show:process.env.YOURSQL_TEST_HIDDEN!=='1',
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    themeWatcher=fs.watch(themeDirectory,()=>{
      clearTimeout(themeTimer);
      themeTimer=setTimeout(()=>{
        if (window && !window.isDestroyed()) window.webContents.send('practice:themesChanged');
      },150);
    });
    themeWatcher.on('error',()=>{
      if (window && !window.isDestroyed()) window.webContents.send('practice:themesChanged');
    });
    window.on('close',event=>{if (!closing) {event.preventDefault();window.webContents.send('practice:beforeClose');}});
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:appName,submenu:[{label:`${appName} 정보`,role:'about'},{type:'separator'},...(process.platform==='darwin'?[{label:'가리기',role:'hide'},{label:'다른 앱 가리기',role:'hideOthers'},{type:'separator'}]:[]),{label:'종료',role:'quit'}]},
      {label:'편집',submenu:[{label:'실행 취소',role:'undo'},{label:'다시 실행',role:'redo'},{type:'separator'},{label:'잘라내기',role:'cut'},{label:'복사',role:'copy'},{label:'붙여넣기',role:'paste'},{label:'모두 선택',role:'selectAll'}]},
      {label:'보기',submenu:[{label:'확대',role:'zoomIn'},{label:'축소',role:'zoomOut'},{label:'실제 크기',role:'resetZoom'},{label:'전체 화면',role:'togglefullscreen'}]}
    ]));
    await window.loadFile(page);
    void starting.then(()=>{if(window&&!window.isDestroyed())window.webContents.send('practice:engineChanged',{ready:engine.ready,message:engine.message,missing:engine.missing});});
  };
  app.whenReady().then(async()=>{
    reminderRuntime=createReminderRuntime({app,Notification,powerMonitor,shell,recover:!reminderMode,onOpen:()=>void openToday(),onChanged:value=>{if(window&&!window.isDestroyed())window.webContents.send('practice:reminderChanged',value);}});
    await reminderRuntime.start();
    if(reminderMode){
      const result=await reminderRuntime.check();
      if(reminderMode)exitTimer=setTimeout(()=>{if(reminderMode)app.quit();},result.requested?10000:0);
    }else await startNormal();
  }).catch(error=>{if(!reminderMode&&!hidden)dialog.showErrorBox('앱 시작 실패',error.message);else console.error(error);closing=true;app.quit();});
  app.on('window-all-closed',()=>{clearTimeout(themeTimer);themeWatcher?.close();app.quit();});
  app.on('before-quit',event=>{
    if (engine) {
      event.preventDefault();
      // 종료가 보류되면 감시와 엔진을 유지한다. 정리는 확정된 종료에만 실행한다.
      if (stopped) return;
      if (!closing && window && !window.isDestroyed()) {window.close();return;}
      stopped=true;
      clearTimeout(exitTimer);reminderRuntime?.dispose();
      engine.stop().finally(()=>app.exit(0));
    }else if(!stopped){
      stopped=true;clearTimeout(exitTimer);reminderRuntime?.dispose();
    }
  });
}
