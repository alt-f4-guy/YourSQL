const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {learningGoal}=require('../lib/learning.cjs');
const date='2026-09-22';
const cycle=(complete=true)=>({blanks:['a','b','c','d','e','f'],done:['a','b','c','d','e','f'],queries:['q1','q2'],queriesDone:complete?['q1','q2']:['q1']});
test('공통 판정은 사이클만 세고 목표 변경·추가 학습·미접속을 구분한다',()=>{
 assert.equal(typeof learningGoal,'function');
 for(const [goal,count,expected] of [[3,0,false],[3,2,false],[3,3,true],[3,4,true],[2,2,true]]){
 const data={settings:{dailyCycles:goal},records:{},days:{[date]:{...cycle(false),goalCycles:goal,completedCycles:Array.from({length:count},()=>cycle())}}};
 const before=JSON.stringify(data),result=learningGoal(data,date);assert.equal(result.completedCycleCount,count);assert.equal(result.goalComplete,expected);assert.equal(JSON.stringify(data),before);
 }
 assert.equal(learningGoal({days:{},records:{},settings:{dailyCycles:3}},date).goalCycles,3);
 assert.equal(learningGoal({days:{},records:{}},date).goalCycles,1);
});
test('과정 끝의 미완료 쿼리는 계속 대상이며 완료 이후에만 생략한다',()=>{
 assert.equal(typeof learningGoal,'function');
 const records=Object.fromEntries(require('../content/lessons.cjs').flatMap(u=>u.cards).map(c=>[c.id,{passed:true}]));
 const data={records,days:{[date]:{...cycle(false),goalCycles:3}}};
 assert.equal(learningGoal(data,date).courseComplete,false);data.days[date]=cycle();assert.equal(learningGoal(data,date).courseComplete,false);
 for(const u of require('../content/lessons.cjs'))for(const id of u.queries)records[id]={passed:true};
 assert.equal(learningGoal(data,date).courseComplete,true);delete data.days[date];assert.equal(learningGoal(data,date).courseComplete,true);
});
test('마지막 쿼리를 남기고 날짜가 바뀌어도 전체 완료가 아니다',()=>{
 const units=require('../content/lessons.cjs'),data={days:{},records:{}};
 for(const unit of units){for(const card of unit.cards)data.records[card.id]={passed:true};if(unit!==units.at(-1))for(const id of unit.queries)data.records[id]={passed:true};}
 assert.equal(learningGoal(data,'2026-09-23').courseComplete,false);
 data.days['2026-09-23']={blanks:[],done:[],queries:[],queriesDone:[],courseComplete:true};
 assert.equal(learningGoal(data,'2026-09-23').courseComplete,false);
});
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-reminders-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const {Reminders}=require('../lib/reminders.cjs');let now=new Date(2026,8,22,20),calls=0;const scheduler={identity:'test-path',register:async()=>{},unregister:async()=>{}};const r=new Reminders({directory,scheduler,clock:()=>now,notify:async()=>{calls++;return {requested:true};}});return {r,scheduler,directory,calls:()=>calls,time:d=>now=d};}
test('꺼짐·시간 경계·중복·테스트 알림·다음날 재평가',async t=>{const f=fixture(t);await f.r.check();assert.equal(f.calls(),0);await f.r.setEnabled(true);f.time(new Date(2026,8,22,19,59));await f.r.check();assert.equal(f.calls(),0);f.time(new Date(2026,8,22,20));await Promise.all([f.r.check(),f.r.check()]);assert.equal(f.calls(),1);await f.r.check({test:true});assert.equal(f.calls(),2);f.time(new Date(2026,8,23,22));await f.r.check();assert.equal(f.calls(),2);f.time(new Date(2026,8,24,21,59));await f.r.check();assert.equal(f.calls(),3);assert.equal(fs.existsSync(path.join(f.directory,'learning.json')),false);});
test('기존 파일은 읽기만 하며 손상된 최신 파일은 이전 파일로 우회하지 않는다',async t=>{const f=fixture(t);await f.r.setEnabled(true);const old=path.join(f.directory,'learning-v2.json');const raw=JSON.stringify({days:{},records:{},settings:{dailyCycles:4}});fs.writeFileSync(old,raw);await f.r.check({test:true});assert.equal(fs.readFileSync(old,'utf8'),raw);assert.equal(fs.existsSync(path.join(f.directory,'learning.json')),false);fs.writeFileSync(path.join(f.directory,'learning.json'),'{');await f.r.check();assert.equal(f.calls(),1);assert.ok(f.r.state().lastError);assert.equal(f.r.state().lastAttemptDate,null);});
test('등록 실패는 설정을 보존하고 해제 실패도 꺼짐을 먼저 저장한다',async t=>{const f=fixture(t);f.scheduler.register=async()=>{throw new Error('등록 실패');};await f.r.setEnabled(true);assert.equal(f.r.state().enabled,false);assert.equal(f.r.state().status,'registration-error');f.scheduler.register=async()=>{};await f.r.setEnabled(true);f.scheduler.unregister=async()=>{throw new Error('해제 실패');};await f.r.setEnabled(false);assert.equal(f.r.state().enabled,false);await f.r.check();assert.equal(f.calls(),0);});
test('알림 요청 실패도 당일 재시도하지 않고 재시작에 보존한다',async t=>{const f=fixture(t);await f.r.setEnabled(true);f.r.notify=async()=>{throw new Error('차단됨');};await f.r.check();assert.equal(f.r.state().lastAttemptDate,date);assert.match(f.r.state().lastError,/차단됨/);const {Reminders}=require('../lib/reminders.cjs');const r=new Reminders({directory:f.directory,scheduler:f.scheduler,notify:async()=>{throw new Error('반복 호출');},clock:()=>new Date(2026,8,22,21)});assert.equal((await r.check()).reason,'already-attempted');});
test('JSON null과 읽을 수 없는 최신 기록은 기본 미학습으로 바꾸지 않는다',async t=>{const f=fixture(t);await f.r.setEnabled(true);const file=path.join(f.directory,'learning.json');fs.writeFileSync(file,'null');assert.equal((await f.r.check()).reason,'error');assert.equal(f.calls(),0);fs.rmSync(file);fs.mkdirSync(file);assert.equal((await f.r.check()).reason,'error');assert.equal(f.calls(),0);});
test('날짜를 되돌린 경우에도 같은 현지 날짜는 다시 알리지 않는다',async t=>{const f=fixture(t);await f.r.setEnabled(true);await f.r.check();f.time(new Date(2026,8,23,20));await f.r.check();f.time(new Date(2026,8,22,21));await f.r.check();assert.equal(f.calls(),2);});
test('상태 저장 실패 시 활성화 성공으로 남기지 않는다',async t=>{const f=fixture(t);fs.writeFileSync(path.join(f.directory,'blocked-parent'),'file');f.r.file=path.join(f.directory,'blocked-parent','reminders.json');await assert.rejects(f.r.setEnabled(true));assert.equal(f.r.state().enabled,false);await f.r.check();assert.equal(f.calls(),0);});
test('오늘 구버전 3+1 배정은 화면과 같은 6+2 판정이며 원본과 과거 사이클은 유지한다',()=>{
 const {Learning}=require('../lib/learning.cjs'),unit=require('../content/lessons.cjs')[0];
 const legacy={date,blanks:unit.cards.slice(0,3).map(c=>c.id),done:unit.cards.slice(0,3).map(c=>c.id),query:unit.queries[0],queryDone:true};
 const data={records:{},days:{[date]:{...legacy,completedCycles:[{...legacy,date:'2026-09-21'}]}}};
 const raw=JSON.stringify(data),result=learningGoal(data,date);
 const learning=Object.create(Learning.prototype);learning.data=JSON.parse(raw);learning.clock=()=>new Date(2026,8,22);learning.save=()=>{};
 const snapshot=learning.snapshot();
 assert.equal(result.completedCycleCount,snapshot.today.completedCycleCount);
 assert.equal(result.completedCycleCount,1);
 assert.equal(JSON.stringify(data),raw);
 assert.deepEqual(data.days[date].completedCycles[0],{...legacy,date:'2026-09-21'});
});
test('알림 설정 백업 복원은 끄고 복구 당일 시도를 보류하며 재활성화해도 중복하지 않는다',async t=>{
 const f=fixture(t),{Reminders}=require('../lib/reminders.cjs');await f.r.setEnabled(true);
 fs.writeFileSync(f.r.file+'.bak',JSON.stringify({enabled:true,attemptedDates:[],lastAttemptDate:null}));fs.writeFileSync(f.r.file,'{');
 const readonly=new Reminders({directory:f.directory,scheduler:f.scheduler,notify:f.r.notify,clock:f.r.clock,recover:false});
 assert.equal((await readonly.check()).reason,'invalid-settings');assert.equal(fs.readFileSync(f.r.file,'utf8'),'{');
 const recovered=new Reminders({directory:f.directory,scheduler:f.scheduler,notify:f.r.notify,clock:f.r.clock});
 assert.equal(recovered.state().enabled,false);assert.ok(recovered.state().attemptedDates.includes(date));
 await recovered.setEnabled(true);assert.equal((await recovered.check()).reason,'already-attempted');assert.equal(f.calls(),0);
});
test('알림 전용 읽기는 누락된 기본 파일의 백업을 신규 사용자로 오인하지 않는다',async t=>{
 const f=fixture(t);await f.r.setEnabled(true);fs.writeFileSync(path.join(f.directory,'learning.json.bak'),JSON.stringify({days:{},records:{}}));
 assert.equal((await f.r.check()).reason,'error');assert.equal(f.calls(),0);assert.equal(fs.existsSync(path.join(f.directory,'learning.json')),false);
});
