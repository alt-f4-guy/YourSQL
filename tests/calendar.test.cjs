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

// 두 번째 사이클이 진행 중이어도 하루 목표 달성과 누적 문제 수를 유지한다.
test('캘린더는 여러 사이클의 누적 문제 수를 표시한다',()=>{
  const history={'2026-09-06':{blankCount:6,queryCount:2,complete:true},'2026-09-07':{blankCount:4,queryCount:1,complete:true}};
  const month=calendarMonth(2026,8,'2026-09-07',history);
  assert.equal(month.days[5].total,8);assert.equal(month.days[5].queryCount,2);
  assert.equal(month.days[6].total,5);assert.equal(month.days[6].status,'complete');
  assert.equal(month.completed,2);
});
