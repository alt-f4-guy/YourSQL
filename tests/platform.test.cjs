// 운영체제별 배포 위치와 전용 연결 경로를 검증한다.
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {themeDirectories,mysqlCandidates,validSocket}=require('../lib/platform.cjs');
test('Mac은 사용자 데이터 테마를 사용하고 이전 앱 옆 테마를 이관한다',()=>{
  assert.deepEqual(themeDirectories('/private/var/folders/x/AppTranslocation/id/d/YourSQL.app/Contents/MacOS/YourSQL','/Users/me/Library/Application Support/YourSQL','darwin'),{
    active:'/Users/me/Library/Application Support/YourSQL/theme',legacy:'/private/var/folders/x/AppTranslocation/id/d/theme'
  });
  assert.deepEqual(themeDirectories('C:\\apps\\YourSQL\\YourSQL.exe','C:\\Users\\me\\AppData\\Roaming\\YourSQL','win32',path.win32),{
    active:'C:\\Users\\me\\AppData\\Roaming\\YourSQL\\theme',legacy:'C:\\apps\\YourSQL\\theme'
  });
});
test('Windows 설치본은 사용자 데이터 테마를 쓰고 실행 파일 옆 테마를 한 번 이관한다',()=>{
  assert.deepEqual(themeDirectories(
    'C:\\Users\\me\\AppData\\Local\\Programs\\YourSQL\\YourSQL.exe',
    'C:\\Users\\me\\AppData\\Roaming\\YourSQL','win32',path.win32
  ),{
    active:'C:\\Users\\me\\AppData\\Roaming\\YourSQL\\theme',
    legacy:'C:\\Users\\me\\AppData\\Local\\Programs\\YourSQL\\theme'
  });
});
test('Windows MySQL 설치 위치와 지정 경로를 탐색한다',()=>{
  const candidates=mysqlCandidates('win32',{ProgramFiles:'C:\\Program Files',PATH:'C:\\tools\\mysql\\bin',YOURSQL_MYSQLD:'D:\\mysql\\bin\\mysqld.exe'});
  assert.equal(candidates[0],'D:\\mysql\\bin\\mysqld.exe');
  assert.ok(candidates.includes('C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe'));
  assert.ok(candidates.includes('C:\\tools\\mysql\\bin\\mysqld.exe'));
  assert.ok(mysqlCandidates('darwin',{}).includes('/usr/local/mysql/bin/mysqld'));
});
test('복구는 로컬 전용 소켓이나 앱 전용 파이프만 허용한다',()=>{
  assert.equal(validSocket('/tmp/aura-sql-Ab1234/mysql.sock','darwin'),true);
  assert.equal(validSocket('\\\\.\\pipe\\yoursql-0123456789abcdef0123456789abcdef','win32'),true);
  for(const value of ['\\\\server\\pipe\\mysql','\\\\.\\pipe\\MySQL','/tmp/other/mysql.sock','/tmp/aura-sql-../mysql.sock']) {
    assert.equal(validSocket(value,'win32'),false);
    assert.equal(validSocket(value,'darwin'),false);
  }
});
// Mac에서도 Windows 분기의 서버 실행 인자와 복구 흐름을 검증한다.
test('Windows 엔진은 TCP 없이 같은 파이프로 시작하고 복구한다',async()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const vm=require('node:vm');
  const {EventEmitter}=require('node:events');
  const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yoursql-win-test-'));
  const binary=path.join(directory,'mysqld.exe');
  fs.writeFileSync(binary,'');
  fs.mkdirSync(path.join(directory,'mysql-data'));
  let launches=0,args,options,learnerOptions;
  const mysql=require('mysql2');
  const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
  child.kill=()=>{child.exitCode=0;child.emit('exit',0);};
  const connection={query:async sql=>sql.startsWith('SELECT VERSION')?[[{version:'8.4.0'}]]:[[]],destroy(){}};
  const module={exports:{}};
  const platform=require('../lib/platform.cjs');
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/engine.cjs'),'utf8'),{
    module,process:{platform:'win32'},Buffer,setTimeout,clearTimeout,
    require:name=>name==='mysql2'?{...mysql,createConnection:config=>{learnerOptions=config;throw new Error('인증 설정 검사');}}:name==='node:child_process'?{...require(name),spawn:(_binary,values,opts)=>{launches++;args=values;options=opts;return child;}}:
      name==='./platform.cjs'?{mysqlCandidates:()=>[binary],validSocket:value=>platform.validSocket(value,'win32')}:require(name)
  });
  const {Engine}=module.exports;
  const first=new Engine(directory),second=new Engine(directory);
  // 실제 Windows 서버는 Windows 실기 검사에서 연결하며 여기서는 전송 경계만 대체한다.
  first.connectAdmin=second.connectAdmin=async socket=>{assert.equal(platform.validSocket(socket,'win32'),true);return connection;};
  try {
    await first.start();
    assert.ok(args.includes('--enable-named-pipe'));
    assert.ok(args.includes('--skip-networking'));
    assert.ok(args.includes(`--socket=${first.socketPath.slice('\\\\.\\pipe\\'.length)}`));
    assert.equal(options.windowsHide,true);
    await second.start();
    assert.equal(launches,1);
    assert.equal(first.socketPath,second.socketPath);
    assert.equal(first.socketDirectory,undefined);
    assert.equal(second.socketDirectory,null);
    await assert.rejects(second.query('SELECT 1'),/인증 설정 검사/);
    // 전체 인증 요청에 평문 비밀번호 대신 RSA 공개키 요청을 반환해야 한다.
    const authenticate=(learnerOptions.authPlugins?.caching_sha2_password||mysql.authPlugins.caching_sha2_password())({connection:{config:learnerOptions}});
    authenticate(Buffer.alloc(20,1));
    assert.deepEqual(authenticate(Buffer.from([4])),Buffer.from([2]));
  } finally {await first.stop();await second.stop();fs.rmSync(directory,{recursive:true,force:true});}
});
test('초기화가 SIGTERM을 무시하면 동시 stop은 강제 종료 확인까지 함께 기다린다',async()=>{
  const fs=require('node:fs');
  const vm=require('node:vm');
  const {EventEmitter}=require('node:events');
  const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yoursql-initialize-stop-'));
  const binary=path.join(directory,'mysqld');
  fs.writeFileSync(binary,'');
  const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
  let finish,allowExit;
  const signals=[],timers=new Map();
  const exitAllowed=new Promise(resolve=>{allowExit=resolve;});
  child.kill=signal=>{
    signals.push(signal);
    if(signal==='SIGKILL') void exitAllowed.then(()=>finish(new Error('초기화 중단')));
    return true;
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/engine.cjs'),'utf8'),{
    module,process:{platform:'darwin'},Buffer,
    setTimeout:(callback,ms)=>{const timer={callback,ms};timers.set(timer,timer);return timer;},
    clearTimeout:timer=>timers.delete(timer),
    require:name=>name==='node:child_process'?{...require(name),execFile:(_binary,args,_options,callback)=>{
      assert.ok(args.includes('--initialize-insecure'));
      finish=error=>{child.signalCode='SIGKILL';child.emit('exit',null,'SIGKILL');callback(error,'','');};
      return child;
    }}:name==='./platform.cjs'?{mysqlCandidates:()=>[binary],validSocket:()=>false}:require(name)
  });
  const engine=new module.exports.Engine(directory);
  const staging=path.join(directory,'mysql-initializing');
  let starting,stopped=0;
  try {
    starting=engine.start();
    const failedStart=assert.rejects(starting,/초기화 중단/);
    await Promise.resolve();
    const stopping=engine.stop().then(()=>{stopped++;});
    assert.deepEqual(signals,['SIGTERM']);
    const alsoStopping=engine.stop().then(()=>{stopped++;});
    // 유예 시간은 가짜 시계로 넘기되 종료 이벤트는 별도로 보류한다.
    for(const timer of [...timers.values()]) {
      assert.equal(timer.ms,5000);
      timer.callback();
    }
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(signals.includes('SIGKILL'),'SIGTERM 무응답이면 SIGKILL을 보내야 한다');
    assert.deepEqual(signals,['SIGTERM','SIGKILL']);
    assert.equal(stopped,0,'두 stop 모두 실제 종료를 기다려야 한다');
    assert.equal(engine.initializing,child);
    assert.equal(fs.existsSync(staging),true,'살아 있는 초기화 폴더는 지우지 않는다');
    allowExit();
    await Promise.all([stopping,alsoStopping,failedStart]);
    assert.equal(stopped,2);
    assert.equal(engine.initializing,null);
    assert.equal(fs.existsSync(staging),false,'중단된 초기화 폴더가 다음 실행을 막지 않아야 한다');
  } finally {
    if (child.signalCode===null) finish?.(new Error('초기화 중단'));
    await starting?.catch(()=>{});
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
