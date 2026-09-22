// 학습 기록을 변경하지 않고 단일 인스턴스의 모든 알림 요청을 직렬화한다.
const fs=require('node:fs'),path=require('node:path');
const {readStore,writeStore,assertAvailable,validateLearning,validateReminders}=require('./storage.cjs');
const {learningGoal}=require('./learning.cjs');
const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function readLearning(directory){
  const current=path.join(directory,'learning.json');
  const file=fs.existsSync(current)||fs.existsSync(current+'.bak')?current:path.join(directory,'learning-v2.json');
  const result=readStore(file,{validate:validateLearning,defaultValue:{days:{},records:{}},recover:false});
  assertAvailable(result);return result.value;
}
class Reminders{
  constructor({directory,scheduler,notify,clock=()=>new Date(),recover=true}){
    this.directory=directory;this.file=path.join(directory,'reminders.json');this.scheduler=scheduler;this.notify=notify;this.clock=clock;this.queue=Promise.resolve();
    this.reload(recover);
  }
  reload(recover=true){
    const defaults={enabled:false,lastAttemptDate:null,attemptedDates:[],lastError:null,registrationError:false,registeredPath:null};
    this.storage=readStore(this.file,{validate:validateReminders,defaultValue:defaults,recover});
    this.loadError=null;this.data={...defaults,...this.storage.value};
    if(this.storage.status==='blocked'){this.loadError=new Error('알림 설정 복구가 필요합니다.');this.data.lastError=this.loadError.message;}
    if(this.storage.status==='recovered'){
      this.data.enabled=false;const date=localDate(this.clock());
      this.data.lastAttemptDate=date;this.data.attemptedDates=[...new Set([...this.data.attemptedDates,date])];
      this.data.lastError='알림 설정을 복원하여 알림을 껐습니다. 설정에서 다시 켜 주세요. 복구 당일 자동 알림은 보류합니다.';
      try{this.save();}catch(error){this.storage={...this.storage,status:'blocked'};this.loadError=error;this.data.lastError=error.message;}
    }
    return this.state();
  }
  state(){return {...this.data,status:this.data.registrationError?'registration-error':!this.data.enabled?'off':'permission-required'};}
  save(){assertAvailable(this.storage);writeStore(this.file,this.data,{validate:validateReminders});this.loadError=null;}
  exclusive(fn){const result=this.queue.then(fn);this.queue=result.catch(()=>{});return result;}
  setEnabled(enabled){return this.exclusive(async()=>{
    assertAvailable(this.storage);
    if(typeof enabled!=='boolean')throw new Error('알림 설정을 확인하세요.');
    const previous={...this.data};
    if(!enabled){this.data.enabled=false;this.save();}
    try{
      if(enabled)await this.scheduler.register();else await this.scheduler.unregister();
      Object.assign(this.data,{enabled,registeredPath:enabled?this.scheduler.identity:null,lastError:null,registrationError:false});
    }catch(error){this.data.lastError=error.message;this.data.registrationError=true;}
    try{this.save();}catch(error){
      if(enabled){this.data=previous;if(!previous.enabled)await this.scheduler.unregister().catch(()=>{});}
      throw error;
    }
    return this.state();
  });}
  reconcile(){return this.exclusive(async()=>{
    if(!this.data.enabled||this.loadError)return this.state();
    try{await this.scheduler.register();Object.assign(this.data,{registeredPath:this.scheduler.identity,registrationError:false,lastError:null});}
    catch(error){this.data.lastError=error.message;this.data.registrationError=true;}
    this.save();return this.state();
  });}
  check({test=false}={}){return this.exclusive(async()=>{
    if(this.loadError)return {reason:'invalid-settings',...this.state()};
    const now=this.clock(),date=localDate(now);
    if(!test){
      if(!this.data.enabled)return {reason:'disabled'};
      if(now.getHours()<20||now.getHours()>=22)return {reason:'outside-window'};
      if(this.data.lastAttemptDate===date||this.data.attemptedDates.includes(date))return {reason:'already-attempted'};
    }
    try{
      const goal=learningGoal(readLearning(this.directory),date);
      if(!test&&(goal.goalComplete||goal.courseComplete))return {reason:goal.goalComplete?'goal-complete':'course-complete'};
      // 요청 전에 날짜를 영속화한다. 요청 도중 종료되더라도 같은 날 재요청하지 않는다.
      if(!test){this.data.lastAttemptDate=date;this.data.attemptedDates=[...this.data.attemptedDates,date];this.save();}
      const result=await this.notify({title:test?'YourSQL 테스트 알림':'오늘 목표가 아직 남아 있어요',body:test?'오후 8시 학습 알림도 이렇게 알려드려요.':`목표 ${goal.goalCycles}사이클 중 ${goal.completedCycleCount}사이클을 완료했어요. 남은 학습을 이어가 볼까요?`});
      this.data.lastError=null;this.data.lastRequestAt=now.toISOString();this.save();return {...result,...this.state()};
    }catch(error){this.data.lastError=error.message;this.save();return {reason:'error',...this.state()};}
  });}
}
module.exports={Reminders,readLearning,localDate};
