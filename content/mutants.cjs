// 각 쿼리는 실행 가능하지만 문제의 특정 조건을 어긴다.
// 실제 MySQL에서 원래 정답과 비교해 최소 한 세트에서 차이가 나야 한다.
const packs = [require('./shop.json'), require('./academy.json')];
const problems = new Map(packs.flatMap(pack => pack.problems).map(p => [p.id, p]));
function mutate(id, before, after, reason) {
  const source = problems.get(id).solution;
  if (!source.includes(before)) throw new Error('변이 대상 구문이 없습니다: ' + id);
  return {id, sql: source.replaceAll(before, after), reason};
}
module.exports = [
  mutate('level1_04', "status='paid' AND ", '', '취소 주문을 1월 결제 주문에 포함한다. 공개와 hidden_edges에서 검출된다.'),
  mutate('level2_07', 'SUM(quantity*unit_price)', 'SUM(DISTINCT quantity*unit_price)', '서로 다른 동일 금액 상품 행을 제거한다. 공개 주문 3의 두 행으로 검출된다.'),
  mutate('level3_01', 'COUNT(o.order_id)', 'COUNT(*)', '주문 없는 고객의 확장 NULL 행을 1건으로 센다. 공개 고객 5로 검출된다.'),
  mutate('level3_07', 'LEFT JOIN order_items', 'JOIN order_items', '상품 없는 주문을 평균 분모에서 제외한다. hidden_sparse의 빈 주문 100과 주문액 200인 주문 90이 이를 구분한다.'),
  mutate('level4_02', 'DENSE_RANK()', 'ROW_NUMBER()', '같은 가격 상품에 서로 다른 순위를 부여한다. 공개 도서 분류 가격 동점에서 검출된다.'),
  mutate('level4_05', 'COALESCE(ROUND(100.0*revenue/NULLIF(SUM(revenue) OVER(),0),2),0)', 'ROUND(100.0*revenue/NULLIF(SUM(revenue) OVER(),0),2)', '전체 매출 0일 때 비율을 0 대신 NULL로 출력한다. hidden_empty_relations에서 검출된다.'),
  mutate('level4_09', 'FROM attempts)', 'FROM attempts WHERE score IS NOT NULL)', '최신 응시 선택 전에 미채점 응시를 제외한다. 공개 회원 2의 강좌 1에서 검출된다.'),
  mutate('level4_14', 'CUME_DIST() OVER(ORDER BY total_minutes)', 'CUME_DIST() OVER(ORDER BY total_minutes,member_id)', '누적 백분위의 동점을 회원 번호로 분리한다. hidden_ungraded의 총시간 0 동점에서 검출된다.'),
  mutate('level5_02', 'SELECT DISTINCT customer_id,ordered_at', 'SELECT customer_id,ordered_at', '하루 여러 주문을 별도 날짜처럼 순번에 넣어 연속 구간을 훼손한다. hidden_edges의 고객 2가 2월 1~4일 연속 결제하며 중간인 2월 2일에 중복 주문한 사례로 검출된다.'),
  {id:'level5_10', sql:'SELECT m.member_id,m.name FROM members m WHERE EXISTS(SELECT 1 FROM courses c JOIN enrollments e ON e.course_id=c.course_id WHERE c.required=1 AND e.member_id=m.member_id AND e.completed_at IS NOT NULL) ORDER BY m.member_id', reason:'모든 필수 강좌 대신 하나라도 완료한 회원을 선택한다. 공개 회원 3 및 필수 강좌가 없는 hidden_sparse에서 검출된다.'}
];
module.exports.push(...['extra-basic','extra-middle','extra-advanced'].flatMap(name=>require(`./${name}.cjs`)).filter(p=>p.wrongSql).map(p=>({id:p.id,sql:p.wrongSql,reason:'추가 문제의 핵심 조건 위반'})));
if (require.main === module) {
  const assert = require('node:assert/strict');
  assert.ok(module.exports.length >= 22);
  for (const mutant of module.exports) {
    assert.ok(problems.has(mutant.id));
    assert.notEqual(mutant.sql, problems.get(mutant.id).solution);
  }
  console.log(`변이 쿼리 ${module.exports.length}개 구조 검증 통과`);
}
