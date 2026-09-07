// 현지 날짜 문자열로 비교해 시간대 변경과 윤년의 월 경계를 처리한다.
function calendarMonth(year,month,today,history){
  const first=new Date(year,month,1);year=first.getFullYear();month=first.getMonth();
  const days=Array.from({length:new Date(year,month+1,0).getDate()},(_,i)=>{
    const date=`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`,record=history[date];
    const blankCount=record?.blankCount||0,queryCount=record?.queryCount??Number(Boolean(record?.queryDone)),queryDone=queryCount>0,total=blankCount+queryCount;
    return {date,blankCount,queryCount,queryDone,total,recorded:Boolean(record),status:date>today?'future':(record?.complete??total>=4)?'complete':total?'partial':'none'};
  });
  return {year,month,offset:first.getDay(),days,completed:days.filter(d=>d.status==='complete').length};
}
// 월별 집계를 재사용해 윤년과 이전 기록의 완료 기준을 그대로 유지한다.
function calendarYear(year,today,history){
  const days=Array.from({length:12},(_,month)=>calendarMonth(year,month,today,history).days).flat();
  return {year,offset:new Date(year,0,1).getDay(),days,completed:days.filter(d=>d.status==='complete').length};
}
if(typeof module!=='undefined')module.exports={calendarMonth,calendarYear};
