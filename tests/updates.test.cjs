// GitHub 응답을 고정해 버전 비교와 외부 주소의 신뢰 경계를 검증한다.
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeRepository,checkUpdate,selectAsset,downloadAsset,validatePackage}=require('../lib/updates.cjs');
test('공개 GitHub 저장소 주소만 허용한다',()=>{
  assert.equal(normalizeRepository(' https://github.com/me/YourSQL/ '),'me/YourSQL');
  assert.equal(normalizeRepository('me/YourSQL'),'me/YourSQL');
  assert.equal(normalizeRepository(''),'');
  for(const value of ['https://evil.test/me/app','me/..','me/app?token=abc',null,{},'https://github.com@evil.test/me/app']) assert.throws(()=>normalizeRepository(value));
});
test('운영체제에 맞는 검증 가능한 ZIP만 선택한다',()=>{
  const asset={name:'YourSQL-Windows-x64.zip',size:100,digest:`sha256:${'a'.repeat(64)}`,browser_download_url:'https://github.com/me/app/releases/download/v0.0.2/YourSQL-Windows-x64.zip'};
  const release={tag_name:'v0.0.2',assets:[asset]};
  assert.equal(selectAsset(release,'me/app','win32','x64').name,asset.name);
  assert.equal(selectAsset(release,'ME/APP','win32','x64').name,asset.name);
  assert.throws(()=>selectAsset(release,'me/app','darwin','arm64'));
  assert.throws(()=>selectAsset({...release,assets:[{...asset,digest:null}]},'me/app','win32','x64'));
  assert.throws(()=>selectAsset({...release,assets:[{...asset,browser_download_url:'https://evil.test/app.zip'}]},'me/app','win32','x64'));
});
test('다운로드 해시가 다르면 교체용 파일을 승인하지 않는다',async()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-download-'));
  const bytes=Buffer.from('검증할 앱');
  const asset={size:bytes.length,digest:`sha256:${require('node:crypto').createHash('sha256').update(bytes).digest('hex')}`,browser_download_url:'https://github.com/me/app/releases/download/v0.0.2/app.zip'};
  const fetcher=async()=>new Response(bytes);
  try {
    await downloadAsset(asset,path.join(directory,'ok.zip'),()=>{},fetcher);
    assert.deepEqual(fs.readFileSync(path.join(directory,'ok.zip')),bytes);
    await assert.rejects(downloadAsset({...asset,digest:`sha256:${'0'.repeat(64)}`},path.join(directory,'bad.zip'),()=>{},fetcher),/검증/);
    await assert.rejects(downloadAsset(asset,path.join(directory,'redirect.zip'),()=>{},async()=>new Response(null,{status:302,headers:{location:'http://evil.test/app.zip'}})),/주소/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('압축 안의 앱 버전과 배포 대상이 일치해야 한다',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-payload-'));
  const root=path.join(directory,'YourSQL-win32-x64');
  fs.mkdirSync(path.join(root,'resources','app.asar'),{recursive:true});
  fs.writeFileSync(path.join(root,'YourSQL.exe'),'실행 파일');
  fs.writeFileSync(path.join(root,'resources','app.asar','package.json'),JSON.stringify({name:'yoursql',version:'0.0.2'}));
  fs.writeFileSync(path.join(root,'update.json'),JSON.stringify({product:'YourSQL',version:'0.0.2',platform:'win32',arch:'x64'}));
  try {
    assert.equal(validatePackage(directory,'0.0.2','win32','x64'),root);
    assert.throws(()=>validatePackage(directory,'0.0.3','win32','x64'),/버전/);
    fs.writeFileSync(path.join(root,'resources','app.asar','package.json'),JSON.stringify({name:'other',version:'0.0.2'}));
    assert.throws(()=>validatePackage(directory,'0.0.2','win32','x64'),/앱/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('숫자로 버전을 비교하고 정식 새 버전만 알린다',async()=>{
  for(const [tag,available] of [['v0.0.2',true],['0.0.10',true],['v0.0.1',false],['v0.0.0',false],['v0.0.2-beta.1',false]]) {
    const result=await checkUpdate('me/app','0.0.1',async(url,options)=>{
      assert.equal(url,'https://api.github.com/repos/me/app/releases/latest');
      assert.ok(options.signal);
      return {ok:true,json:async()=>({tag_name:tag})};
    });
    assert.equal(result.available,available,tag);
  }
  assert.equal((await checkUpdate('me/app','0.9.0',async()=>({ok:true,json:async()=>({tag_name:'v0.10.0'})}))).available,true);
});
test('미설정·릴리스 없음·네트워크 실패를 사용자 상태로 반환한다',async()=>{
  assert.equal((await checkUpdate('','0.0.1',()=>assert.fail('요청하면 안 됨'))).available,false);
  for(const fetcher of [async()=>({ok:false,status:404}),async()=>({ok:false,status:403}),async()=>{throw new Error('offline');},async()=>({ok:true,json:async()=>null})]) {
    const result=await checkUpdate('me/app','0.0.1',fetcher);
    assert.equal(result.available,false);
    assert.ok(result.message);
  }
});
// 기본 저장소를 제공하되 사용자가 저장한 주소와 자동 확인 해제는 보존한다.
test('첫 실행은 공식 저장소를 사용하고 기존 설정을 덮어쓰지 않는다',()=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const {Updater}=require('../lib/updates.cjs');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-update-default-'));
  const app={getPath:()=>directory,getVersion:()=> '0.0.1'};
  try {
    assert.equal(new Updater(app,()=>{}).state.repository,'alt-f4-guy/YourSQL');
    for(const repository of ['me/custom','']) {
      fs.writeFileSync(path.join(directory,'updates.json'),JSON.stringify({repository}));
      assert.equal(new Updater(app,()=>{}).state.repository,repository);
    }
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

// 임시 폴더가 잠겨 있어도 실제 설치 실패 사유를 권한 오류로 덮어쓰지 않는다.
test('업데이트 정리 실패는 원래 설치 오류를 보존하고 진단 파일에 남긴다',async t=>{
  const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
  const {Updater}=require('../lib/updates.cjs');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-update-error-'));
  const work=path.join(directory,'work');fs.mkdirSync(work);
  const updater=new Updater({getPath:()=>directory,getVersion:()=> '0.0.4',quit:()=>assert.fail('실패한 업데이트는 앱을 종료하면 안 됩니다.')},()=>{});
  updater.state.installable=true;updater.release={tag_name:'v0.0.5',assets:[]};
  const locked=Object.assign(new Error('임시 폴더 사용 중'),{code:'EPERM'});
  t.mock.method(fs,'mkdtempSync',()=>work);
  t.mock.method(fs,'rmSync',()=>{throw locked;});
  t.mock.method(fs.promises,'rm',async()=>{throw locked;});
  try{
    await assert.rejects(updater.install(),/업데이트 ZIP이 아직 등록되지/);
    assert.equal(updater.busy,false);
    assert.equal(updater.state.phase,'idle');
    const diagnostic=fs.readFileSync(path.join(directory,'update-error.txt'),'utf8');
    assert.match(diagnostic,/업데이트 ZIP이 아직 등록되지/);
    assert.match(diagnostic,/EPERM/);
    assert.ok(diagnostic.includes(work));
  }finally{t.mock.restoreAll();fs.rmSync(directory,{recursive:true,force:true});}
});
