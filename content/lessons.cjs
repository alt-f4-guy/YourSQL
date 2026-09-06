// 직접 구성한 개념 과정이다. 각 단원의 세 빈칸을 푼 뒤 기존 문제에 적용한다.
const units = [
  {title:'필요한 행과 열 고르기',query:'level1_01',concept:'SELECT로 열을 선택하고 FROM으로 테이블을 지정합니다. WHERE는 조건을 만족하는 행만 남깁니다.',items:[
    ['열 선택','고객 이름만 조회하세요.','___ name FROM customers','SELECT','SELECT 뒤에 출력할 열을 씁니다.'],
    ['조회할 테이블','customers 테이블에서 이름을 조회하세요.','SELECT name ___ customers','FROM','FROM 뒤에 데이터를 읽을 테이블을 씁니다.'],
    ['행 조건','서울에 사는 고객만 남기세요.',"SELECT name FROM customers ___ city = '서울'",'WHERE','WHERE는 각 행의 조건을 검사합니다.']]},
  {title:'범위와 정렬',query:'level1_02',concept:'BETWEEN은 양 끝을 포함한 범위입니다. ORDER BY로 정렬하며 DESC는 내림차순입니다.',items:[
    ['범위 조건','1000 이상 3000 이하인 가격을 고르세요.','SELECT name FROM products WHERE price ___ 1000 AND 3000','BETWEEN','BETWEEN은 경곗값 1000과 3000도 포함합니다.'],
    ['정렬 절','가격을 기준으로 정렬하세요.','SELECT name, price FROM products ___ price','ORDER BY','정렬은 ORDER BY로 명시합니다.'],
    ['내림차순','비싼 상품부터 표시하세요.','SELECT name, price FROM products ORDER BY price ___','DESC','DESC는 큰 값부터, ASC는 작은 값부터 정렬합니다.']]},
  {title:'값이 없는 경우 다루기',query:'level1_03',concept:'NULL은 값이 없거나 알려지지 않은 상태입니다. = NULL 대신 IS NULL을 사용합니다.',items:[
    ['누락값 찾기','도시가 입력되지 않은 고객을 고르세요.','SELECT name FROM customers WHERE city ___','IS NULL','NULL 여부는 IS NULL로 검사합니다.'],
    ['입력값 찾기','도시가 입력된 고객만 고르세요.','SELECT name FROM customers WHERE city ___','IS NOT NULL','IS NOT NULL은 값이 있는 행을 선택합니다.'],
    ['대체값','도시가 NULL이면 미입력으로 표시하세요.',"SELECT ___(city, '미입력') FROM customers",'COALESCE','COALESCE는 인수 중 처음으로 NULL이 아닌 값을 반환합니다.']]},
  {title:'중복과 개수',query:'level1_05',concept:'DISTINCT는 출력 조합의 중복을 제거합니다. COUNT(*)는 행 수를 세고 COUNT(열)는 NULL을 제외합니다.',items:[
    ['중복 제거','상품 분류를 중복 없이 조회하세요.','SELECT ___ category FROM products','DISTINCT','DISTINCT는 SELECT에 적은 열 조합을 기준으로 중복을 제거합니다.'],
    ['행 개수','전체 고객 수를 구하세요.','SELECT ___(*) FROM customers','COUNT','COUNT(*)는 NULL 포함 여부와 관계없이 행을 셉니다.'],
    ['고유값 개수','중복되지 않는 도시 수를 구하세요.','SELECT COUNT(___ city) FROM customers','DISTINCT','COUNT(DISTINCT city)는 NULL을 제외한 서로 다른 도시 수입니다.']]},
  {title:'문자열 패턴',query:'level1_07',concept:'LIKE에서 %는 길이 0 이상의 문자열, _는 한 글자를 뜻합니다. 문자열 패턴은 따옴표로 감쌉니다.',items:[
    ['패턴 비교','이름에 노가 들어간 상품을 고르세요.',"SELECT name FROM products WHERE name ___ '%노%'",'LIKE','LIKE는 와일드카드를 포함한 문자열 패턴을 비교합니다.'],
    ['접두어','김으로 시작하는 이름을 고르세요. 따옴표 안의 패턴을 입력하세요.',"SELECT name FROM customers WHERE name LIKE '___'",'김%','뒤의 %는 김 뒤에 어떤 문자열이 와도 된다는 의미입니다.'],
    ['한 글자','김 뒤에 정확히 두 글자가 있는 이름을 고르세요.',"SELECT name FROM customers WHERE name LIKE '김___'",'__','밑줄 하나는 한 글자이므로 두 개가 필요합니다.']]},
  {title:'그룹별 집계',query:'level2_01',concept:'GROUP BY는 같은 값을 가진 행을 묶습니다. COUNT·AVG 등의 집계 함수로 그룹별 값을 계산합니다.',items:[
    ['그룹 만들기','분류별 상품 수를 구하세요.','SELECT category, COUNT(*) FROM products ___ category','GROUP BY','집계하지 않은 category를 그룹 기준으로 지정합니다.'],
    ['평균','분류별 평균 가격을 구하세요.','SELECT category, ___(price) FROM products GROUP BY category','AVG','AVG는 NULL을 제외한 값의 평균을 계산합니다.'],
    ['반올림','평균 가격을 소수 둘째 자리까지 반올림하세요.','SELECT ___(AVG(price), 2) FROM products','ROUND','ROUND(값, 2)는 소수 둘째 자리까지 반올림합니다.']]},
  {title:'집계 전후 조건',query:'level2_02',concept:'WHERE는 집계 전에 행을 거르고 HAVING은 집계 후 그룹을 거릅니다. 두 조건의 적용 시점을 구분하세요.',items:[
    ['그룹 조건','주문이 두 건 이상인 고객만 남기세요.','SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id ___ COUNT(*) >= 2','HAVING','집계 결과인 COUNT(*)의 조건은 HAVING에 씁니다.'],
    ['집계 전 조건','결제한 주문만 먼저 남긴 뒤 고객별로 세세요.',"SELECT customer_id, COUNT(*) FROM orders ___ status = 'paid' GROUP BY customer_id",'WHERE','WHERE에서 결제 주문만 남겨야 결제 주문 수를 집계합니다.'],
    ['경계 포함','최소 두 건이라는 조건의 비교 연산자를 쓰세요.','SELECT customer_id FROM orders GROUP BY customer_id HAVING COUNT(*) ___ 2','>=','최소 두 건은 두 건도 포함하므로 >= 입니다.']]},
  {title:'NULL과 집계 결합',query:'level2_03',concept:'표시값을 COALESCE로 바꾼 뒤 같은 표현식으로 그룹화하면 누락값을 하나의 이름으로 묶을 수 있습니다.',items:[
    ['그룹 표시값','NULL 도시를 미입력으로 표시하세요.',"SELECT ___(city, '미입력') AS city_label FROM customers",'COALESCE','NULL일 때 사용할 표시값을 두 번째 인수로 줍니다.'],
    ['열 별칭','출력 열 이름을 city_label로 지정하세요.',"SELECT COALESCE(city, '미입력') ___ city_label FROM customers",'AS','AS는 출력 열에 이름을 붙입니다.'],
    ['동일 표현식 그룹화','표시 도시별 고객 수를 구하세요.',"SELECT COALESCE(city, '미입력'), COUNT(*) FROM customers ___ COALESCE(city, '미입력')",'GROUP BY','출력에 사용한 도시 표현식으로 묶습니다.']]},
  {title:'조건별 값 만들기',query:'level2_05',concept:'CASE는 위에서부터 조건을 검사하여 처음 맞는 THEN 값을 반환합니다. ELSE는 어떤 조건에도 맞지 않을 때 사용합니다.',items:[
    ['조건 분기 시작','가격에 따라 이름을 붙이는 식을 시작하세요.',"SELECT ___ WHEN price < 1000 THEN '저가' ELSE '기타' END FROM products",'CASE','CASE는 조건에 따라 값을 반환하는 표현식입니다.'],
    ['조건의 결과','조건이 참일 때 저가를 반환하세요.',"SELECT CASE WHEN price < 1000 ___ '저가' ELSE '기타' END FROM products",'THEN','WHEN 뒤에 조건, THEN 뒤에 그 조건의 결과를 씁니다.'],
    ['기본값','저가가 아닌 상품에 기타를 표시하세요.',"SELECT CASE WHEN price < 1000 THEN '저가' ___ '기타' END FROM products",'ELSE','ELSE를 생략하고 모든 조건이 거짓이면 NULL이 됩니다.']]},
  {title:'날짜 조건 조합',query:'level1_04',concept:'날짜·시간 범위는 시작 이상, 다음 구간 시작 미만으로 쓰면 마지막 날의 시간까지 포함할 수 있습니다.',items:[
    ['동시 조건','결제 완료이면서 1월 1일 이후인 주문을 고르세요.',"SELECT order_id FROM orders WHERE status = 'paid' ___ ordered_at >= '2024-01-01'",'AND','두 조건을 모두 만족해야 하므로 AND로 연결합니다.'],
    ['끝 경계','1월 전체를 포함하되 2월은 제외하세요.',"SELECT order_id FROM orders WHERE ordered_at >= '2024-01-01' AND ordered_at ___ '2024-02-01'",'<','다음 달 시작 미만으로 제한하면 시간값이 있어도 1월 전체를 포함합니다.'],
    ['월 추출','2024-01 형식으로 주문 월을 표시하세요.',"SELECT ___(ordered_at, '%Y-%m') FROM orders",'DATE_FORMAT','DATE_FORMAT은 지정한 형식의 날짜 문자열을 만듭니다.']]}
];
// 기존 단원·빈칸 ID는 유지하고 화면 순서만 단계별로 정렬한다.
const {variants,alternates,extraUnits}=require('./curriculum.cjs');
module.exports=[...units.map((u,i)=>({...u,queries:[u.query,alternates[i]],items:[...u.items,...variants[i]]})),...extraUnits]
  .map((unit,index)=>({...unit,id:`unit${index+1}`,level:Number(unit.query[5]),cards:unit.items.map((item,i)=>({id:i<3?`blank${index*3+i+1}`:`unit${index+1}_variant${i-2}`,problemId:item[5]||unit.query,title:item[0],prompt:item[1],sql:item[2],answer:item[3],explanation:item[4]}))}))
  .sort((a,b)=>a.level-b.level).map((unit,index)=>({...unit,cards:unit.cards.map(card=>({...card,unit:index}))}));
