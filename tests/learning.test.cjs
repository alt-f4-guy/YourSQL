// 하루 배정과 복습 기록은 실제 파일 저장소에서 검증한다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Learning}=require('../lib/learning.cjs');
test('하루 3+1 고정 배정, 재시작, 오답·도움 사용·중복 제출과 다음날 복습',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-0.0.1-test-'));
  try {
    let now=new Date(2026,8,6,23,59);
    let store=new Learning(dir,()=>now);
    const first=store.snapshot();
    assert.equal(first.today.blanks.length,3);
    assert.equal(new Set(first.today.blanks).size,3);
    assert.equal(typeof first.today.query,'string');
    const id=first.today.blanks[0];
    assert.equal(store.answer({id,answer:'잘못된 답'}).correct,false);
    assert.equal(store.snapshot().today.done.length,0);
    const solution=store.reveal(id);
    assert.equal(store.answer({id,answer:solution.answer.toLowerCase()}).correct,true);
    assert.equal(store.snapshot().today.done.length,1);
    assert.equal(store.snapshot().records[id].due,'2026-09-07');
    store.answer({id,answer:solution.answer});
    assert.equal(store.snapshot().today.done.length,1);
    const due=store.snapshot().records[id].due;
    store=new Learning(dir,()=>now);
    assert.deepEqual(store.snapshot().today.blanks,first.today.blanks);
    assert.equal(store.snapshot().records[id].due,due);
    store.queryResult(first.today.query,{status:'wrong'});
    assert.equal(store.snapshot().today.queryDone,false);
    store.queryResult(first.today.query,{status:'correct'});
    assert.equal(store.snapshot().today.queryDone,true);
    assert.throws(()=>store.answer({id:'unknown',answer:'x'}));
    assert.throws(()=>store.answer({id,answer:42}));
    now=new Date(2026,8,7,0,1);
    const next=store.snapshot();
    assert.equal(next.today.date,'2026-09-07');
    assert.equal(next.today.done.length,0);
    assert.ok(next.due.some(item=>item.id===id));
    store.answer({id,answer:solution.answer});
    assert.equal(store.snapshot().records[id].due,'2026-09-10');
    store.answer({id,answer:solution.answer});
    assert.equal(store.snapshot().records[id].due,'2026-09-10');
    // 복습 답변은 오늘 새로 배정된 다른 문제의 완료 수를 올리지 않는다.
    assert.equal(store.snapshot().today.done.includes(id),next.today.blanks.includes(id));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
// 도움을 나중에 보거나 정답 뒤 오답을 내도 다음 복습이 잘못 늘어나지 않아야 한다.
test('정답 후 도움 사용은 복습을 다음날로 당기고 다시 정답을 내면 오답 상태를 해제한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-0.0.1-test-'));
  try{
    let now=new Date(2026,8,6);
    const store=new Learning(dir,()=>now),id=store.snapshot().today.blanks[0];
    store.answer({id,answer:'SELECT'});
    now=new Date(2026,8,7);store.answer({id,answer:'SELECT'});
    assert.equal(store.snapshot().records[id].due,'2026-09-10');
    store.reveal(id);
    assert.equal(store.snapshot().records[id].due,'2026-09-08');
    store.answer({id,answer:'오답'});store.answer({id,answer:'SELECT'});
    assert.equal(store.snapshot().records[id].lastStatus,'correct');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
// 과정 확대가 기존 기록을 바꾸거나 하루에 서로 다른 단원을 섞는 회귀를 막는다.
test('전체 과정은 5단계 각 8단원이고 기존 배정·기록을 보존한다',()=>{
  const units=require('../content/lessons.cjs'),all=units.flatMap(u=>u.cards);
  assert.equal(units.length,40);assert.equal(all.length,240);
  for(let level=1;level<=5;level++)assert.equal(units.filter(u=>u.level===level).length,8);
  assert.equal(new Set(all.map(c=>c.id)).size,240);
  assert.equal(all.find(c=>c.id==='blank1').sql,'___ name FROM customers');
  assert.equal(all.find(c=>c.id==='blank30').answer,'DATE_FORMAT');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-curriculum-'));
  try{
    const legacy={date:'2026-09-05',blanks:['blank28','blank29','blank30'],done:['blank28'],query:'level1_04',queryDone:false};
    fs.writeFileSync(path.join(dir,'learning.json'),JSON.stringify({days:{'2026-09-05':legacy},records:{blank1:{passed:true,due:'2026-09-08'}}}));
    let now=new Date(2026,8,5),store=new Learning(dir,()=>now);
    assert.deepEqual(store.snapshot().today,legacy);
    now=new Date(2026,8,6);
    const snapshot=store.snapshot();
    assert.equal(new Set(snapshot.today.blanks.map(id=>all.find(c=>c.id===id).unit)).size,1);
    assert.equal(snapshot.history['2026-09-05'].blankCount,1);
    assert.equal(snapshot.history['2026-09-05'].complete,false);
    assert.equal(snapshot.records.blank1.passed,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 전체 과정을 매일 3+1로 끝까지 진행하고 문자열 형식의 대소문자도 확인한다.
test('80일 과정이 240개 개념 문제를 빠짐없이 배정한다',()=>{
  const units=require('../content/lessons.cjs'),cards=units.flatMap(u=>u.cards);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-course-'));
  try{
    let now=new Date(2026,0,1);const store=new Learning(dir,()=>now),seen=new Set();
    const format=cards.find(c=>c.answer==='%Y-%m');
    assert.equal(store.answer({id:format.id,answer:'%y-%M'}).correct,false);
    for(let i=0;i<80;i++){
      const today=store.snapshot().today;
      for(const id of today.blanks){const card=cards.find(c=>c.id===id);assert.ok(card.answer.length<=200);assert.equal(card.sql.split('___').length,2);assert.equal(store.answer({id,answer:card.answer}).correct,true);seen.add(id);}
      store.queryResult(today.query,{status:'correct'});
      now.setDate(now.getDate()+1);
    }
    assert.equal(seen.size,240);assert.equal(store.snapshot().completedDays,80);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 저장 파일 이름이 바뀌어도 기존 학습 기록을 보존하고 새 기록을 우선한다.
test('이전 저장 파일을 읽고 새 이름으로 저장하며 재시작한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-migration-test-'));
  const legacy=path.join(dir,'learning-v2.json'),current=path.join(dir,'learning.json');
  const data={days:{},records:{blank1:{passed:true,due:'2026-09-08'}}};
  try {
    fs.writeFileSync(legacy,JSON.stringify(data));
    const learning=new Learning(dir);
    assert.deepEqual(learning.data,data);
    learning.save();
    assert.equal(fs.existsSync(current),true);
    fs.writeFileSync(legacy,JSON.stringify({days:{},records:{}}));
    assert.deepEqual(new Learning(dir).data,data);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
