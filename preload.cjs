// 화면에 필요한 기능만 노출하며 Electron 전체 API는 전달하지 않는다.
const {contextBridge,ipcRenderer} = require('electron');
const invoke = channel => argument => ipcRenderer.invoke(channel,argument);
contextBridge.exposeInMainWorld('practice',{
  reminderState:invoke('practice:reminderState'),setReminderEnabled:invoke('practice:setReminderEnabled'),testReminder:invoke('practice:testReminder'),
  onReminderChanged:callback=>{ipcRenderer.on('practice:reminderChanged',(_event,value)=>callback(value));},
  onReminderOpen:callback=>{ipcRenderer.on('practice:reminderOpen',()=>callback());},
  updateState:invoke('practice:updateState'),checkUpdates:invoke('practice:checkUpdates'),openUpdatePage:invoke('practice:openUpdatePage'),
  onUpdateChanged:callback=>{ipcRenderer.on('practice:updateChanged',(_event,value)=>callback(value));},
  learning:invoke('practice:learning'),learningSettings:invoke('practice:learningSettings'),setDailyGoal:invoke('practice:setDailyGoal'),startExtra:invoke('practice:startExtra'),blankAnswer:invoke('practice:blankAnswer'),blankReveal:invoke('practice:blankReveal'),learningAssist:invoke('practice:learningAssist'),
  themes:invoke('practice:themes'),deleteTheme:invoke('practice:deleteTheme'),openThemeFolder:invoke('practice:openThemeFolder'),
  onEngineChanged:callback=>{ipcRenderer.on('practice:engineChanged',(_event,value)=>callback(value));},
  onThemesChanged:callback=>{ipcRenderer.on('practice:themesChanged',()=>callback());},
  study:invoke('practice:study'),
  bootstrap:invoke('practice:bootstrap'),saveDraft:invoke('practice:saveDraft'),
  run:invoke('practice:run'),submit:invoke('practice:submit'),history:invoke('practice:history'),
  exportLog:invoke('practice:exportLog'),importPack:invoke('practice:importPack'),
  solution:invoke('practice:solution'),retryEngine:invoke('practice:retryEngine'),openMySQLPage:invoke('practice:openMySQLPage'),
  onBeforeClose:callback=>{ipcRenderer.on('practice:beforeClose',()=>callback());},
  closeReady:()=>ipcRenderer.send('practice:closeReady')
});
