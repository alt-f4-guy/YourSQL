// 검증된 직전 기록만 백업한다. 복구 실패 시 기존 파일은 덮어쓰지 않는다.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const ids=v=>Array.isArray(v)&&v.every(id=>typeof id==='string'&&id.length>0);
function requireShape(ok){if(!ok)throw Object.assign(new Error('저장 기록의 필수 필드·날짜·배열 형식을 확인할 수 없습니다.'),{code:'EINVALID'});}
function validateLearning(v){
 requireShape(object(v)&&object(v.days)&&object(v.records));
 if(v.settings!==undefined)requireShape(object(v.settings));
 for(const [key,d] of Object.entries(v.days)){
  requireShape(date(key)&&object(d)&&(!d.date||date(d.date))&&(d.completedCycles===undefined||Array.isArray(d.completedCycles)));
  for(const c of [...(d.completedCycles||[]),d]){
   requireShape(object(c)&&ids(c.blanks)&&ids(c.done));
   requireShape(c.queries!==undefined?ids(c.queries)&&ids(c.queriesDone):typeof c.query==='string'&&typeof c.queryDone==='boolean');
   if(c.learnedBlanks!==undefined)requireShape(ids(c.learnedBlanks));
  }
 }
 for(const r of Object.values(v.records)){
  requireShape(object(r));
  if(r.passed!==undefined)requireShape(typeof r.passed==='boolean');
  for(const key of ['due','lastPassed','assistedOn'])if(r[key]!=null)requireShape(date(r[key]));
 }
 return v;
}
function validateProgress(v){
 requireShape(object(v));for(const r of Object.values(v)){
  requireShape(object(r));for(const key of ['sql','reviewSql'])if(r[key]!==undefined)requireShape(typeof r[key]==='string');
  if(r.studyDays!==undefined)requireShape(Array.isArray(r.studyDays)&&r.studyDays.every(date));
  if(r.reviewDue!=null)requireShape(date(r.reviewDue));
 }return v;
}
function validateLog(v){requireShape(object(v)&&typeof v.id==='string'&&typeof v.problemId==='string'&&typeof v.sql==='string'&&typeof v.status==='string'&&typeof v.createdAt==='string'&&!Number.isNaN(Date.parse(v.createdAt))&&object(v.result));return v;}
function validateReminders(v){
 requireShape(object(v)&&typeof v.enabled==='boolean');
 if(v.attemptedDates!==undefined)requireShape(Array.isArray(v.attemptedDates)&&v.attemptedDates.every(date));
 if(v.lastAttemptDate!=null)requireShape(date(v.lastAttemptDate));
 if(v.registrationError!==undefined)requireShape(typeof v.registrationError==='boolean');return v;
}
function checked(value,validate){if(validate&&validate(value)===false)requireShape(false);return value;}
function read(file,validate){
 const raw=fs.readFileSync(file,'utf8');let value;
 try{value=JSON.parse(raw);}catch(e){e.code='EINVALID';throw e;}
 try{checked(value,validate);}catch(e){e.code='EINVALID';throw e;}
 return {raw,value};
}
function syncDirectory(directory){
 if(process.platform==='win32')return;
 const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function writeSynced(file,raw){
 fs.writeFileSync(file,raw,{flag:'wx',mode:0o600});
 const fd=fs.openSync(file,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function readStore(file,{validate,defaultValue={},recover=true}={}){
 let primaryError;
 try{return {status:'ok',value:read(file,validate).value,issues:[]};}catch(e){primaryError=e;}
 const backup=file+'.bak';let previous,backupError;
 try{previous=read(backup,validate);}catch(e){backupError=e;}
 if(primaryError.code==='ENOENT'&&backupError?.code==='ENOENT')return {status:'new',value:JSON.parse(JSON.stringify(defaultValue)),issues:[]};
 const issue={file,code:primaryError.code||'EREAD',message:primaryError.message,backup:backupError?.code==='ENOENT'?null:backup,backupValid:Boolean(previous)};
 const blocked=()=>({status:'blocked',value:null,issues:[issue]});
 if(!recover||!previous||!['ENOENT','EINVALID'].includes(primaryError.code))return blocked();
 const temporary=`${file}.restore-${randomUUID()}`;
 try{
  if(primaryError.code!=='ENOENT'){
   const preserved=`${file}.corrupt-${Date.now()}-${randomUUID()}`;
   writeSynced(preserved,fs.readFileSync(file));issue.preserved=preserved;
   syncDirectory(path.dirname(file));
  }
  // 백업도 교체 직전에 재검증한다. 복원은 백업을 소비하지 않는다.
  previous=read(backup,validate);issue.backupAt=fs.statSync(backup).mtime.toISOString();
  writeSynced(temporary,previous.raw);fs.renameSync(temporary,file);syncDirectory(path.dirname(file));
  issue.recoveredAt=new Date().toISOString();
  return {status:'recovered',value:previous.value,issues:[issue]};
 }catch(e){issue.code=e.code||'ERESTORE';issue.message=e.message;return blocked();}
 finally{try{fs.unlinkSync(temporary);}catch{}}
}
function writeStore(file,value,{validate}={}){
 checked(value,validate);const raw=JSON.stringify(value,null,2);checked(JSON.parse(raw),validate);
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const temporary=`${file}.new-${randomUUID()}`,backupTemp=`${file}.backup-${randomUUID()}`;
 try{
  writeSynced(temporary,raw);
  let current;try{current=read(file,validate);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(current){writeSynced(backupTemp,current.raw);fs.renameSync(backupTemp,file+'.bak');syncDirectory(path.dirname(file));}
  fs.renameSync(temporary,file);syncDirectory(path.dirname(file));
 }finally{for(const f of [temporary,backupTemp])try{fs.unlinkSync(f);}catch{}}
}
function assertAvailable(state){if(state?.status==='blocked')throw new Error('기록 복구가 필요합니다. 기록 폴더를 확인한 뒤 복구를 다시 시도해 주세요.');}
module.exports={readStore,writeStore,assertAvailable,validateLearning,validateProgress,validateLog,validateReminders};
