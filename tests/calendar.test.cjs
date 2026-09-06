// 월 길이·윤년·연말 경계 및 일부 완료를 달성으로 오인하는 회귀를 검사한다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calendarMonth}=require('../ui/calendar.js');
test('윤년 달력과 과거·미래·목표 완료 상태',()=>{
  const history={'2024-02-28':{blankCount:3,queryDone:false,complete:false},'2024-02-29':{blankCount:3,queryDone:true,complete:true}};
  const month=calendarMonth(2024,1,'2024-02-29',history);
  assert.equal(month.offset,4);assert.equal(month.days.length,29);
  assert.equal(month.days[27].status,'partial');assert.equal(month.days[28].status,'complete');
  assert.equal(month.days[0].status,'none');assert.equal(month.completed,1);
  assert.equal(calendarMonth(2025,1,'2025-02-28',{}).days.length,28);
  const next=calendarMonth(2024,12,'2024-12-31',{});
  assert.equal(next.days[0].date,'2025-01-01');assert.equal(next.days[0].status,'future');
});
