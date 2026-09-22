const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-storage-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return path.join(dir,'learning.json');}
const validate=v=>{if(!v||typeof v!=='object'||Array.isArray(v)||!v.days||!v.records)throw new Error('invalid shape');};
const good={days:{},records:{blank1:{passed:true}}};
function storage(){return require('../lib/storage.cjs');}
test('새 저장소와 정상 파일을 구분하고 직전 정상본을 백업한다',t=>{
 const file=fixture(t),{readStore,writeStore}=storage();assert.equal(readStore(file,{validate,defaultValue:good}).status,'new');
 writeStore(file,good,{validate});const next={days:{},records:{blank2:{passed:true}}};writeStore(file,next,{validate});
 assert.deepEqual(readStore(file,{validate}).value,next);assert.deepEqual(JSON.parse(fs.readFileSync(file+'.bak')),good);
 assert.throws(()=>writeStore(file,null,{validate}));assert.deepEqual(readStore(file,{validate}).value,next);
});
for(const raw of ['null','{}','{"days":'])test(`손상 ${raw} 복원은 원본을 보존하고 읽기 전용 검사는 변경하지 않는다`,t=>{
 const file=fixture(t),{readStore}=storage();fs.writeFileSync(file,raw);fs.writeFileSync(file+'.bak',JSON.stringify(good));
 assert.equal(readStore(file,{validate,recover:false}).status,'blocked');assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(),['learning.json','learning.json.bak']);
 const r=readStore(file,{validate});assert.equal(r.status,'recovered');assert.deepEqual(r.value,good);
 const preserved=fs.readdirSync(path.dirname(file)).find(n=>n.includes('.corrupt-'));assert.ok(preserved);assert.equal(fs.readFileSync(path.join(path.dirname(file),preserved),'utf8'),raw);
 assert.ok(r.issues[0].recoveredAt);assert.ok(r.issues[0].backupAt);
});
test('백업도 손상되었으면 차단하고 기존 바이트를 보존한다',t=>{
 const file=fixture(t),{readStore,writeStore}=storage();fs.writeFileSync(file,'{');fs.writeFileSync(file+'.bak','null');
 assert.equal(readStore(file,{validate}).status,'blocked');assert.throws(()=>writeStore(file,good,{validate}));
 assert.equal(fs.readFileSync(file,'utf8'),'{');assert.equal(fs.readFileSync(file+'.bak','utf8'),'null');
});
function withFault(method,when){const file=path.join(__dirname,'../lib/storage.cjs'),module={exports:{}};const actual=require('node:module').createRequire(file);const fake=Object.create(fs);fake[method]=(...args)=>{when(...args);return fs[method](...args);};vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:n=>n==='node:fs'?fake:actual(n),module,Buffer,process});return module.exports;}
for(const code of ['EACCES','ENOSPC','EPERM'])test(`${code}: 복구 원본 보존 실패 시 복원 중단`,t=>{
 const file=fixture(t);storage();fs.writeFileSync(file,'{');fs.writeFileSync(file+'.bak',JSON.stringify(good));
 const s=withFault('openSync',(target,flags)=>{if(String(target).includes('.corrupt-'))throw Object.assign(new Error(code),{code});});
 assert.equal(s.readStore(file,{validate}).status,'blocked');assert.equal(fs.readFileSync(file,'utf8'),'{');assert.deepEqual(JSON.parse(fs.readFileSync(file+'.bak')),good);
});
test('읽기 권한 오류는 JSON 손상과 구분하고 복원하지 않는다',t=>{
 const file=fixture(t);storage();fs.writeFileSync(file,JSON.stringify(good));fs.writeFileSync(file+'.bak',JSON.stringify(good));
 const s=withFault('readFileSync',target=>{if(target===file)throw Object.assign(new Error('denied'),{code:'EACCES'});});const r=s.readStore(file,{validate});
 assert.equal(r.status,'blocked');assert.equal(r.issues[0].code,'EACCES');assert.equal(fs.readdirSync(path.dirname(file)).length,2);
});
for(const phase of ['new-write','backup-write','backup-rename','primary-rename'])test(`저장 ${phase} 실패에도 정상본이 남고 임시 파일만 정리한다`,t=>{
 const file=fixture(t),{writeStore}=storage();writeStore(file,good,{validate});writeStore(file,{...good,extra:'old'},{validate});
 const s=withFault(phase.endsWith('rename')?'renameSync':'writeFileSync',(a,b)=>{
   const target=String(phase.endsWith('rename')?b:a);
   if((phase==='new-write'&&target.includes('.new-'))||(phase==='backup-write'&&target.includes('.backup-'))||(phase==='backup-rename'&&target===file+'.bak')||(phase==='primary-rename'&&target===file))throw Object.assign(new Error('locked/full'),{code:'ENOSPC'});
 });
 assert.throws(()=>s.writeStore(file,{...good,extra:'new'},{validate}));assert.equal(JSON.parse(fs.readFileSync(file)).extra,'old');validate(JSON.parse(fs.readFileSync(file+'.bak')));
 assert.equal(fs.readdirSync(path.dirname(file)).some(n=>n.includes('.new-')||n.includes('.backup-')),false);
});
test('잘못된 학습 구조는 차단하고 오답 한 파일은 정상 오답 읽기를 막지 않는다',t=>{
 const file=fixture(t),{Learning}=require('../lib/learning.cjs'),{PracticeStore}=require('../lib/core.cjs');
 fs.writeFileSync(file,JSON.stringify({days:{'2026-02-30':{blanks:[],done:[]}},records:{}}));
 const learning=new Learning(path.dirname(file));assert.equal(learning.storage.status,'blocked');assert.throws(()=>learning.snapshot(),/복구/);assert.throws(()=>learning.answer({id:'blank1',answer:'SELECT'}),/복구/);
 const store=new PracticeStore(path.dirname(file));store.record({id:'level1_01',title:'test',level:1},'SELECT',{status:'wrong'});fs.writeFileSync(path.join(store.logDirectory,'bad.json'),'null');
 assert.equal(store.logs().length,1);assert.equal(store.logIssues.length,1);
});
for(const invalidDate of [undefined,'',null,'2026-09-21'])test(`학습 날짜 ${String(invalidDate)} 누락·불일치는 백업 복원 대상으로 검증한다`,t=>{
 const file=fixture(t),{readStore,validateLearning}=storage();
 const valid={days:{'2026-09-22':{date:'2026-09-22',blanks:[],done:[],queries:[],queriesDone:[]}},records:{}};
 const bad=JSON.parse(JSON.stringify(valid));bad.days['2026-09-22'].date=invalidDate;
 fs.writeFileSync(file,JSON.stringify(bad));fs.writeFileSync(file+'.bak',JSON.stringify(valid));
 const result=readStore(file,{validate:validateLearning});assert.equal(result.status,'recovered');assert.equal(result.value.days['2026-09-22'].date,'2026-09-22');
 assert.deepEqual(JSON.parse(fs.readFileSync(file+'.bak')),valid);
});
