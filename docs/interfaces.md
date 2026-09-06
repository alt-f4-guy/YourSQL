# 공유 인터페이스

## 문제 팩(JSON)
최상위: `{version:1, id:string, title:string, tables:[], datasets:[], problems:[]}`.
식별자는 영문자 시작, 영문자·숫자·밑줄만 허용하며 48자 이내다.
tables: `{name, description, columns:[{name,type,description}]}`. type은 INT, BIGINT, DECIMAL(12,2), VARCHAR(100), DATE 등 제한된 MySQL 자료형. 키·외래키 제약은 사용하지 않는다.
datasets: `{name, rows:{테이블명:[[셀값,...],...]}}`. 첫 번째는 공개 데이터, 이후는 숨겨진 데이터. 셀은 문자열·숫자·null. 날짜는 YYYY-MM-DD 문자열. 모든 테이블의 행 배열을 각 세트에 제공한다.
problems: `{id,level,title,topic,description,tables:[테이블명],columns:[결과열명],ordered:boolean,solution,explanation,starter}`. level 1~5. description은 한글 일반 텍스트로 정확한 조건·열·정렬·동점 정책·날짜 범위를 명시한다. 정답은 MySQL 8.0 SELECT 또는 WITH 쿼리. 각 팩은 여러 문제와 데이터를 공유한다.

## 화면 API: window.practice (모든 메서드는 Promise)
- `bootstrap()` → `{problems:[{id,level,title,topic,description,tables:[테이블정의+{rows:공개행}],columns,ordered,starter}], progress:{문제ID:{sql,solved,attempts,lastStatus}}, logs:[로그], engine:{ready:boolean,message:string}, dataPath:string}`
- `saveDraft({id,sql})` → `{ok:true}`
- `run({id,sql})` → `{status:'success'|'error',columns:[],rows:[],elapsedMs,error?:string}`
- `submit({id,sql})` → `{status:'correct'|'wrong'|'error',passed,total,elapsedMs,cases:[{name,passed,message}],error?:string,logId?:string,progress:해당문제진행상태}`
- `history()` → 로그 배열. 로그: `{id,problemId,title,level,sql,status,createdAt,result:{passed,total,cases,error?,elapsedMs}}`
- `exportLog(id)` → `{canceled:boolean,path?:string}` (네이티브 저장 대화상자)
- `importPack()` → `{canceled:boolean,count?:number,error?:string}` (네이티브 열기 대화상자)
- `solution(id)` → `{sql,explanation}`
- `retryEngine()` → `{ready,message}`
IPC 실패는 예외로 전달되므로 화면은 오류를 표시한다. 제출의 wrong·error는 자동으로 로그 파일에 기록한다. 연결 실패 등의 인프라 오류도 error로 기록하되 오답과 구별한다.

## 화면 파일
`ui/index.html`, `ui/style.css`, `ui/app.js`만 사용한다. 외부 CDN·프레임워크 없이 동작한다. CSP script-src 'self', style-src 'self'를 기준으로 작성한다. 사용자 내용은 textContent로 렌더한다. UI는 한국어이며 SQL 키워드·테이블 식별자는 유지한다.

## 복습·힌트·학습일 확장

문제의 선택 필드 `hints`는 비어 있지 않은 문자열 정확히 3개(각 5,000자 이하)로, 핵심 개념·접근 순서·빈칸 SQL 골격 순서다. 필드가 없는 기존 문제팩도 지원한다.

`saveDraft`와 `submit`에 선택 불리언 `review`를 전달하면 복습 초안 `reviewSql`을 저장하고 원래 `sql`은 보존한다. 문제별 진행 기록의 `studyDays`는 제출 시점의 현지 날짜 배열이다. `practice:study`는 현재·최장 연속일수, 전체 학습일, 오늘 제출 여부와 날짜 목록을 반환한다. 과거 기록을 추정하여 채우지 않는다.
