// 채점 정확도와 오답 저장이 깨지면 실패하는 기본 회귀 검사다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 답안 실행 단계의 오류만 학습 오답이며 서버·기준 쿼리 실패는 제외한다.
test('채점은 답안 오류와 서버 준비 오류를 구분한다',async()=>{
  const {PracticeService}=require('../lib/service.cjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sql-grade-errors-'));
  try{
    const engine={ready:true,prepare:async()=>{},query:async sql=>{if(sql==='SELECT FROM')throw Object.assign(new Error('문법 오류'),{answerError:true});return {columns:['customer_id','name'],rows:[]};}};
    const service=new PracticeService(path.join(__dirname,'../content'),dir,engine);
    assert.equal((await service.submit({id:'level1_01',sql:'SELECT FROM'})).answerError,true);
    engine.prepare=async()=>{throw new Error('연결 실패');};
    assert.equal((await service.submit({id:'level1_01',sql:'SELECT FROM'})).answerError,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

// 실제 엔진의 연결 경계만 대체하고 서비스·학습 저장소의 오답 분류까지 검증한다.
test('학습자 연결·세션 준비·연결 끊김은 복습에서 제외하고 SQL 문법 오류만 등록한다',async()=>{
  const vm=require('node:vm'),{EventEmitter}=require('node:events');
  const {PracticeService}=require('../lib/service.cjs'),{Learning}=require('../lib/learning.cjs');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sql-answer-errors-'));
  const file=path.join(__dirname,'../lib/engine.cjs'),actualRequire=require('node:module').createRequire(file);
  try{
    for(const platform of ['darwin','win32'])for(const phase of ['connect','session','disconnect','syntax']){
      const module={exports:{}},connection=new EventEmitter();
      connection.destroy=()=>{};
      connection.promise=()=>({query:async()=>{if(phase==='session')throw new Error('세션 준비 실패');}});
      connection.query=()=>{const query=new EventEmitter();queueMicrotask(()=>query.emit('error',phase==='syntax'?{message:'문법 오류',errno:1064,sqlState:'42000'}:{message:'연결 끊김',code:'PROTOCOL_CONNECTION_LOST',fatal:true}));return query;};
      vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,process:{platform},Buffer,setTimeout,clearTimeout,require:name=>name==='mysql2'?{...actualRequire(name),createConnection:()=>{if(phase==='connect')throw Object.assign(new Error('connect ECONNREFUSED'),{code:'ECONNREFUSED'});return connection;}}:actualRequire(name)});
      const data=path.join(directory,`${platform}-${phase}`);fs.mkdirSync(data);
      const actual=new module.exports.Engine(path.join(data,'engine'));actual.ready=true;
      const engine={ready:true,prepare:async()=>{},query:sql=>sql==='SELECT FROM'?actual.query(sql):Promise.resolve({columns:['customer_id','name'],rows:[]})};
      const result=await new PracticeService(path.join(__dirname,'../content'),data,engine).submit({id:'level1_01',sql:'SELECT FROM'});
      const learning=new Learning(data);learning.queryResult('level1_01',result);
      assert.equal(result.answerError,phase==='syntax',phase);
      assert.equal(Boolean(learning.snapshot().records.level1_01?.due),phase==='syntax',phase);
    }
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('결과 비교는 중복, NULL, 행 순서, 정확한 큰 정수를 구분한다', () => {
  const { compareResults } = require('../lib/core.cjs');
  const result = rows => ({ columns: ['VALUE'], rows });
  assert.equal(compareResults(result([[1], [1], [2]]), result([[2], [1], [1]]), false).passed, true);
  assert.equal(compareResults(result([[1], [1], [2]]), result([[2], [2], [1]]), false).passed, false);
  assert.equal(compareResults(result([[null]]), result([['']]), false).passed, false);
  assert.equal(compareResults(result([[1], [2]]), result([[2], [1]]), true).passed, false);
  assert.equal(compareResults(result([['9007199254740993']]), result([['9007199254740992']]), false).passed, false);
  assert.equal(compareResults({...result([['1.00']]),numeric:[true]}, result([[1]]), false).passed, true);
  assert.equal(compareResults(result([['001']]), result([['1']]), false).passed, false);
  assert.equal(compareResults(result([[1]]), {columns:['OTHER'], rows:[[1]]}, false).passed, false);
});

test('초안과 오답은 재시작 후 복원하며 정답 제출은 오답 파일에 남기지 않는다', () => {
  const { PracticeStore } = require('../lib/core.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-store-'));
  try {
    const p = {id:'q1',title:'고객 조회',level:1};
    let store = new PracticeStore(dir);
    store.saveDraft(p.id, 'SELECT 1');
    const wrong = store.record(p, 'SELECT 2', {status:'wrong',passed:0,total:3,cases:[],elapsedMs:2});
    assert.ok(wrong.logId);
    store = new PracticeStore(dir);
    assert.equal(store.progress.q1.sql, 'SELECT 1');
    assert.equal(store.logs()[0].sql, 'SELECT 2');
    assert.equal(store.logs()[0].result.passed, 0);
    store.record(p, 'SELECT 1', {status:'correct',passed:3,total:3,cases:[],elapsedMs:1});
    assert.equal(store.logs().length, 1);
    assert.equal(store.progress.q1.solved, true);
    assert.equal(store.progress.q1.attempts, 2);
    store.record(p, 'broken', {status:'error',passed:0,total:3,cases:[],error:'문법 오류'});
    assert.equal(store.logs().length, 2);
    assert.equal(store.progress.q1.solved, true);
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
});

test('추가 문제 파일에서 SQL 조각을 자료형·식별자로 주입할 수 없다', () => {
  const { validatePack } = require('../lib/core.cjs');
  const pack = {version:1,id:'demo',title:'예제',tables:[{name:'T',columns:[{name:'ID',type:'INT'}]}],datasets:[{name:'예제',rows:{T:[[1]]}},{name:'검사',rows:{T:[[2]]}}],problems:[{id:'q1',level:1,title:'조회',topic:'조회',description:'조회하세요',tables:['T'],columns:['ID'],ordered:true,solution:'SELECT ID FROM T',explanation:'설명',starter:'SELECT'}]};
  assert.equal(validatePack(pack), pack);
  const bad = structuredClone(pack);
  bad.tables[0].columns[0].type = 'INT); DROP DATABASE mysql; --';
  assert.throws(() => validatePack(bad));
  const invalid = structuredClone(pack);
  invalid.problems[0].level = 6;
  assert.throws(() => validatePack(invalid));
  const shape = structuredClone(pack);
  shape.datasets[0].rows.T = [[1,2]];
  assert.throws(() => validatePack(shape));
});

// 날짜 경계·중복 제출·재시작과 복습 초안 보존을 검증한다.
test('학습일은 현지 제출일을 중복 없이 세고 연속일은 어제까지 유지한다', () => {
  const { PracticeStore } = require('../lib/core.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-study-'));
  try {
    let store = new PracticeStore(dir);
    const p = {id:'q1',title:'복습',level:1}, result = {status:'wrong'};
    store.saveDraft('q1','원래 초안');
    store.saveDraft('q1','복습 초안',true,'2024-02-28');
    store.saveDraft('q1','일반 초안');
    assert.equal(store.progress.q1.sql,'일반 초안');
    for (const day of [28,28,29]) store.record(p,'제출',result,new Date(2024,1,day,23,59));
    store.record(p,'제출',{status:'correct'},new Date(2024,2,1,0,1));
    store = new PracticeStore(dir);
    assert.deepEqual(store.study(new Date(2024,2,2)),{current:3,longest:3,total:3,today:false,dates:['2024-02-28','2024-02-29','2024-03-01']});
    assert.equal(store.study(new Date(2024,2,3)).current,0);
    assert.equal(store.progress.q1.sql,'일반 초안');
    assert.equal(store.progress.q1.reviewSql,'복습 초안');
    assert.equal(store.progress.q1.reviewDue,'2024-02-28');
    assert.throws(()=>store.saveDraft('q1','복습 초안',true,42));
    store.record(p,'오답',result,new Date(2024,2,3));
    assert.equal(store.progress.q1.lastStatus,'wrong');
    assert.equal(store.progress.q1.solved,true);
    assert.equal(store.study(new Date(2024,2,3)).current,1);
    assert.equal(store.study(new Date(2024,1,27)).total,0);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('기본 300문제에 정답과 구분되는 3단계 힌트가 있고 잘못된 힌트 팩은 거부한다', () => {
  const {validatePack} = require('../lib/core.cjs');
  for (const name of ['shop','academy']) {
    const pack = structuredClone(require(`../content/${name}.json`));
    for (const p of validatePack(pack).problems) {
      assert.equal(p.hints?.length,3,p.id);
      assert.ok(p.hints.every(h=>typeof h==='string' && h.trim()));
      assert.notEqual(p.hints[2],p.solution);
    }
    pack.problems[0].hints=['하나만'];
    assert.throws(()=>validatePack(pack),/힌트/);
    delete pack.problems[0].hints;
    assert.doesNotThrow(()=>validatePack(pack));
  }
});

// 문제를 늘려도 기존 기록의 ID와 정답 의미를 바꾸지 않고 단계별 학습 범위를 유지한다.
test('300문제는 단계별 60개이며 기존 70문제와 풀이 기록 연결을 보존한다', () => {
  const {createHash} = require('node:crypto');
  const problems=['shop','academy'].flatMap(name=>require(`../content/${name}.json`).problems).sort((a,b)=>a.id.localeCompare(b.id));
  assert.equal(problems.length,300);
  assert.equal(new Set(problems.map(p=>p.id)).size,300);
  assert.equal(new Set(problems.map(p=>p.title)).size,300);
  assert.equal(new Set(problems.map(p=>p.solution.replace(/\s+/g,' ').trim())).size,300);
  for (let level=1;level<=5;level++) assert.equal(problems.filter(p=>p.level===level).length,60);
  const old=problems.filter(p=>Number(p.id.split('_')[1])<=14).map(({id,level,title,solution})=>({id,level,title,solution}));
  assert.equal(old.length,70);
  assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),'7cf3f710063ce3fcb85a4d8420c0bb1fc404d96c402cbc9128408ff98f2d1745');
  for (const p of problems) {
    assert.equal(p.hints.length,3,p.id);
    assert.ok(p.hints.every(h=>h.trim() && !h.includes('undefined')),p.id);
    if (p.level<=2) assert.doesNotMatch(p.solution,/\bJOIN\b|\bOVER\s*\(|\(\s*SELECT\b/i,p.id);
    if (p.level===3) assert.doesNotMatch(p.solution,/\bOVER\s*\(/i,p.id);
  }
});

// 편집 화면의 스키마에 정답 쿼리가 사용하는 실제 테이블이 빠지면 안 된다.
test('문제 설명 화면은 쿼리가 참조하는 모든 기본 테이블을 제공한다', () => {
  for (const name of ['shop','academy']) {
    const pack=require(`../content/${name}.json`);
    for (const p of pack.problems) for (const table of pack.tables) {
      if (new RegExp(`\\b(?:FROM|JOIN)\\s+${table.name}\\b`,'i').test(p.solution)) assert.ok(p.tables.includes(table.name),`${p.id}: ${table.name} 스키마 누락`);
    }
  }
});
