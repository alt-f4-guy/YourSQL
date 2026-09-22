// 학습 화면은 기존 편집기의 선택·초안 저장·실제 채점 경로에 연결한다.
(() => {
  const $=id=>document.getElementById(id),api=window.practice;
  let data,workspace,mode='today',session=[],sessionIndex=0,sessionKind='daily',card,working=false;
  const drafts=new Map();
  let lastDailyState,reminderPending;
  let calendarDate,selectedDate;
  let queryLevel='all',querySearch='',catalogScroll=0;
  const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  const error=e=>{$('learning-error').textContent=e.message||String(e);$('learning-error').hidden=false;};
  const safely=fn=>async(...args)=>{try{await fn(...args);}catch(e){error(e);}};
  const allCards=()=>data.units.flatMap(unit=>unit.cards);
  const problem=id=>workspace?.problems.find(p=>p.id===id);
  const title=id=>allCards().find(c=>c.id===id)?.title||problem(id)?.title||id;
  const reviews=()=>data.due;
  // 당일 복습 없음과 학습 기록 없음을 구분한다.
  const reviewEmpty=()=>{const next=Object.values(data.records).filter(r=>r.kind&&r.due>data.today.date).map(r=>r.due).sort()[0];return next?`오늘 복습할 문제는 없어요. 다음 복습: ${next.replaceAll('-','.')}`:'예정된 복습이 없어요. 풀이 중 틀린 문제만 복습에 등록됩니다.';};
  const reviewDetail=item=>`${item.reviewCount}/${item.reviewTotal}회 완료 · 복습일 ${item.due}${item.reviewFailed?' · 정답으로 마무리하면 다음 날 다시 복습':''}`;
  const reviewNotice=id=>{
    const r=data.records[id];if(!r?.due)return '';
    const date=r.due.replaceAll('-','.');
    return !r.reviewCount&&!r.reviewFailed?`복습에 등록되었습니다. 첫 복습: ${date} · 기본 ${r.reviewTotal}회`:`복습 일정: ${date} · 총 ${r.reviewTotal}회${r.reviewFailed?' · 1회 추가됨. 정답으로 마무리하면 다음 날 다시 복습합니다.':''}`;
  };
  const dailyGoal=()=>data.dailyGoal||{cycles:data.today.goalCycles||data.settings?.dailyCycles||1,blankCount:(data.today.goalCycles||1)*6,queryCount:(data.today.goalCycles||1)*2,total:(data.today.goalCycles||1)*8};
  function renderGoalPreview(value){
    const summary=$('daily-goal-summary');
    if(!Number.isSafeInteger(value)||value<1){summary.textContent='1 이상의 정수로 입력하세요.';return false;}
    summary.textContent=`${value}사이클 · 빈칸 ${value*6}개 + 쿼리 ${value*2}개 · 총 ${value*8}문제`;
    return true;
  }
  function renderGoalSettings(){
    const input=$('daily-goal-cycles'),cycles=data.settings?.dailyCycles||data.today.goalCycles||1;
    if(document.activeElement!==input)input.value=String(cycles);
    renderGoalPreview(Number(input.value));
  }
  // 완료로 바뀐 순간만 알리고 표시 날짜를 저장해 추가 학습·재시작 중복을 막는다.
  function showReviewReminder(){
    if(reminderPending!==data.today.date||!workspace||document.querySelector('dialog[open]'))return;
    if(localStorage.getItem('review-reminder-date')===reminderPending){reminderPending=null;return;}
    $('review-reminder-copy').textContent=reviews().length?`오늘 복습할 문제 ${reviews().length}개가 있어요. 지금 이어서 풀어볼까요?`:reviewEmpty();
    $('reminder-start-review').hidden=!reviews().length;
    $('review-reminder-dialog').showModal();
    localStorage.setItem('review-reminder-date',reminderPending);reminderPending=null;
  }
  async function refresh(){data=await api.learning();render();}
  function render(){
    const t=data.today,total=t.done.length+t.queriesDone.length,due=reviews(),goal=dailyGoal(),goalCycles=goal.cycles,completedCycles=t.completedCycleCount??0,currentComplete=Boolean(t.currentCycleComplete),goalComplete=Boolean(t.goalComplete??data.history[t.date]?.complete),courseComplete=Boolean(t.courseComplete),cycleNumber=(t.completedCycles?.length||0)+1,extraCycles=Math.max(0,completedCycles-goalCycles),goalProgress=Math.min(completedCycles,goalCycles);
    if(lastDailyState?.date===t.date&&!lastDailyState.complete&&goalComplete)reminderPending=t.date;
    lastDailyState={date:t.date,complete:goalComplete};
    $('today-date').textContent=`${t.date.replaceAll('-','.')} · 오늘의 루틴`;
    $('daily-cycle').textContent=courseComplete&&!t.blanks.length?'새로 배정할 사이클 없음':`${cycleNumber}번째 사이클 · 빈칸 6 + 쿼리 2`;
    $('completed-days').textContent=`하루 목표 달성 ${data.completedDays}일`;
    $('daily-goal-detail').textContent=extraCycles?`오늘 목표 ${goalProgress} / ${goalCycles}사이클 달성 · 추가 ${extraCycles}사이클 완료`:`오늘 목표 ${goalProgress} / ${goalCycles}사이클 ${goalComplete?'달성':'완료'}`;
    $('daily-title').textContent=courseComplete?'전체 과정을 완료했어요':goalComplete?'오늘의 목표를 모두 마쳤어요!':currentComplete?'사이클을 마쳤어요':data.units.find(u=>u.id===t.unit||u.queries.includes(t.queries[0]))?.title||'오늘의 SQL 연습';
    $('daily-copy').textContent=courseComplete?'모든 개념 과정을 마쳤어요. 복습과 단원별 다시 풀기로 기억을 다져 보세요.':goalComplete?(due.length?`오늘 복습할 문제 ${due.length}개가 있어요.`:'오늘 목표를 달성했어요. 복습하거나 추가 학습을 이어서 해 보세요.'):currentComplete?'이 사이클을 마쳤어요. 다음 사이클을 시작하면 오늘 목표에 계속 반영됩니다.':'빈칸 여섯 문제, 쿼리 두 문제. 오늘도 차근차근 쌓아가요.';
    $('daily-count').replaceChildren(node('span',String(total)),node('span','/ 8'));
    $('daily-progress').value=total;$('daily-detail').textContent=`빈칸 ${t.done.length}/6 · 쿼리 ${t.queriesDone.length}/2 · 오늘 총 ${data.history[t.date].total}문제 완료`;
    $('start-daily').disabled=!workspace;$('start-daily').hidden=currentComplete&&!due.length&&data.hasMore;$('start-daily').textContent=due.length?'복습 시작':courseComplete||currentComplete?'개념 목록 보기':total?'오늘 학습 이어하기':'오늘의 학습 시작';
    $('start-extra').hidden=!currentComplete||!data.hasMore;$('start-extra').disabled=!workspace||!data.hasMore;
    $('start-extra').classList.toggle('secondary',due.length>0);
    $('start-extra').textContent=completedCycles<goalCycles?'다음 사이클 시작':'추가 학습하기';
    $('review-badge').textContent=due.length;
    renderGoalSettings();
    renderHome(t,due);
    renderQueryMission();
    renderCalendar();
    renderCatalog();
    const cards=allCards(),passed=cards.filter(c=>data.records[c.id]?.passed).length,finished=data.units.filter(u=>u.cards.every(c=>data.records[c.id]?.passed)).length;
    $('concept-progress-summary').textContent=`전체 진도 ${Math.round(passed/cards.length*100)}%`;
    $('concept-progress-bar').max=cards.length;$('concept-progress-bar').value=passed;
    $('concept-progress-detail').textContent=`${cards.length}문제 중 ${passed}문제 완료 · ${data.units.length}단원 중 ${finished}단원 완료`;
    for(const target of ['concept-units']){
      $(target).replaceChildren();
      data.units.forEach((unit,index)=>{
        if(index===0||data.units[index-1].level!==unit.level){const heading=node('h3',`${unit.level}단계 · ${workspace?.levels[unit.level-1]?.name||'개념 과정'}`,'curriculum-heading');$(target).append(heading);}
        const count=unit.cards.filter(c=>data.records[c.id]?.passed).length;
        const b=node('button',undefined,'unit-card');b.type='button';b.append(node('span',String(index+1).padStart(2,'0'),'unit-number'));
        const needsReview=due.some(item=>unit.cards.some(c=>c.id===item.id));
        const state=count===unit.cards.length?'완료':count?'진행 중':'시작 전';
        const copy=node('span');copy.append(node('strong',unit.title),node('small',`${unit.cards.length}문제 중 ${count}문제 완료 · ${Math.round(count/unit.cards.length*100)}% · ${state}${needsReview?' · 복습 필요':''} · 기본 + 변형`));const bar=node('progress');bar.max=unit.cards.length;bar.value=count;bar.setAttribute('aria-label',`${unit.title} 완료율`);copy.className='unit-copy';copy.append(bar);b.append(copy,node('span',count===unit.cards.length?'✓ 완료 · 다시 풀기':'단원 열기 →','unit-state'));
        b.addEventListener('click',safely(()=>startSession(unit.cards.map(c=>c.id),'practice')));$(target).append(b);
      });
    }
    renderReview($('review-list'),due,true);
    renderReview($('upcoming-list'),Object.entries(data.records).filter(([,r])=>r.kind&&r.due>t.date).map(([id,r])=>({id,...r})).sort((a,b)=>a.due.localeCompare(b.due)),false);
    $('start-review').disabled=!due.length||!workspace;
    showReviewReminder();
  }
  function renderHome(today,due){
    const review=$('home-review');review.replaceChildren();
    const items=[...due].sort((a,b)=>Number(b.lastStatus==='wrong')-Number(a.lastStatus==='wrong')||(a.due||'').localeCompare(b.due||'')).slice(0,5);
    $('home-review-summary').textContent=due.length?`${due.length}문제 대기`:'지금은 없음';
    if(!items.length) review.append(node('p',reviewEmpty(),'home-empty'));
    for(const item of items){
      const row=node('button',undefined,'home-row');row.type='button';
      const copy=node('span');copy.append(node('strong',title(item.id)),node('small',`${item.kind==='blank'?'개념':'쿼리'} · ${reviewDetail(item)}`));
      row.append(copy,node('span','열기 →','home-row-action'));row.addEventListener('click',safely(()=>item.kind==='blank'?startSession([item.id],'review'):openQuery(item.id,true)));review.append(row);
    }
    const progress=$('home-progress');progress.replaceChildren();
    const levels=[...new Set(data.units.map(unit=>unit.level))];
    levels.forEach(level=>{
      const levelUnits=data.units.filter(unit=>unit.level===level),total=levelUnits.reduce((sum,unit)=>sum+unit.cards.length,0),done=levelUnits.reduce((sum,unit)=>sum+unit.cards.filter(card=>data.records[card.id]?.passed).length,0);
      const row=node('div',undefined,'home-row'),copy=node('span');copy.append(node('strong',`${level}단계 · ${workspace?.levels[level-1]?.name||'개념 과정'}`),node('small',done===total?'완료':done?'진행 중':'시작 전'));row.append(copy,node('span',`${total}문제 중 ${done}문제 완료 · ${Math.round(done/total*100)}%`,'home-row-meta'));progress.append(row);
    });
    const activity=$('home-activity');activity.replaceChildren();
    const days=Object.entries(data.history).filter(([,entry])=>entry.total>0).sort(([a],[b])=>b.localeCompare(a)).slice(0,5);
    if(!days.length) activity.append(node('p','아직 저장된 학습 기록이 없습니다.','home-empty'));
    days.forEach(([date,entry])=>{const row=node('div',undefined,'home-row'),status=entry.complete?'목표 달성':`${entry.total}문제`;row.append(node('span',date.replaceAll('-','.'),'home-date'),node('span',status,'home-row-meta'));activity.append(row);});
  }
  function renderCalendar(){
    const today=data.today.date;
    if(!calendarDate)calendarDate=new Date(`${today}T12:00:00`);
    if(!selectedDate)selectedDate=calendarDate.getFullYear()===Number(today.slice(0,4))?today:`${calendarDate.getFullYear()}-01-01`;
    const month=calendarYear(calendarDate.getFullYear(),today,data.history);
    $('calendar-month').textContent=`${month.year}년`;
    $('calendar-next').disabled=month.year>=Number(today.slice(0,4));
    $('activity-summary').textContent=`${month.days.filter(d=>d.total>0&&d.status!=='future').length}일 학습 · ${month.days.filter(d=>d.status!=='future').reduce((sum,d)=>sum+d.total,0)}문제 완료 · 목표 달성 ${month.completed}일`;
    $('calendar-days').replaceChildren();
    for(let i=0;i<month.offset;i++)$('calendar-days').append(node('span'));
    for(const d of month.days){
      const b=node('button',undefined,'calendar-day');b.type='button';b.dataset.date=d.date;b.dataset.status=d.status;
      b.dataset.intensity=d.total>=16?'4':d.total>=8?'3':d.total>=4?'2':d.total?'1':'0';
      b.tabIndex=d.date===selectedDate?0:-1;
      b.disabled=d.status==='future';b.setAttribute('aria-pressed',String(d.date===selectedDate));
      if(d.date===today)b.setAttribute('aria-current','date');
      b.setAttribute('aria-label',`${d.date} · ${d.status==='future'?'예정':`${d.total}문제 완료${d.status==='complete'?' · 목표 달성':''}`}`);
      b.title=b.getAttribute('aria-label');
      b.append(node('small',d.total?`${d.total}${d.status==='complete'?' ✓':''}`:'·','sr-only'));
      b.addEventListener('click',()=>{selectedDate=d.date;renderCalendar();$('calendar-days').querySelector(`[data-date="${selectedDate}"]`).focus({preventScroll:true});});$('calendar-days').append(b);
    }
    const selected=month.days.find(d=>d.date===selectedDate)||month.days[0];
    const cycleDetail=selected.goalCycles===null?'사이클 상세를 확인할 수 없는 기존 기록입니다.':`목표 ${selected.goalCycles}사이클 · ${selected.completedCycles??0}사이클 완료`;
    $('calendar-detail').replaceChildren(node('h2',`${selected.date.replaceAll('-','.')}의 기록`),node('p',selected.status==='complete'?'하루 목표 달성!':selected.recorded?'조금씩 쌓는 중':'저장된 학습 기록이 없어요'),node('strong',`${selected.total}문제 완료`),node('p',`빈칸 ${selected.blankCount}개 · 쿼리 ${selected.queryCount}개`),node('p',cycleDetail));
  }
  for(const [id,offset] of [['calendar-prev',-1],['calendar-next',1]])$(id).addEventListener('click',()=>{calendarDate=new Date(calendarDate.getFullYear()+offset,0,1);selectedDate=null;renderCalendar();});
  // 한 번의 탭으로 진입하고 방향키로 일·주 단위 이동한다.
  $('calendar-days').addEventListener('keydown',e=>{const offset={ArrowUp:-1,ArrowDown:1,ArrowLeft:-7,ArrowRight:7}[e.key];if(!offset||!e.target.dataset.date)return;e.preventDefault();const days=[...$('calendar-days').querySelectorAll('button')],next=days[days.indexOf(e.target)+offset];if(next&&!next.disabled)next.click();});
  $('calendar-today').addEventListener('click',()=>{calendarDate=null;selectedDate=null;renderCalendar();});
  // 기존 문제·단계·풀이 상태를 재사용하고 목록 화면에서만 탐색한다.
  function renderQueryMission(){
    const current=workspace?.current(),t=data.today;
    const reviewing=current&&!$('review-banner').hidden;
    if(reviewing){
      const pending=reviews().some(item=>item.id===current),next=reviews().find(item=>item.kind==='query'&&item.id!==current);
      $('query-mission').textContent=`복습 · ${title(current)}`;
      $('next-query-label').textContent=next?'다음 복습 쿼리 →':'복습 목록으로 →';
      $('next-daily-query').hidden=pending;
      return;
    }
    const index=t.queries.indexOf(current);
    $('query-mission').textContent=index>=0?`오늘의 쿼리 ${index+1} / ${t.queries.length} · ${title(current)} · ${t.queriesDone.includes(current)?'완료':'정답 제출 시 하루 목표에 반영'}`:current?`${problem(current)?.level}단계 · ${title(current)}`:'문제를 선택하세요';
    $('next-query-label').textContent='다음 쿼리 풀기 →';
    $('next-daily-query').hidden=index<0||!t.queriesDone.includes(current)||t.queryDone;
  }
  function renderCatalog(){
    const problems=workspace?.problems||[],levels=workspace?.levels||[];
    $('query-levels').replaceChildren();
    for(const [id,label] of [['all','전체 문제'],...levels.map((level,i)=>[String(i+1),`${i+1}단계 · ${level.name}`])]){
      const button=node('button',label,'query-level');button.type='button';button.dataset.queryLevel=id;button.setAttribute('aria-pressed',String(queryLevel===id));
      button.addEventListener('click',()=>{queryLevel=id;catalogScroll=0;renderCatalog();});$('query-levels').append(button);
    }
    const search=querySearch.trim().toLocaleLowerCase('ko');
    const filtered=problems.filter(p=>(queryLevel==='all'||String(p.level)===queryLevel)&&(!search||`${p.title} ${p.topic}`.toLocaleLowerCase('ko').includes(search)));
    $('catalog-count').textContent=`${filtered.length}개 문제`;$('catalog-rows').replaceChildren();
    for(const p of filtered){
      const row=node('tr'),progress=workspace.progress()[p.id]||{},name=node('td'),button=node('button',p.title,'catalog-title');
      button.type='button';button.dataset.problemId=p.id;
      row.addEventListener('click',safely(()=>openQuery(p.id)));name.append(button);
      row.append(node('td',progress.solved?'완료':progress.attempts?'도전 중':'미풀이',progress.solved?'catalog-solved':''),name,node('td',`${p.level}단계`,'catalog-level'),node('td',p.topic));$('catalog-rows').append(row);
    }
    if(!filtered.length){const row=node('tr'),cell=node('td',workspace?'조건에 맞는 문제가 없습니다.':'문제를 불러오는 중입니다.','catalog-empty');cell.colSpan=4;row.append(cell);$('catalog-rows').append(row);}
    $('open-daily-query').disabled=!workspace;
  }
  function renderReview(target,items,available){
    target.replaceChildren();
    if(!items.length){target.append(node('p',available?reviewEmpty():'예정된 복습이 없습니다.','review-empty'));return;}
    for(const item of items){
      const row=node('article',undefined,'review-item'),copy=node('div');copy.append(node('strong',title(item.id)),node('p',`${item.kind==='blank'?'빈칸':'쿼리 작성'} · ${reviewDetail(item)}`));row.append(copy);
      if(available){const b=node('button','다시 풀기','button');b.addEventListener('click',safely(()=>item.kind==='blank'?startSession([item.id],'review'):openQuery(item.id,true)));row.append(b);}target.append(row);
    }
  }
  async function show(next){
    if(working||workspace?.busy())return false;
    if(workspace&&!await workspace.saveDraft())return false;
    if(card&&$('blank-input'))drafts.set(card.id,$('blank-input').value);
    if(mode==='catalog')catalogScroll=$('learning-screen').scrollTop;
    mode=next;document.body.dataset.mode=next;
    $('workspace').hidden=next!=='query';$('query-learning-bar').hidden=next!=='query';$('learning-screen').hidden=next==='query';
    for(const name of ['today','concept','review','lesson','catalog','activity'])$(`${name}-screen`).hidden=name!==next;
    document.querySelectorAll('.learning-nav [data-mode]').forEach(b=>{if(b.dataset.mode===next||(next==='catalog'&&b.dataset.mode==='query')||(next==='lesson'&&b.dataset.mode===(sessionKind==='review'?'review':'concept')))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(next!=='query'){$('learning-screen').scrollTop=next==='catalog'?catalogScroll:0;$('learning-screen').focus();}
    return true;
  }
  async function openQuery(id=data.today.queries.find(id=>!data.today.queriesDone.includes(id))||data.today.queries[0],review=false){
    if(!workspace)return;
    if(!await show('query'))return;
    await workspace.selectProblem(id,review);
    renderQueryMission();
  }
  async function startSession(ids,kind){
    if(!ids.length){await show('today');return;}
    if(working||workspace?.busy()||$('daily-concept-dialog').open)return;
    session=ids;sessionIndex=0;sessionKind=kind;
    if(kind==='daily'){
      const unit=data.units[allCards().find(c=>c.id===ids[0]).unit];
      $('daily-concept-title').textContent=unit.title;$('daily-concept-copy').textContent=unit.concept;
      $('daily-concept-dialog').showModal();return;
    }
    if(await show('lesson'))renderCard();
  }
  $('begin-blanks').addEventListener('click',safely(async()=>{$('daily-concept-dialog').close();if(await show('lesson'))renderCard();}));
  function renderCard(){
    card=allCards().find(c=>c.id===session[sessionIndex]);
    const unit=data.units[card.unit];
    $('session-position').textContent=`${sessionKind==='review'?'복습':sessionKind==='daily'?'오늘의 빈칸':'단원 연습'} · ${sessionIndex+1} / ${session.length}`;
    $('session-progress').max=session.length;$('session-progress').value=sessionIndex;
    $('lesson-unit').textContent=unit.title;$('lesson-title').textContent=card.title;$('lesson-prompt').textContent=card.prompt;
    workspace?.renderTables(card.tables,$('lesson-schema'),$('lesson-samples'));
    $('lesson-concept').textContent=unit.concept;$('concept-note').open=false;
    const [before,after]=card.sql.split('___'),input=node('input');input.id='blank-input';input.setAttribute('aria-label','SQL 빈칸 정답');input.autocomplete='off';input.spellcheck=false;input.maxLength=200;input.value=drafts.get(card.id)||'';
    input.addEventListener('input',()=>drafts.set(card.id,input.value));
    $('blank-code').replaceChildren(document.createTextNode(before),input,document.createTextNode(after));
    $('blank-feedback').hidden=true;$('next-blank').hidden=true;$('blank-check').disabled=false;$('blank-reveal').disabled=false;input.focus();
  }
  async function daily(){await refresh();const ids=data.today.blanks.filter(id=>!data.today.done.includes(id));if(ids.length)await startSession(ids,'daily');else if(!data.today.queryDone)await openQuery();else if(reviews().length)await startReview();else if(data.today.courseComplete||data.today.currentCycleComplete)await show('concept');else await show('today');}
  async function startReview(){const items=reviews(),ids=items.filter(r=>r.kind==='blank').map(r=>r.id);if(ids.length)await startSession(ids,'review');else if(items.length)await openQuery(items[0].id,true);}
  async function next(){
    drafts.delete(card.id);
    if(++sessionIndex<session.length){renderCard();return;}
    await refresh();
    if(sessionKind==='daily'&&!data.today.queryDone)await openQuery();else await show(sessionKind==='review'?'review':'today');
  }
  $('blank-form').addEventListener('submit',safely(async e=>{
    e.preventDefault();if(working)return;working=true;$('blank-check').disabled=true;
    try{
      const result=await api.blankAnswer({id:card.id,answer:$('blank-input').value,review:sessionKind==='review'});data=result.snapshot;render();
      const feedback=$('blank-feedback');feedback.hidden=false;feedback.dataset.correct=String(result.correct);feedback.textContent=(result.correct?'정답이에요. ':'')+result.explanation+(result.correct&&sessionKind!=='review'?'':` ${reviewNotice(card.id)}`);
      if(result.correct){$('blank-input').disabled=true;$('blank-reveal').disabled=true;$('next-blank').hidden=false;$('next-blank').textContent=sessionIndex+1<session.length?'다음 문제 →':sessionKind==='daily'&&!data.today.queryDone?'전체 쿼리 작성으로 →':'학습 마치기';$('next-blank').focus();}else $('blank-input').focus();
    }finally{working=false;$('blank-check').disabled=$('blank-input').disabled;}
  }));
  $('blank-reveal').addEventListener('click',safely(async()=>{
    if(working)return;working=true;
    try{const result=await api.blankReveal(card.id);$('blank-feedback').hidden=false;$('blank-feedback').dataset.correct='false';$('blank-feedback').textContent=`정답: ${result.answer} — ${result.explanation} 직접 입력해 마무리하세요.`;$('blank-input').focus();}finally{working=false;}
  }));
  $('next-blank').addEventListener('click',safely(next));
  $('leave-lesson').addEventListener('click',safely(()=>show(sessionKind==='review'?'review':'concept')));
  $('start-daily').addEventListener('click',safely(daily));
  $('start-extra').addEventListener('click',safely(async()=>{
    if(working||!workspace||workspace.busy())return;
    if(!await workspace.saveDraft())return;
    working=true;$('start-extra').disabled=true;
    try{data=await api.startExtra();render();}finally{working=false;}
    await daily();
  }));
  $('start-blanks').addEventListener('click',safely(async()=>{await refresh();const ids=data.today.blanks.filter(id=>!data.today.done.includes(id));await startSession(ids.length?ids:data.today.blanks,'daily');}));
  $('start-review').addEventListener('click',safely(startReview));
  $('reminder-start-review').addEventListener('click',safely(async()=>{
    $('review-reminder-dialog').close();await refresh();
    if(reviews().length)await startReview();else await show('review');
  }));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',safely(showReviewReminder)));
  $('query-search').addEventListener('input',()=>{querySearch=$('query-search').value;catalogScroll=0;renderCatalog();});
  $('query-back').addEventListener('click',safely(async()=>{await refresh();await show('catalog');}));
  // 버튼과 단축키는 같은 저장·이동 경로를 사용하고 중복 입력을 막는다.
  let movingQuery=false;
  async function nextQuery(){
    if(movingQuery||working||workspace?.busy()||mode!=='query'||$('next-daily-query').hidden||document.querySelector('dialog[open]'))return;
    movingQuery=true;
    try{
      if(!$('review-banner').hidden){
        const current=workspace.current();await refresh();
        const next=reviews().find(item=>item.kind==='query'&&item.id!==current);
        if(next)await openQuery(next.id,true);else await show('review');
      }else await openQuery();
    }finally{movingQuery=false;}
  }
  $('next-daily-query').addEventListener('click',safely(nextQuery));
  document.addEventListener('keydown',safely(async e=>{
    if(e.isComposing||!(e.metaKey||e.ctrlKey)||!e.altKey||e.shiftKey||e.key!=='Enter'||mode!=='query')return;
    e.preventDefault();
    if(!e.repeat)await nextQuery();
  }));
  $('open-daily-query').addEventListener('click',safely(()=>openQuery()));
  $('query-return').addEventListener('click',safely(async()=>{await refresh();await show('today');}));
  document.querySelectorAll('.learning-nav [data-mode], [data-open]').forEach(b=>b.addEventListener('click',safely(async()=>{await refresh();const next=b.dataset.mode||b.dataset.open;await show(next==='query'?'catalog':next);}))); 
  $('daily-goal-cycles').addEventListener('input',()=>{const valid=renderGoalPreview(Number($('daily-goal-cycles').value));$('daily-goal-status').hidden=valid;});
  $('save-daily-goal').addEventListener('click',safely(async()=>{
    const input=$('daily-goal-cycles'),value=Number(input.value),status=$('daily-goal-status');
    if(!renderGoalPreview(value)){status.textContent='하루 목표 사이클은 1 이상의 정수로 입력해 주세요.';status.hidden=false;input.focus();return;}
    const button=$('save-daily-goal');button.disabled=true;
    try{data=await api.setDailyGoal(value);render();status.textContent='하루 목표를 저장했어요. 오늘부터 적용됩니다.';status.hidden=false;}
    catch(error){status.textContent=error.message||'하루 목표를 저장하지 못했습니다.';status.hidden=false;}
    finally{button.disabled=false;}
  }));
  let reminderState,reminderBusy=false;
  function renderReminder(value){
    reminderState=value;$('reminder-enabled').checked=value.enabled;
    const status=value.status==='registration-error'?'등록 실패':value.enabled?'권한 확인 필요 · 오후 8시 검사 사용 중':'꺼짐';
    $('reminder-status').textContent=value.lastError?`${status} · ${value.lastError}`:value.enabled?`${status} · 시스템 설정에서 YourSQL 알림을 허용해 주세요.`:status;
    $('retry-reminder').hidden=value.status!=='registration-error';
  }
  async function reminderAction(action){
    if(reminderBusy)return;reminderBusy=true;
    for(const id of ['reminder-enabled','test-reminder','retry-reminder'])$(id).disabled=true;
    try{await action();}catch(e){if(reminderState)$('reminder-enabled').checked=reminderState.enabled;$('reminder-status').textContent=`알림 설정을 확인하지 못했어요. ${e.message}`;}
    finally{reminderBusy=false;for(const id of ['reminder-enabled','test-reminder','retry-reminder'])$(id).disabled=false;}
  }
  $('reminder-enabled').addEventListener('change',()=>void reminderAction(async()=>renderReminder(await api.setReminderEnabled($('reminder-enabled').checked))));
  $('retry-reminder').addEventListener('click',()=>void reminderAction(async()=>renderReminder(await api.setReminderEnabled(reminderState?.enabled||!reminderState?.registeredPath))));
  $('test-reminder').addEventListener('click',()=>void reminderAction(async()=>{
    $('reminder-status').textContent='테스트 알림을 요청하고 있어요…';
    const result=await api.testReminder();renderReminder(await api.reminderState());
    if(result.requested)$('reminder-status').textContent='테스트 알림을 요청했어요. 보이지 않으면 시스템 알림 설정과 집중 모드를 확인해 주세요.';
  }));
  api.onReminderChanged(renderReminder);
  api.onReminderOpen(safely(async()=>{
    await refresh();
    if(await show('today'))for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  }));
  $('open-settings').addEventListener('click',safely(async()=>{await refresh();renderReminder(await api.reminderState());$('settings-dialog').showModal();}));
  for(const id of ['hint','solution'])$(id).addEventListener('click',safely(async()=>{if(workspace?.current())await api.learningAssist(workspace.current());}));
  window.learningUI={
    ready(value){workspace=value;void safely(refresh)();},
    async reviewNotice(id){await refresh();return reviewNotice(id);},
    refresh:safely(refresh)
  };
  // 빈칸 학습은 MySQL 시작을 기다리지 않아도 표시한다. 자정 이후에는 새 배정을 읽는다.
  void safely(refresh)();
  window.addEventListener('focus',safely(refresh));
})();
