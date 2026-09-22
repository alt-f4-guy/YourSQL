const {Reminders}=require('./reminders.cjs');
const {createScheduler,APP_ID,TOAST_CLSID}=require('./reminder-scheduler.cjs');
function createReminderRuntime({app,Notification,powerMonitor,shell,onOpen,onChanged=()=>{}}){
  const notifications=new Set();
  if(process.platform==='win32'){app.setAppUserModelId(APP_ID);app.setToastActivatorCLSID(TOAST_CLSID);Notification.handleActivation(()=>onOpen());}
  const scheduler=createScheduler({executable:process.execPath,packaged:app.isPackaged,testData:Boolean(process.env.SQL_PRACTICE_DATA_DIR),shell});
  const notify=options=>new Promise((resolve,reject)=>{
    if(!Notification.isSupported()){reject(new Error('시스템 알림을 사용할 수 없습니다. 알림 설정을 확인해 주세요.'));return;}
    const notification=new Notification({...options,groupId:'yoursql-daily-goal'});notifications.add(notification);
    let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(null,{requested:true,deliveryConfirmed:false}),5000);
    notification.once('show',()=>finish(null,{requested:true,deliveryConfirmed:false}));
    notification.once('failed',(_event,error)=>finish(new Error(error||'알림 요청에 실패했습니다. 시스템 알림 설정을 확인해 주세요.')));
    // Windows는 중앙 활성화 콜백으로 종료 후 알림까지 처리한다.
    if(process.platform!=='win32')notification.on('click',()=>onOpen());
    notification.once('close',()=>notifications.delete(notification));
    try{notification.show();}catch(error){finish(error);notifications.delete(notification);}
  });
  const reminders=new Reminders({directory:app.getPath('userData'),scheduler,notify});
  const check=async options=>{try{const result=await reminders.check(options);onChanged(reminders.state());return result;}catch(error){onChanged({...reminders.state(),lastError:error.message});return {reason:'error',lastError:error.message};}};
  let timer;
  const resume=()=>void check();
  return {reminders,check,
    async start(){
      if(process.platform==='darwin'&&app.isPackaged){
        try{for(const n of await Notification.getHistory()){if(n.groupId==='yoursql-daily-goal'){notifications.add(n);n.on('click',()=>onOpen());}}}catch{}
      }
    },
    async monitor(){await reminders.reconcile();await check();if(!timer){timer=setInterval(resume,30000);powerMonitor.on('resume',resume);}},
    dispose(){clearInterval(timer);powerMonitor.removeListener('resume',resume);}
  };
}
module.exports={createReminderRuntime};
