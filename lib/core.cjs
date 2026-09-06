// 채점 결과 비교, 문제 팩 검증, 로컬 기록 저장을 담당한다.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function numberKey(value) {
  const s = String(value);
  if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s)) return s;
  const n = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return n === '-0' ? '0' : n;
}

function compareResults(expected, actual, ordered) {
  if (JSON.stringify(expected.columns) !== JSON.stringify(actual.columns)) {
    return {passed:false,message:`결과 열이 다릅니다. 필요한 열: ${expected.columns.join(', ')}`};
  }
  if (expected.rows.length !== actual.rows.length) return {passed:false,message:'결과 행 개수가 다릅니다.'};
  // 숫자는 문자열로 정규화하여 BIGINT와 DECIMAL의 정밀도를 보존한다.
  const key = row => JSON.stringify(row.map((v, i) => v === null ? null : expected.numeric?.[i] ? ['n',numberKey(v)] : ['v',String(v)]));
  const a = expected.rows.map(key), b = actual.rows.map(key);
  if (!ordered) { a.sort(); b.sort(); }
  const passed = a.every((row, index) => row === b[index]);
  return {passed,message:passed ? '통과' : ordered ? '값 또는 정렬 순서가 다릅니다.' : '결과 값 또는 중복 행 개수가 다릅니다.'};
}

const identifier = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const typePattern = /^(INT|BIGINT|DATE|DATETIME|DECIMAL\((?:[1-9]|[1-5]\d|6[0-5]),(?:0|[1-9]|[12]\d|30)\)|VARCHAR\((?:[1-9]\d{0,2}|1000)\))$/;
function requireValue(ok, message) { if (!ok) throw new Error(`문제 파일 오류: ${message}`); }
function validId(value) { return typeof value === 'string' && identifier.test(value) && !['constructor','prototype','__proto__'].includes(value); }
function textValue(value, max=30000) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }

function validatePack(pack) {
  requireValue(pack && pack.version === 1 && validId(pack.id) && textValue(pack.title,200), '버전·팩 ID·제목을 확인하세요.');
  requireValue(Array.isArray(pack.tables) && pack.tables.length > 0 && pack.tables.length <= 30, '테이블은 1~30개여야 합니다.');
  const tables = new Set();
  for (const table of pack.tables) {
    requireValue(validId(table.name) && !tables.has(table.name.toLowerCase()), '테이블 이름이 잘못되었거나 중복됩니다.');
    tables.add(table.name.toLowerCase());
    requireValue(Array.isArray(table.columns) && table.columns.length > 0 && table.columns.length <= 40, '열은 1~40개여야 합니다.');
    const columns = new Set();
    for (const column of table.columns) {
      requireValue(validId(column.name) && !columns.has(column.name.toLowerCase()), '열 이름이 잘못되었거나 중복됩니다.');
      columns.add(column.name.toLowerCase());
      requireValue(typeof column.type === 'string' && typePattern.test(column.type), `허용되지 않은 자료형: ${column.type}`);
      if (column.type.startsWith('DECIMAL')) {
        const [precision,scale] = column.type.match(/\d+/g).map(Number);
        requireValue(scale <= precision, '소수 자릿수가 전체 자릿수보다 큽니다.');
      }
    }
  }
  requireValue(Array.isArray(pack.datasets) && pack.datasets.length >= 2 && pack.datasets.length <= 20, '공개·숨겨진 데이터가 필요합니다(2~20개).');
  for (const dataset of pack.datasets) {
    requireValue(textValue(dataset.name,100) && dataset.rows && typeof dataset.rows === 'object', '데이터 세트 이름·행이 필요합니다.');
    for (const table of pack.tables) {
      const rows = dataset.rows[table.name];
      requireValue(Array.isArray(rows) && rows.length <= 1000, `${table.name} 행은 0~1000개여야 합니다.`);
      for (const row of rows) {
        requireValue(Array.isArray(row) && row.length === table.columns.length, `${table.name} 열 개수와 행이 맞지 않습니다.`);
        requireValue(row.every(v => v === null || (typeof v === 'number' && Number.isFinite(v) && (!Number.isInteger(v) || Number.isSafeInteger(v))) || (typeof v === 'string' && v.length <= 4000)), '셀은 문자열·안전한 숫자·NULL만 허용합니다. 큰 정수는 문자열로 입력하세요.');
      }
    }
  }
  requireValue(Array.isArray(pack.problems) && pack.problems.length > 0 && pack.problems.length <= 500, '문제는 1~500개여야 합니다.');
  const ids = new Set();
  for (const p of pack.problems) {
    requireValue(validId(p.id) && !ids.has(p.id), '문제 ID가 잘못되었거나 중복됩니다.');
    ids.add(p.id);
    requireValue(Number.isInteger(p.level) && p.level >= 1 && p.level <= 5, '난이도는 1~5여야 합니다.');
    requireValue(['title','topic','description','solution','explanation'].every(k => textValue(p[k])), `${p.id} 필수 설명이 누락되었습니다.`);
    requireValue(p.hints === undefined || (Array.isArray(p.hints) && p.hints.length === 3 && p.hints.every(h => textValue(h,5000))), '힌트는 비어 있지 않은 문자열 3개여야 합니다.');
    requireValue(typeof p.starter === 'string' && p.starter.length <= 50000 && typeof p.ordered === 'boolean', '시작 SQL과 정렬 여부를 확인하세요.');
    requireValue(Array.isArray(p.tables) && p.tables.length > 0 && p.tables.every(t => pack.tables.some(table => table.name === t)), '문제에서 참조한 테이블이 없습니다.');
    requireValue(Array.isArray(p.columns) && p.columns.length > 0 && p.columns.every(c => textValue(c,100)), '결과 열 이름이 필요합니다.');
  }
  return pack;
}

function atomicJSON(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value,null,2), {mode:0o600});
  fs.renameSync(temporary,file);
}

function localDay(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }

class PracticeStore {
  constructor(directory) {
    this.directory = directory;
    this.logDirectory = path.join(directory,'wrong-answers');
    fs.mkdirSync(this.logDirectory,{recursive:true,mode:0o700});
    this.file = path.join(directory,'progress.json');
    this.progress = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file,'utf8')) : {};
  }
  saveDraft(id, sql, review=false) {
    if (!validId(id) || typeof sql !== 'string' || sql.length > 50000 || typeof review !== 'boolean') throw new Error('저장할 문제 ID나 SQL이 잘못되었습니다.');
    this.progress[id] = {...this.progress[id],[review ? 'reviewSql' : 'sql']:sql};
    atomicJSON(this.file,this.progress);
    return {ok:true};
  }
  record(problem, sql, result, now=new Date()) {
    let logId;
    if (result.status !== 'correct') {
      logId = randomUUID();
      atomicJSON(path.join(this.logDirectory,`${logId}.json`), {
        id:logId,problemId:problem.id,title:problem.title,level:problem.level,sql,
        status:result.status,createdAt:now.toISOString(),result
      });
    }
    const previous = this.progress[problem.id] || {};
    this.progress[problem.id] = {...previous,studyDays:[...new Set([...(previous.studyDays || []),localDay(now)])],sql:previous.sql ?? sql,solved:Boolean(previous.solved || result.status === 'correct'),attempts:(previous.attempts || 0)+1,lastStatus:result.status};
    atomicJSON(this.file,this.progress);
    return {...result,logId,progress:this.progress[problem.id]};
  }
  study(now=new Date()) {
    const today=localDay(now), yesterday=new Date(now);
    yesterday.setDate(yesterday.getDate()-1);
    const dates=[...new Set(Object.values(this.progress).flatMap(p=>p.studyDays || []))].filter(d=>d<=today).sort();
    let longest=0, streak=0, previous;
    // 날짜를 UTC 일수로 비교하므로 일광절약시간의 23·25시간 간격에 영향받지 않는다.
    for (const date of dates) {
      const day=Date.parse(date)/86400000;
      streak=day===previous+1 ? streak+1 : 1;
      longest=Math.max(longest,streak); previous=day;
    }
    const last=dates.at(-1);
    return {current:last===today || last===localDay(yesterday) ? streak : 0,longest,total:dates.length,today:last===today,dates};
  }
  logs() {
    return fs.readdirSync(this.logDirectory).filter(file=>file.endsWith('.json'))
      .map(file=>JSON.parse(fs.readFileSync(path.join(this.logDirectory,file),'utf8')))
      .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  }
}

module.exports = {compareResults,validatePack,PracticeStore,atomicJSON};
