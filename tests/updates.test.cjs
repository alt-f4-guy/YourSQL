const test=require('node:test');
const assert=require('node:assert/strict');
const {checkUpdate,Updater}=require('../lib/updates.cjs');

const release=(tag,assets=[])=>({
  tag_name:tag,
  draft:false,
  prerelease:false,
  assets:assets.map(name=>({name}))
});

test('공식 최신 정식 버전과 현재 운영체제 설치 자산만 알린다',async()=>{
  const fetcher=async(url,options)=>{
    assert.equal(url,'https://api.github.com/repos/alt-f4-guy/YourSQL/releases/latest');
    assert.equal(options.redirect,'error');
    return {ok:true,json:async()=>release('v0.0.6',['YourSQL-Mac-arm64.dmg'])};
  };
  assert.deepEqual(await checkUpdate('0.0.5','darwin','arm64',fetcher),{
    current:'0.0.5',latest:'0.0.6',available:true,downloadable:true,
    message:'업데이트가 있습니다.',
    url:'https://github.com/alt-f4-guy/YourSQL/releases/tag/v0.0.6'
  });
});

test('운영체제용 설치 자산이 없으면 페이지 열기를 허용하지 않는다',async()=>{
  const result=await checkUpdate('0.0.5','win32','x64',async()=>({
    ok:true,json:async()=>release('v0.0.6',['YourSQL-Mac-arm64.dmg'])
  }));
  assert.equal(result.available,true);
  assert.equal(result.downloadable,false);
  assert.match(result.message,/Windows 설치 파일/);
});

test('v 접두사가 없는 태그는 공식 업데이트로 인정하지 않는다',async()=>{
  const result=await checkUpdate('0.0.5','darwin','arm64',async()=>({
    ok:true,json:async()=>release('0.0.6',['YourSQL-Mac-arm64.dmg'])
  }));
  assert.equal(result.available,false);
  assert.match(result.message,/v0\.0\.6 형식/);
});

test('검증된 최신 릴리스 페이지만 연다',async()=>{
  const opened=[];
  const app={getVersion:()=> '0.0.5'};
  const updater=new Updater(app,()=>{},url=>{opened.push(url);});
  updater.fetcher=async()=>({ok:true,json:async()=>release('v0.0.6',['YourSQL-Mac-arm64.dmg'])});
  updater.platform='darwin';updater.arch='arm64';
  await updater.check();
  await updater.open();
  assert.deepEqual(opened,['https://github.com/alt-f4-guy/YourSQL/releases/tag/v0.0.6']);
});

test('확인 전이거나 자산이 없으면 외부 페이지를 열지 않는다',async()=>{
  const updater=new Updater({getVersion:()=> '0.0.5'},()=>{},()=>assert.fail('열면 안 됨'));
  await assert.rejects(updater.open(),/먼저/);
});
