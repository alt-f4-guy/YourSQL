// 화면에 필요한 기능만 노출하며 Electron 전체 API는 전달하지 않는다.
const {contextBridge,ipcRenderer} = require('electron');
const invoke = channel => argument => ipcRenderer.invoke(channel,argument);
contextBridge.exposeInMainWorld('practice',{
  updateState:invoke('practice:updateState'),saveUpdateRepository:invoke('practice:saveUpdateRepository'),checkUpdates:invoke('practice:checkUpdates'),installUpdate:invoke('practice:installUpdate'),
  onUpdateChanged:callback=>{ipcRenderer.on('practice:updateChanged',(_event,value)=>callback(value));},
  learning:invoke('practice:learning'),blankAnswer:invoke('practice:blankAnswer'),blankReveal:invoke('practice:blankReveal'),learningAssist:invoke('practice:learningAssist'),
  themes:invoke('practice:themes'),deleteTheme:invoke('practice:deleteTheme'),openThemeFolder:invoke('practice:openThemeFolder'),
  onEngineChanged:callback=>{ipcRenderer.on('practice:engineChanged',(_event,value)=>callback(value));},
  onThemesChanged:callback=>{ipcRenderer.on('practice:themesChanged',()=>callback());},
  study:invoke('practice:study'),
  bootstrap:invoke('practice:bootstrap'),saveDraft:invoke('practice:saveDraft'),
  run:invoke('practice:run'),submit:invoke('practice:submit'),history:invoke('practice:history'),
  exportLog:invoke('practice:exportLog'),importPack:invoke('practice:importPack'),
  solution:invoke('practice:solution'),retryEngine:invoke('practice:retryEngine'),
  onBeforeClose:callback=>{ipcRenderer.on('practice:beforeClose',()=>callback());},
  closeReady:()=>ipcRenderer.send('practice:closeReady')
});
