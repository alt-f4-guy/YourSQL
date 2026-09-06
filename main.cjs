// 앱 창, 네이티브 파일 대화상자, 로컬 엔진의 생명주기를 연결한다.
const {app,BrowserWindow,ipcMain,dialog,Menu,session,shell} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {Engine} = require('./lib/engine.cjs');
const {PracticeService} = require('./lib/service.cjs');
const {readThemes,deleteTheme} = require('./lib/themes.cjs');
const {themeDirectory:packagedThemeDirectory} = require('./lib/platform.cjs');
const {Updater}=require('./lib/updates.cjs');
const appName='YourSQL';
app.setName(appName);
app.setPath('userData',path.join(app.getPath('appData'),'YourSQL')); 
if (process.env.SQL_PRACTICE_DATA_DIR) app.setPath('userData',path.resolve(process.env.SQL_PRACTICE_DATA_DIR));
let window,engine,service,themeWatcher,themeTimer,closing=false,stopped=false;
const page = path.join(__dirname,'ui/index.html');
const pageURL = pathToFileURL(page).href;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.whenReady().then(async()=>{
    const directory=app.getPath('userData');
    const themeDirectory=process.env.SQL_PRACTICE_DATA_DIR ? path.join(directory,'theme') :
      app.isPackaged ? packagedThemeDirectory(process.execPath) : path.join(__dirname,'theme');
    fs.mkdirSync(themeDirectory,{recursive:true});
    engine=new Engine(path.join(directory,'engine'));
    service=new PracticeService(path.join(__dirname,'content'),directory,engine);
    const learning=new (require('./lib/learning.cjs').Learning)(directory);
    const updater=new Updater(app,value=>{
      if (window && !window.isDestroyed()) window.webContents.send('practice:updateChanged',value);
    });
    const starting=engine.start().catch(()=>{});
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const handle=(name,callback)=>ipcMain.handle(`practice:${name}`,async(event,arg)=>{
      if (event.sender !== window?.webContents || event.senderFrame?.url !== pageURL) throw new Error('허용되지 않은 요청입니다.');
      return callback(arg);
    });
    handle('bootstrap',()=>service.bootstrap());
    handle('updateState',()=>({...updater.state}));
    handle('saveUpdateRepository',value=>updater.save(value));
    handle('checkUpdates',()=>updater.check());
    handle('installUpdate',()=>updater.install());
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
    handle('submit',async value=>{const result=await service.submit(value);learning.queryResult(value.id,result);return result;});
    handle('learning',()=>learning.snapshot());
    handle('startExtra',()=>learning.startExtra());
    handle('blankAnswer',value=>learning.answer(value));
    handle('blankReveal',id=>learning.reveal(id));
    handle('learningAssist',id=>{service.entry(id);learning.assist(id);});
    handle('study',()=>service.store.study());
    handle('history',()=>service.store.logs());
    handle('solution',id=>{const p=service.entry(id).problem;return {sql:p.solution,explanation:p.explanation};});
    handle('retryEngine',()=>service.exclusive(async()=>{
      try {await engine.start();} catch {}
      return {ready:engine.ready,message:engine.message};
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
    window=new BrowserWindow({width:1440,height:940,minWidth:1100,minHeight:750,title:appName,backgroundColor:'#15141b',
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
    updater.confirmLaunch();
    void starting.then(()=>{if(window&&!window.isDestroyed())window.webContents.send('practice:engineChanged',{ready:engine.ready,message:engine.message});});
  }).catch(error=>{dialog.showErrorBox('앱 시작 실패',error.message);closing=true;app.quit();});
  app.on('window-all-closed',()=>{clearTimeout(themeTimer);themeWatcher?.close();app.quit();});
  app.on('before-quit',event=>{
    if (!stopped && engine) {
      event.preventDefault();
      if (!closing && window && !window.isDestroyed()) {window.close();return;}
      stopped=true;
      engine.stop().finally(()=>app.quit());
    }
  });
}
