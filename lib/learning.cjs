// 버전 0.0.1만의 일일 학습·간격 복습 저장소. 기존 SQL 채점은 PracticeService를 사용한다.
const fs=require('node:fs');
const path=require('node:path');
const {atomicJSON}=require('./core.cjs');
const units=require('../content/lessons.cjs');
const cards=units.flatMap(unit=>unit.cards);
const day=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
// 따옴표 안의 값은 보존하고 SQL 키워드만 대소문자를 무시한다.
const normalize=value=>value.trim().split(/('(?:''|[^'])*')/).map((part,i)=>i%2?part:part.replace(/\s+/g,' ').toUpperCase()).join('');
class Learning {
  constructor(directory,clock=()=>new Date()) {
    this.clock=clock;
    this.file=path.join(directory,'learning.json');
    // 기존 기록은 읽기만 하고 이후 저장부터 버전 없는 파일 이름을 사용한다.
    const source=fs.existsSync(this.file)?this.file:path.join(directory,'learning-v2.json');
    this.data=fs.existsSync(source)?JSON.parse(fs.readFileSync(source,'utf8')):{days:{},records:{}};
  }
  save(){atomicJSON(this.file,this.data);}
  card(id){const card=cards.find(c=>c.id===id);if(!card)throw new Error('빈칸 문제를 찾을 수 없습니다.');return card;}
  // 일일 학습과 추가 학습은 같은 순서로 다음 3+1 문제를 배정한다.
  assignment(date){
    const records=this.data.records;
    const unit=units.find(u=>u.cards.some(c=>!records[c.id]?.passed))||[...units].sort((a,b)=>Math.min(...a.cards.map(c=>Date.parse(records[c.id]?.due||date)))-Math.min(...b.cards.map(c=>Date.parse(records[c.id]?.due||date))))[0];
    const chosen=[...unit.cards].sort((a,b)=>Number(Boolean(records[a.id]?.passed))-Number(Boolean(records[b.id]?.passed))||(records[a.id]?.due||'').localeCompare(records[b.id]?.due||'')).slice(0,3);
    const query=unit.queries[unit.cards.slice(0,3).every(c=>records[c.id]?.passed)?1:0];
    return {date,unit:unit.id,blanks:chosen.map(c=>c.id),query,done:[],queryDone:false};
  }
  today(){
    const date=day(this.clock());
    if(!this.data.days[date]){this.data.days[date]=this.assignment(date);this.save();}
    return this.data.days[date];
  }
  startExtra(){
    const current=this.today();
    // 진행 중인 배정은 유지하므로 중복 클릭으로 사이클을 건너뛰지 않는다.
    if(current.done.length===3&&current.queryDone&&cards.some(c=>!this.data.records[c.id]?.passed)){
      const {completedCycles=[],...finished}=current;
      this.data.days[current.date]={...this.assignment(current.date),completedCycles:[...completedCycles,finished]};
      this.save();
    }
    return this.snapshot();
  }
  snapshot(){
    const today=this.today(),date=today.date;
    const history=Object.fromEntries(Object.entries(this.data.days).map(([date,d])=>{
      const cycles=[...(d.completedCycles||[]),d];
      const blankCount=cycles.reduce((sum,c)=>sum+new Set(c.done.filter(id=>c.blanks.includes(id))).size,0);
      const queryCount=cycles.filter(c=>c.queryDone).length;
      return [date,{blankCount,queryCount,queryDone:queryCount>0,total:blankCount+queryCount,complete:cycles.some(c=>new Set(c.done.filter(id=>c.blanks.includes(id))).size===3&&c.queryDone)}];
    }));
    return {today,history,hasMore:cards.some(c=>!this.data.records[c.id]?.passed),records:this.data.records,units:units.map(({items,cards,...unit})=>({...unit,cards:cards.map(({answer,explanation,...card})=>card)})),
      due:Object.entries(this.data.records).filter(([,r])=>r.due<=date).map(([id,r])=>({id,...r})),
      completedDays:Object.values(history).filter(d=>d.complete).length};
  }
  record(id,kind,correct){
    const date=day(this.clock()),old=this.data.records[id]||{};
    const assisted=old.assistedOn===date;
    const step=correct?(assisted?1:Math.min((old.step||0)+1,4)):0;
    const next=new Date(this.clock());
    next.setDate(next.getDate()+[1,1,3,7,14][step]);
    // 같은 날 반복 정답을 제출해도 복습 간격이 계속 늘어나지 않는다.
    if(correct&&old.lastPassed===date&&old.lastStatus==='correct'){this.save();return;}
    this.data.records[id]={...old,kind,passed:correct||Boolean(old.passed),step,due:day(next),lastStatus:correct?'correct':'wrong',lastPassed:correct?date:old.lastPassed};
    this.save();
  }
  answer({id,answer}){
    const card=this.card(id);
    if(typeof answer!=='string'||answer.length>200)throw new Error('답은 200자 이하의 문자열이어야 합니다.');
    if(!answer.trim())throw new Error('빈칸에 답을 입력하세요.');
    const correct=card.answer.includes('%')&&!card.answer.includes("'")?answer.trim()===card.answer:normalize(answer)===normalize(card.answer);
    const today=this.today();
    if(correct&&today.blanks.includes(id)&&!today.done.includes(id))today.done.push(id);
    this.record(id,'blank',correct);
    return {correct,explanation:correct?card.explanation:'아직 맞지 않습니다. 개념을 다시 읽거나 해설을 확인하세요.',snapshot:this.snapshot()};
  }
  reveal(id){const card=this.card(id);this.assist(id);return {answer:card.answer,explanation:card.explanation};}
  assist(id){
    if(!cards.some(c=>c.id===id)&&!(typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(id)&&!['constructor','prototype','__proto__'].includes(id)))throw new Error('학습 문제를 확인하세요.');
    const old=this.data.records[id]||{};
    const next=new Date(this.clock());next.setDate(next.getDate()+1);
    this.data.records[id]={...old,assistedOn:day(this.clock()),...(old.kind?{due:day(next),step:1}:{})};this.save();
  }
  queryResult(id,result){
    const today=this.today(),correct=result.status==='correct';
    if(correct&&today.query===id)today.queryDone=true;
    this.record(id,'query',correct);
  }
}
module.exports={Learning};
