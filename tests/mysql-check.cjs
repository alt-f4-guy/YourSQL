// 실제 MySQL에서 권한·시간 제한·문제별 정답과 오답을 검증한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Engine } = require('../lib/engine.cjs');
const { validatePack, compareResults } = require('../lib/core.cjs');

async function main() {
  const engine = new Engine(path.join(__dirname,'../.test-runtime'));
  try {
    await engine.start();
    console.log('MySQL 시작:',engine.version);
    const fixture = {tables:[{name:'T',columns:[{name:'ID',type:'INT'}]}],datasets:[{rows:{T:[[1],[2]]}}]};
    await engine.prepare(fixture,0);
    assert.deepEqual((await engine.query('SELECT ID FROM T ORDER BY ID')).rows, [[1],[2]]);
    await assert.rejects(engine.query('DELETE FROM T'));
    await assert.rejects(engine.query('SELECT * FROM mysql.user'));
    await assert.rejects(engine.query('SELECT 1; SELECT 2'));
    const start = Date.now();
    await assert.rejects(engine.query('SELECT /*+ MAX_EXECUTION_TIME(0) */ SLEEP(30)'), /시간|중단|interrupted/i);
    assert.ok(Date.now()-start < 6000,'클라이언트의 강제 시간 제한');
    assert.deepEqual((await engine.query('SELECT COUNT(*) AS N FROM T')).rows, [['2']]);
    const huge = await engine.query('SELECT CAST(9007199254740993 AS UNSIGNED) AS N, CAST(1.20 AS DECIMAL(12,2)) AS D');
    assert.equal(huge.rows[0][0],'9007199254740993');
    assert.equal(huge.rows[0][1],'1.20');
    await assert.rejects(engine.query('SELECT a.ID FROM T a CROSS JOIN T b CROSS JOIN T c CROSS JOIN T d CROSS JOIN T e CROSS JOIN T f CROSS JOIN T g CROSS JOIN T h CROSS JOIN T i CROSS JOIN T j'), /1000/);
    console.log('읽기 권한·다중 문장·강제 시간 제한·숫자 정밀도·행 제한 확인');
    const directory = path.join(__dirname,'../content');
    const packs = fs.existsSync(directory) ? fs.readdirSync(directory).filter(f=>f.endsWith('.json') && f !== 'checks.json').map(f=>validatePack(JSON.parse(fs.readFileSync(path.join(directory,f),'utf8')))) : [];
    assert.ok(packs.length > 0,'기본 문제 팩 필요');
    const all = packs.flatMap(pack=>pack.problems);
    assert.equal(all.length,300);
    for (let level=1;level<=5;level++) assert.equal(all.filter(p=>p.level===level).length,60);
    assert.equal(new Set(all.map(p=>p.id)).size,300);
    const checksFile = path.join(directory,'checks.json');
    const checks = fs.existsSync(checksFile) ? JSON.parse(fs.readFileSync(checksFile,'utf8')) : [];
    let count = 0;
    const audit = [];
    const mutants = require('../content/mutants.cjs');
    const detected = new Set();
    for (const pack of packs) {
      for (let index=0;index<pack.datasets.length;index++) {
        await engine.prepare(pack,index);
        for (const problem of pack.problems) {
          let result;
          try { result = await engine.query(problem.solution); } catch (error) { throw new Error(`${problem.id} · 데이터 ${index}: ${error.message}`,{cause:error}); }
          assert.deepEqual(result.columns,problem.columns,`${problem.id}: 열 이름`);
          const check = checks.find(check=>check.id===problem.id);
          if (index === 0 && check) assert.equal(compareResults({...result,rows:check.rows},result,problem.ordered).passed,true,`${problem.id}: 독립 계산 예제`);
          assert.equal(compareResults(result,result,problem.ordered).passed,true);
          const wrong = {columns:result.columns,rows:result.rows.length ? result.rows.slice(1) : [['명백한 오답']]};
          assert.equal(compareResults(result,wrong,problem.ordered).passed,false);
          audit.push({id:problem.id,dataset:index,rows:result.rows.length});
          for (const mutant of mutants.filter(m=>m.id===problem.id)) {
            const actual = await engine.query(mutant.sql);
            if (!compareResults(result,actual,problem.ordered).passed) detected.add(mutant.id);
          }
          count++;
        }
      }
      console.log(`${pack.title}: ${pack.problems.length}문제 × ${pack.datasets.length}개 데이터 확인`);
    }
    const empty = all.filter(p=>!audit.some(a=>a.id===p.id && a.rows>0));
    assert.deepEqual(empty.map(p=>p.id),[],'최소 한 데이터 세트에는 기대 행이 있어야 합니다');
    assert.equal(detected.size,mutants.length,`검출되지 않은 오답: ${mutants.filter(m=>!detected.has(m.id)).map(m=>m.id).join(', ')}`);
    fs.mkdirSync(path.join(__dirname,'../artifacts'),{recursive:true});
    fs.writeFileSync(path.join(__dirname,'../artifacts/mysql-audit.json'),JSON.stringify({version:engine.version,problems:300,cases:count,independentChecks:checks.length,mutantsDetected:detected.size,audit},null,2));
    console.log(`전체 통과: 300문제, ${count}개 실행, 독립 예제 ${checks.length}개`);
  } finally { await engine.stop(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
