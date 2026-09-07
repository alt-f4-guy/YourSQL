// 같은 데이터 폴더의 서버가 남아 있어도 중복 서버를 시작하지 않고 복구해야 한다.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Engine}=require('../lib/engine.cjs');
const directory=fs.mkdtempSync(path.join(__dirname,'../.engine-recovery-runtime-'));
async function main(){
  const original=new Engine(directory),recovered=new Engine(directory);
  let recovering,timer;
  try{
    await original.start();
    assert.deepEqual((await original.query('SELECT 1 AS value')).rows,[[1]]);
    recovering=recovered.start();
    await Promise.race([recovering,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('기존 서버 복구가 5초 안에 끝나지 않았습니다.')),5000);})]);
    assert.equal(recovered.ready,true);
    assert.deepEqual((await recovered.query('SELECT 1 AS value')).rows,[[1]]);
    assert.equal(recovered.socketPath,original.socketPath);
    console.log('남아 있는 전용 서버 재사용 및 쿼리 실행 확인');
  }finally{
    clearTimeout(timer);
    await original.stop();
    if(recovering)await recovering.catch(()=>{});
    await recovered.stop();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
