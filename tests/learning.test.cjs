// 하루 배정과 복습 기록은 실제 파일 저장소에서 검증한다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Learning}=require('../lib/learning.cjs');
test('하루 6+2 고정 배정, 재시작, 오답·도움 사용·중복 제출과 다음날 복습',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-0.0.1-test-'));
  try {
    let now=new Date(2026,8,6,23,59);
    let store=new Learning(dir,()=>now);
    const first=store.snapshot();
    assert.equal(first.today.blanks.length,6);
    assert.equal(new Set(first.today.blanks).size,6);
    assert.equal(new Set(first.today.queries).size,2);
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
    store.queryResult(first.today.queries[0],{status:'wrong'});
    assert.equal(store.snapshot().today.queryDone,false);
    store.queryResult(first.today.queries[0],{status:'correct'});
    assert.equal(store.snapshot().today.queryDone,false);
    assert.deepEqual(store.snapshot().today.queriesDone,[first.today.queries[0]]);
    store.queryResult(first.today.queries[0],{status:'correct'});
    assert.equal(store.snapshot().today.queriesDone.length,1);
    store.queryResult(first.today.queries[1],{status:'correct'});
    assert.equal(store.snapshot().today.queryDone,true);
    assert.throws(()=>store.answer({id:'unknown',answer:'x'}));
    assert.throws(()=>store.answer({id,answer:42}));
    now=new Date(2026,8,7,0,1);
    const next=store.snapshot();
    assert.equal(next.today.date,'2026-09-07');
    assert.equal(next.today.done.length,0);
    assert.ok(next.due.some(item=>item.id===id));
    store.answer({id,answer:solution.answer,review:true});
    assert.equal(store.snapshot().records[id].due,'2026-09-10');
    store.answer({id,answer:solution.answer,review:true});
    assert.equal(store.snapshot().records[id].due,'2026-09-10');
    // 복습 답변은 오늘 새로 배정된 다른 문제의 완료 수를 올리지 않는다.
    assert.equal(store.snapshot().today.done.includes(id),next.today.blanks.includes(id));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
// 정답·도움 열람만으로는 오답 복습에 등록하지 않는다.
test('해설 열람과 정답은 복습을 만들지 않고 실제 오답만 다음날 예약한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-0.0.1-test-'));
  try{
    let now=new Date(2026,8,6);
    const store=new Learning(dir,()=>now),id=store.snapshot().today.blanks[0];
    store.answer({id,answer:'SELECT'});
    now=new Date(2026,8,7);store.answer({id,answer:'SELECT'});
    assert.equal(store.snapshot().records[id].due,null);
    store.reveal(id);
    assert.equal(store.snapshot().records[id].due,null);
    store.answer({id,answer:'오답'});store.answer({id,answer:'SELECT'});
    assert.equal(store.snapshot().records[id].due,'2026-09-08');
    assert.equal(store.snapshot().records[id].lastStatus,'correct');
    assert.deepEqual(store.snapshot().due,[]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 빈칸·쿼리는 같은 간격을 쓰고, 같은 회차의 오답은 재시작해도 한 번만 추가한다.
for(const kind of ['blank','query'])test(`${kind}: 복습 중 재오답은 다음 날, 정답 회차는 기본 간격으로 예약한다`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-review-spacing-'));
  try{
    let now=new Date(2026,8,6),store=new Learning(dir,()=>now);
    const id=kind==='blank'?'blank1':'level1_01';
    const answer=(correct,review=false)=>kind==='blank'?store.answer({id,answer:correct?'SELECT':'오답',review}):store.queryResult(id,{status:correct?'correct':'wrong'},review);
    const record=()=>store.snapshot().records[id];
    answer(false);answer(true);answer(true,true);
    assert.equal(record().due,'2026-09-07');assert.equal(record().reviewTotal,3);assert.equal(record().reviewCount,0);
    now=new Date(2026,8,7);
    answer(true);assert.equal(record().reviewCount,0,'일반 학습은 복습 회차를 완료하지 않는다');
    answer(false,true);assert.equal(record().reviewTotal,4);
    store=new Learning(dir,()=>now);answer(false,true);
    assert.equal(record().reviewTotal,4);assert.equal(record().due,'2026-09-07');
    answer(true,true);answer(true,true);
    assert.equal(record().reviewCount,1);assert.equal(record().due,'2026-09-08');
    store.reveal('blank1');assert.equal(record().due,'2026-09-08');
    now=new Date(2026,8,10);answer(true,true);
    assert.equal(record().reviewCount,2);assert.equal(record().due,'2026-09-17');
    // 늦게 완료한 회차는 실제 완료일로부터 다음 간격을 계산한다.
    now=new Date(2026,8,19);answer(false,true);answer(true,true);
    assert.equal(record().reviewTotal,5);assert.equal(record().reviewCount,3);assert.equal(record().due,'2026-09-20');
    now=new Date(2026,8,26);answer(true,true);
    assert.equal(record().reviewCount,4);assert.equal(record().due,'2026-10-03');
    now=new Date(2026,9,3);answer(true,true);answer(true,true);
    assert.equal(record().reviewCount,5);assert.equal(record().due,null);assert.deepEqual(store.snapshot().due,[]);
    assert.equal(new Learning(dir,()=>now).snapshot().records[id].due,null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 마지막 회차의 재오답도 종료하지 않으며, 중단·재시작·연말을 지나 실제 완료 다음 날에 다시 푼다.
for(const kind of ['blank','query'])test(`${kind}: 마지막 복습 재오답 후 중단해도 다음 날 재복습을 보존한다`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-review-retry-'));
  try{
    let now=new Date(2026,11,20),store=new Learning(dir,()=>now);
    const id=kind==='blank'?'blank1':'level1_01';
    const answer=correct=>kind==='blank'?store.answer({id,answer:correct?'SELECT':'오답',review:true}):store.queryResult(id,{status:correct?'correct':'error',answerError:!correct},true);
    answer(false);
    now=new Date(2026,11,21);answer(true);
    now=new Date(2026,11,24);answer(true);
    now=new Date(2026,11,31);answer(false);answer(false);
    store=new Learning(dir,()=>now);
    assert.equal(store.snapshot().records[id].reviewTotal,4);
    now=new Date(2027,0,1);
    assert.ok(store.snapshot().due.some(r=>r.id===id),'틀린 채 중단한 복습은 다음 날에도 풀 수 있어야 한다');
    answer(true);answer(true);
    const record=store.snapshot().records[id];
    assert.equal(record.reviewCount,3);assert.equal(record.due,'2027-01-02');
    assert.equal(record.reviewFailed,false);
    store=new Learning(dir,()=>now);
    assert.equal(store.snapshot().records[id].due,'2027-01-02');
    now=new Date(2027,0,2);answer(true);
    assert.equal(store.snapshot().records[id].due,null);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 세 번 모두 맞히면 종료하고 연결 오류는 오답으로 오인하지 않는다.
test('기본 복습은 3회에 종료하며 SQL 실행 오류 중 답안 오류만 복습에 등록한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-review-complete-'));
  try{
    let now=new Date(2026,11,31),store=new Learning(dir,()=>now);
    store.queryResult('level1_01',{status:'error'});
    assert.equal(store.snapshot().records.level1_01,undefined);
    store.queryResult('level1_01',{status:'error',answerError:true});
    assert.equal(store.snapshot().records.level1_01.due,'2027-01-01');
    for(const [date,due] of [[1,'2027-01-04'],[4,'2027-01-11'],[11,null]]){
      now=new Date(2027,0,date);store.queryResult('level1_01',{status:'correct'},true);
      assert.equal(store.snapshot().records.level1_01.due,due);
    }
    assert.equal(store.snapshot().records.level1_01.reviewCount,3);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 구버전의 완료 진도는 보존하고 확인 가능한 오답만 기존 복습일에 이관한다.
test('기존 정답 복습은 해제하고 마지막 오답과 SQL 오답 기록을 한 번만 이관한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-review-migration-'));
  try{
    const records={blank1:{kind:'blank',passed:true,lastStatus:'correct',due:'2026-09-07',step:3},blank2:{kind:'blank',lastStatus:'wrong',due:'2026-09-07'},level1_01:{kind:'query',passed:true,lastStatus:'correct',due:'2026-09-10'}};
    fs.writeFileSync(path.join(dir,'learning.json'),JSON.stringify({days:{},records}));
    const logs=[{problemId:'level1_01',status:'wrong'}];
    const store=new Learning(dir,()=>new Date(2026,8,7),logs),snapshot=store.snapshot();
    assert.equal(snapshot.records.blank1.passed,true);assert.equal(snapshot.records.blank1.due,null);
    assert.deepEqual(snapshot.due.map(r=>r.id),['blank2']);
    assert.equal(snapshot.records.level1_01.reviewTotal,3);assert.equal(snapshot.records.level1_01.due,'2026-09-10');
    store.answer({id:'blank2',answer:'FROM',review:true});
    assert.equal(new Learning(dir,()=>new Date(2026,8,7),logs).snapshot().records.blank2.reviewCount,1);
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
    let now=new Date(2026,8,6),store=new Learning(dir,()=>now);
    assert.deepEqual(store.data.days[legacy.date],legacy);
    now=new Date(2026,8,6);
    const snapshot=store.snapshot();
    assert.equal(new Set(snapshot.today.blanks.map(id=>all.find(c=>c.id===id).unit)).size,1);
    assert.equal(snapshot.history['2026-09-05'].blankCount,1);
    assert.equal(snapshot.history['2026-09-05'].complete,false);
    assert.equal(snapshot.records.blank1.passed,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 전체 과정을 매일 6+2로 끝까지 진행하고 문자열 형식의 대소문자도 확인한다.
test('40일 과정이 240개 개념 문제를 빠짐없이 배정한다',()=>{
  const units=require('../content/lessons.cjs'),cards=units.flatMap(u=>u.cards);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-course-'));
  try{
    let now=new Date(2026,0,1);const store=new Learning(dir,()=>now),seen=new Set();
    const format=cards.find(c=>c.answer==='%Y-%m');
    assert.equal(store.answer({id:format.id,answer:'%y-%M'}).correct,false);
    for(let i=0;i<40;i++){
      const today=store.snapshot().today;
      for(const id of today.blanks){const card=cards.find(c=>c.id===id);assert.ok(card.answer.length<=200);assert.equal(card.sql.split('___').length,2);assert.equal(store.answer({id,answer:card.answer}).correct,true);seen.add(id);}
      for(const id of today.queries)store.queryResult(id,{status:'correct'});
      now.setDate(now.getDate()+1);
    }
    assert.equal(seen.size,240);assert.equal(store.snapshot().completedDays,40);
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

// 같은 날 다음 배정을 반복해도 완료 기록과 다음 날의 순서를 보존한다.
test('추가 6+2 사이클은 순서대로 배정하고 일별 누적과 재시작을 보존한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-extra-'));
  try{
    let now=new Date(2026,8,7),store=new Learning(dir,()=>now);
    assert.equal(typeof store.startExtra,'function');
    const first=structuredClone(store.snapshot().today);
    assert.deepEqual(store.startExtra().today,first);
    const finish=()=>{const t=store.snapshot().today;for(const id of t.blanks)store.answer({id,answer:store.card(id).answer});for(const id of t.queries)store.queryResult(id,{status:'correct'});};
    finish();
    const second=store.startExtra();
    assert.deepEqual(second.today.blanks,require('../content/lessons.cjs')[1].cards.map(c=>c.id));
    assert.notDeepEqual(second.today.queries,first.queries);
    assert.equal(second.history['2026-09-07'].total,8);
    assert.equal(second.history['2026-09-07'].complete,true);
    assert.equal(second.completedDays,1);
    assert.deepEqual(store.startExtra().today,second.today);
    const id=second.today.blanks[0];
    store.answer({id,answer:'오답'});assert.equal(store.snapshot().history['2026-09-07'].total,8);
    store.answer({id,answer:store.card(id).answer});store.answer({id,answer:store.card(id).answer});
    store=new Learning(dir,()=>now);
    assert.deepEqual(store.snapshot().today.done,[id]);
    assert.equal(store.snapshot().history['2026-09-07'].total,9);
    finish();
    store.queryResult(second.today.queries[0],{status:'correct'});
    assert.equal(store.snapshot().history['2026-09-07'].total,16);
    assert.equal(store.snapshot().history['2026-09-07'].queryCount,4);
    const third=store.startExtra();assert.deepEqual(third.today.blanks,require('../content/lessons.cjs')[2].cards.map(c=>c.id));
    finish();assert.equal(store.snapshot().history['2026-09-07'].total,24);
    now=new Date(2026,8,8);
    const next=store.snapshot();
    assert.deepEqual(next.today.blanks,require('../content/lessons.cjs')[3].cards.map(c=>c.id));
    assert.equal(next.history['2026-09-08'].total,0);
    assert.equal(next.history['2026-09-07'].total,24);
    assert.equal(next.completedDays,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 전체 과정을 하루에 끝내도 중복 배정 없이 종료되고 기존 일일 기록을 읽는다.
test('하루 40사이클 종료 후 다음 날에도 자동 반복 배정을 만들지 않는다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-extra-course-'));
  try{
    let now=new Date(2026,8,7);const store=new Learning(dir,()=>now),seen=new Set();
    store.setDailyGoal(41);
    assert.equal(typeof store.startExtra,'function');
    for(let cycle=0;cycle<40;cycle++){
      const t=store.snapshot().today;
      for(const id of t.blanks){assert.ok(!seen.has(id));seen.add(id);store.answer({id,answer:store.card(id).answer});}
      for(const id of t.queries)store.queryResult(id,{status:'correct'});
      if(cycle<39)store.startExtra();
    }
    const final=store.snapshot();assert.equal(final.history['2026-09-07'].total,320);
    assert.equal(final.hasMore,false);assert.equal(final.today.courseComplete,true);
    assert.equal(final.today.completedCycleCount,40);assert.equal(final.today.goalComplete,false);
    assert.equal(final.completedDays,0);
    assert.deepEqual(store.startExtra().today,final.today);
    assert.equal(new Learning(dir,()=>new Date(2026,8,7)).snapshot().history['2026-09-07'].total,320);
    now=new Date(2026,8,8);
    const next=store.snapshot();
    assert.equal(next.today.courseComplete,true);
    assert.deepEqual(next.today.blanks,[]);
    assert.deepEqual(next.today.queries,[]);
    assert.equal(next.today.goalComplete,false);
    assert.equal(next.history['2026-09-08'].total,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 오늘의 구형 배정만 확장하며 이전 날짜와 완료한 사이클은 그대로 보존한다.
test('기존 3+1 배정의 정답과 완료 이력을 유지하며 오늘을 6+2로 확장한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-daily-expand-'));
  try{
    const unit=require('../content/lessons.cjs')[0];
    const legacy={date:'2026-09-06',blanks:unit.cards.slice(0,3).map(c=>c.id),done:unit.cards.slice(0,3).map(c=>c.id),query:unit.queries[0],queryDone:true};
    fs.writeFileSync(path.join(dir,'learning.json'),JSON.stringify({days:{'2026-09-05':{...legacy,date:'2026-09-05'},'2026-09-06':{...legacy,completedCycles:[legacy]}},records:{}}));
    const store=new Learning(dir,()=>new Date(2026,8,6)),snapshot=store.snapshot();
    assert.equal(snapshot.today.blanks.length,6);
    assert.deepEqual(snapshot.today.done,legacy.done);
    assert.deepEqual(snapshot.today.queriesDone,[legacy.query]);
    assert.equal(snapshot.today.queryDone,false);
    assert.deepEqual(snapshot.today.completedCycles,[legacy]);
    assert.equal(snapshot.history['2026-09-05'].total,4);
    assert.equal(snapshot.history['2026-09-05'].complete,true);
    assert.equal(snapshot.history['2026-09-06'].total,8);
    assert.deepEqual(new Learning(dir,()=>new Date(2026,8,6)).snapshot().today,snapshot.today);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 공백은 SQL 토큰 사이에서만 무시하고 문자열 값과 잘못된 키워드는 구분한다.
test('빈칸 SQL의 연산자와 구두점 주변 공백을 허용한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-blank-spacing-'));
  try{
    const store=new Learning(dir),cards=require('../content/lessons.cjs').flatMap(u=>u.cards);
    for(const [expected,answer] of [['required=1','required = 1'],['score>=80','score >= 80'],['category,price','category, price'],['COUNT(score)','COUNT ( score )']]){
      assert.equal(store.answer({id:cards.find(c=>c.answer===expected).id,answer}).correct,true);
    }
    assert.equal(store.answer({id:'blank1',answer:'SEL ECT'}).correct,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 자유 단원 학습도 날짜별로 저장하며 일일 배정과 중복 합산하지 않는다.
test('배정 밖 정답은 일별 누적에 반영하고 재시작과 다음날에도 보존한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-free-learning-'));
  try{
    let now=new Date(2026,8,7),store=new Learning(dir,()=>now);
    const today=store.snapshot().today,id=require('../content/lessons.cjs')[1].cards[0].id;
    store.answer({id,answer:store.card(id).answer});
    store.answer({id,answer:store.card(id).answer});
    assert.equal(store.snapshot().history[today.date].total,1);
    assert.equal(store.snapshot().today.done.length,0);
    store=new Learning(dir,()=>now);
    assert.equal(store.snapshot().history[today.date].total,1);
    const assigned=today.blanks[0];store.answer({id:assigned,answer:store.card(assigned).answer});
    assert.equal(store.snapshot().history[today.date].total,2);
    now=new Date(2026,8,8);store.answer({id,answer:store.card(id).answer});
    assert.equal(store.snapshot().history[today.date].total,2);
    assert.equal(store.snapshot().history['2026-09-08'].total,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 하루 목표는 저장하고 현재 날짜에만 적용하며, 첫 사이클만으로 높은 목표를 달성하지 않는다.
test('하루 목표 사이클을 저장하고 사이클 완료 수로 목표 달성을 판정한다',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-daily-goal-'));
  try{
    let now=new Date(2026,8,7),store=new Learning(dir,()=>now);
    assert.equal(store.snapshot().settings.dailyCycles,1);
    const changed=store.setDailyGoal(2);
    assert.equal(changed.settings.dailyCycles,2);
    assert.equal(changed.today.goalCycles,2);
    assert.deepEqual(changed.dailyGoal,{cycles:2,blankCount:12,queryCount:4,total:16});
    assert.throws(()=>store.setDailyGoal(0),/1 이상의 정수/);
    assert.throws(()=>store.setDailyGoal(1.5),/1 이상의 정수/);
    assert.equal(store.snapshot().settings.dailyCycles,2);

    const finish=()=>{
      const today=store.snapshot().today;
      for(const id of today.blanks)store.answer({id,answer:store.card(id).answer});
      for(const id of today.queries)store.queryResult(id,{status:'correct'});
    };
    const freeId=require('../content/lessons.cjs')[1].cards[0].id;
    store.answer({id:freeId,answer:store.card(freeId).answer});
    finish();
    let progress=store.snapshot();
    assert.equal(progress.today.completedCycleCount,1);
    assert.equal(progress.today.currentCycleComplete,true);
    assert.equal(progress.today.goalComplete,false);
    assert.equal(progress.history['2026-09-07'].completedCycles,1);
    assert.equal(progress.history['2026-09-07'].complete,false);
    assert.equal(progress.history['2026-09-07'].total,9);

    const firstDone=[...progress.today.done],firstQueries=[...progress.today.queriesDone];
    progress=store.setDailyGoal(1);
    assert.equal(progress.today.goalComplete,true);
    progress=store.setDailyGoal(3);
    assert.equal(progress.today.goalComplete,false);
    assert.deepEqual(progress.today.done,firstDone);
    assert.deepEqual(progress.today.queriesDone,firstQueries);
    store.setDailyGoal(2);

    const second=store.startExtra();
    assert.equal(second.today.completedCycles.length,1);
    assert.equal(second.today.goalCycles,2);
    finish();
    progress=store.snapshot();
    assert.equal(progress.today.completedCycleCount,2);
    assert.equal(progress.today.goalComplete,true);
    assert.equal(progress.history['2026-09-07'].complete,true);

    store=new Learning(dir,()=>now);
    assert.equal(store.snapshot().settings.dailyCycles,2);
    assert.equal(store.snapshot().today.completedCycleCount,2);
    assert.equal(store.snapshot().today.goalComplete,true);

    now=new Date(2026,8,8);
    store.setDailyGoal(3);
    assert.equal(store.snapshot().today.goalCycles,3);
    assert.equal(store.snapshot().history['2026-09-07'].goalCycles,2);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
