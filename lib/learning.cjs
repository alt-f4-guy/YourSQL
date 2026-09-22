// 일일 학습·간격 복습 저장소. 기존 SQL 채점은 PracticeService를 사용한다.
const fs=require('node:fs');
const path=require('node:path');
const {atomicJSON}=require('./core.cjs');
const units=require('../content/lessons.cjs');
const cards=units.flatMap(unit=>unit.cards);
const packs=[require('../content/shop.json'),require('../content/academy.json')];
const DEFAULT_DAILY_CYCLES=1;
const isDailyCycles=value=>Number.isSafeInteger(value)&&value>=1;
const storedDailyCycles=value=>isDailyCycles(value)?value:null;
const cycleComplete=cycle=>{
  const blanks=Array.isArray(cycle?.blanks)?cycle.blanks:[];
  const done=new Set((Array.isArray(cycle?.done)?cycle.done:[]).filter(id=>blanks.includes(id)));
  const hasQueryList=Array.isArray(cycle?.queries),queries=hasQueryList?cycle.queries:cycle?.query?[cycle.query]:[];
  const queriesDone=new Set(Array.isArray(cycle?.queriesDone)?cycle.queriesDone:[]);
  const queryComplete=hasQueryList?queries.length>0&&queries.every(id=>queriesDone.has(id)):Boolean(cycle?.queryDone);
  return blanks.length>0&&done.size===blanks.length&&queryComplete;
};
// 화면과 알림이 공유하는 순수 집계. 배정 생성·이관·저장을 하지 않는다.
const normalizeTodayCycle=cycle=>{
  if(!cycle||cycle.queries)return cycle;
  const unit=units.find(u=>u.cards.some(c=>cycle.blanks.includes(c.id)));
  if(!unit)throw new Error('오늘의 학습 배정을 확인할 수 없습니다.');
  return {...cycle,unit:unit.id,blanks:unit.cards.map(c=>c.id),
    queries:[cycle.query,...unit.queries.filter(id=>id!==cycle.query)].slice(0,2),
    queriesDone:cycle.queryDone?[cycle.query]:[],queryDone:false};
};
const completedCycleCount=d=>[...(d?.completedCycles||[]),d].filter(cycleComplete).length;
function learningGoal(data,date){
  const today=normalizeTodayCycle(data.days?.[date]);
  const goalCycles=storedDailyCycles(today?.goalCycles)||storedDailyCycles(data.settings?.dailyCycles)||DEFAULT_DAILY_CYCLES;
  const count=completedCycleCount(today);
  const hasMore=cards.some(c=>!data.records?.[c.id]?.passed);
  return {goalCycles,completedCycleCount:count,goalComplete:count>=goalCycles,
    courseComplete:Boolean(today?.courseComplete)||!hasMore&&(!today||cycleComplete(today))};
}
// 빈칸 SQL이 참조하는 공개 테이블만 보내며 엔진 시작 여부와 분리한다.
const tablesFor=card=>{
  const pack=packs.find(p=>p.problems.some(p=>p.id===card.problemId));
  return pack.tables.filter(t=>new RegExp(`\\b${t.name}\\b`,'i').test(card.sql)).map(t=>({...t,rows:pack.datasets[0].rows[t.name]}));
};
const day=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
// 따옴표 안의 값은 보존하고 SQL 키워드만 대소문자를 무시한다.
const normalize=value=>value.trim().split(/('(?:''|[^'])*')/).map((part,i)=>i%2?part:(part.toUpperCase().match(/<=>|>=|<=|<>|!=|[\w$\u0080-\uFFFF]+|[^\s]/g)||[]).join(' ')).join('');
class Learning {
  constructor(directory,clock=()=>new Date(),wrongAnswers=[]) {
    this.clock=clock;
    this.file=path.join(directory,'learning.json');
    // 기존 기록은 읽기만 하고 이후 저장부터 버전 없는 파일 이름을 사용한다.
    const source=fs.existsSync(this.file)?this.file:path.join(directory,'learning-v2.json');
    this.data=fs.existsSync(source)?JSON.parse(fs.readFileSync(source,'utf8')):{days:{},records:{}};
    // 구버전 진도는 보존하고 확인 가능한 오답만 새 복습 규칙으로 한 번 이관한다.
    const wrongQueries=new Set(wrongAnswers.filter(log=>log.status==='wrong'||log.result?.answerError===true).map(log=>log.problemId));
    let migrated=false;
    for(const [id,r] of Object.entries(this.data.records)){
      if(!r.kind||r.reviewTotal!==undefined)continue;
      const wrong=r.kind==='blank'?r.lastStatus==='wrong':wrongQueries.has(id);
      Object.assign(r,{reviewCount:0,reviewTotal:wrong?3:0,reviewFailed:false,due:wrong?(r.due||this.after(1)):null});
      delete r.step;migrated=true;
    }
    if(migrated)this.save();
  }
  save(){atomicJSON(this.file,this.data);}
  dailyCycles(){return storedDailyCycles(this.data.settings?.dailyCycles)||DEFAULT_DAILY_CYCLES;}
  setDailyGoal(value){
    if(!isDailyCycles(value))throw new Error('하루 목표 사이클은 1 이상의 정수여야 합니다.');
    const today=this.today();
    this.data.settings={...this.data.settings,dailyCycles:value};
    today.goalCycles=value;
    this.save();
    return this.snapshot();
  }
  after(days){const next=new Date(this.clock());next.setDate(next.getDate()+days);return day(next);}
  card(id){const card=cards.find(c=>c.id===id);if(!card)throw new Error('빈칸 문제를 찾을 수 없습니다.');return card;}
  // 일일 학습과 추가 학습은 같은 순서로 다음 6+2 문제를 배정한다.
  assignment(date){
    const records=this.data.records;
    const unit=units.find(u=>u.cards.some(c=>!records[c.id]?.passed));
    if(!unit)return {date,unit:null,goalCycles:this.dailyCycles(),blanks:[],queries:[],done:[],queriesDone:[],queryDone:true,courseComplete:true};
    return {date,unit:unit.id,goalCycles:this.dailyCycles(),blanks:unit.cards.map(c=>c.id),queries:[...unit.queries],done:[],queriesDone:[],queryDone:false};
  }
  today(){
    const date=day(this.clock());
    if(!this.data.days[date]){this.data.days[date]=this.assignment(date);this.save();}
    const today=this.data.days[date];
    let changed=false;
    if(!storedDailyCycles(today.goalCycles)){today.goalCycles=this.dailyCycles();changed=true;}
    // 과거 기록은 그대로 두고 오늘의 기존 배정만 정답을 유지하며 확장한다.
    if(!today.queries){
      Object.assign(today,normalizeTodayCycle(today));
      changed=true;
    }
    if(changed)this.save();
    return today;
  }
  startExtra(){
    const current=this.today();
    // 진행 중인 배정은 유지하므로 중복 클릭으로 사이클을 건너뛰지 않는다.
    if(cycleComplete(current)&&cards.some(c=>!this.data.records[c.id]?.passed)){
      const {completedCycles=[],...finished}=current;
      this.data.days[current.date]={...this.assignment(current.date),goalCycles:current.goalCycles,completedCycles:[...completedCycles,finished]};
      this.save();
    }
    return this.snapshot();
  }
  snapshot(){
    const today=this.today(),date=today.date;
    const history=Object.fromEntries(Object.entries(this.data.days).map(([date,d])=>{
      const cycles=[...(d.completedCycles||[]),d];
      // 기존 사이클 집계는 보존하고 배정 밖 정답만 중복 없이 더한다.
      const assigned=cycles.flatMap(c=>c.done.filter(id=>c.blanks.includes(id)));
      const blankCount=cycles.reduce((sum,c)=>sum+new Set(c.done.filter(id=>c.blanks.includes(id))).size,0)+new Set(cycles.flatMap(c=>c.learnedBlanks||[]).filter(id=>!assigned.includes(id))).size;
      const queryCount=cycles.reduce((sum,c)=>sum+(c.queries?new Set(c.queriesDone.filter(id=>c.queries.includes(id))).size:Number(c.queryDone)),0);
      const goalCycles=storedDailyCycles(d.goalCycles),count=completedCycleCount(d);
      const goalComplete=goalCycles===null?count>0:count>=goalCycles;
      return [date,{blankCount,queryCount,queryDone:queryCount>0,total:blankCount+queryCount,complete:goalComplete,goalComplete,goalCycles,completedCycles:goalCycles===null?null:count,completedCycleCount:goalCycles===null?null:count,cycleDetailAvailable:goalCycles!==null}];
    }));
    const hasMore=cards.some(c=>!this.data.records[c.id]?.passed),decoratedToday={...today,...learningGoal(this.data,date),currentCycleComplete:cycleComplete(today)};
    return {today:decoratedToday,history,hasMore,settings:{dailyCycles:this.dailyCycles()},dailyGoal:{cycles:today.goalCycles,blankCount:today.goalCycles*6,queryCount:today.goalCycles*2,total:today.goalCycles*8},records:this.data.records,units:units.map(({items,cards,...unit})=>({...unit,cards:cards.map(({answer,explanation,...card})=>({...card,tables:tablesFor(card)}))})),
      due:Object.entries(this.data.records).filter(([,r])=>r.due&&r.due<=date&&r.reviewCount<r.reviewTotal).map(([id,r])=>({id,...r})),
      completedDays:Object.values(history).filter(d=>d.complete).length};
  }
  record(id,kind,correct,review=false){
    const date=day(this.clock()),old=this.data.records[id]||{};
    const r={reviewCount:0,reviewTotal:0,reviewFailed:false,due:null,...old,kind,passed:correct||Boolean(old.passed),lastStatus:correct?'correct':'wrong',lastPassed:correct?date:old.lastPassed};
    // 복습일 전 제출·일반 연습은 예약과 회차를 앞당기지 않는다.
    if(review&&r.due&&r.due<=date&&r.reviewCount<r.reviewTotal){
      if(!correct&&!r.reviewFailed){r.reviewTotal++;r.reviewFailed=true;}
      if(correct){
        r.reviewCount++;
        // 이번 회차에서 틀렸다면 정답으로 마무리한 다음 날 다시 복습한다.
        r.due=r.reviewCount<r.reviewTotal?this.after(r.reviewFailed?1:r.reviewCount===1?3:7):null;
        r.reviewFailed=false;
      }
    }else if(!correct&&!r.due){
      // 복습을 모두 마친 뒤 새로 틀리면 다음 날부터 기본 세 회차를 시작한다.
      r.reviewCount=0;r.reviewTotal=3;r.reviewFailed=false;r.due=this.after(1);
    }
    this.data.records[id]=r;
    this.save();
  }
  answer({id,answer,review=false}){
    const card=this.card(id);
    if(typeof review!=='boolean')throw new Error('복습 여부를 확인하세요.');
    if(typeof answer!=='string'||answer.length>200)throw new Error('답은 200자 이하의 문자열이어야 합니다.');
    if(!answer.trim())throw new Error('빈칸에 답을 입력하세요.');
    const correct=card.answer.includes('%')&&!card.answer.includes("'")?answer.trim()===card.answer:normalize(answer)===normalize(card.answer);
    const today=this.today();
    if(correct){
      today.learnedBlanks=[...new Set([...(today.learnedBlanks||[]),id])];
      if(today.blanks.includes(id)&&!today.done.includes(id))today.done.push(id);
    }
    this.record(id,'blank',correct,review);
    return {correct,explanation:correct?card.explanation:'아직 맞지 않습니다. 개념을 다시 읽거나 해설을 확인하세요.',snapshot:this.snapshot()};
  }
  reveal(id){const card=this.card(id);this.assist(id);return {answer:card.answer,explanation:card.explanation};}
  assist(id){
    if(!cards.some(c=>c.id===id)&&!(typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(id)&&!['constructor','prototype','__proto__'].includes(id)))throw new Error('학습 문제를 확인하세요.');
    const old=this.data.records[id]||{};
    this.data.records[id]={...old,assistedOn:day(this.clock())};this.save();
  }
  queryResult(id,result,review=false){
    if(result.status!=='correct'&&result.status!=='wrong'&&result.answerError!==true)return;
    const today=this.today(),correct=result.status==='correct';
    if(correct&&today.queries.includes(id)&&!today.queriesDone.includes(id))today.queriesDone.push(id);
    today.queryDone=today.queries.every(id=>today.queriesDone.includes(id));
    this.record(id,'query',correct,review);
  }
}
module.exports={Learning,learningGoal,cycleComplete};
