// 원시 패키지와 현재 OS의 공개 자산에는 내장 기본 테마만 있어야 한다.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),expected=['macos-dark.json','macos-light.json'];
const mode=process.argv[2]||'package';
const target=process.argv[3]||'all';
assert.ok(['package','release'].includes(mode));
assert.ok(['all','mac','windows'].includes(target));

if(target==='all'||target==='mac'){
  const mac=path.join(root,'dist/YourSQL-darwin-arm64');
  assert.equal(fs.existsSync(path.join(mac,'theme')),false);
  assert.deepEqual(expected.map(name=>path.join(mac,'YourSQL.app/Contents/Resources',name)).filter(fs.existsSync).map(file=>path.basename(file)).sort(),expected);
  assert.equal(fs.existsSync(path.join(mac,'update.json')),false);
  if(mode==='release') assert.equal(fs.existsSync(path.join(root,'dist/YourSQL-Mac-arm64.dmg')),true,'Mac DMG가 필요합니다.');
}

if(target==='all'||target==='windows'){
  const windows=path.join(root,'dist/YourSQL-win32-x64');
  assert.equal(fs.existsSync(path.join(windows,'theme')),false);
  assert.deepEqual(expected.map(name=>path.join(windows,'resources',name)).filter(fs.existsSync).map(file=>path.basename(file)).sort(),expected);
  assert.equal(fs.existsSync(path.join(root,'dist/YourSQL-win32-x64/update.json')),false);
}

if(mode==='release'&&(target==='all'||target==='windows')){
  const setup=path.join(root,'dist/YourSQL-Setup-x64.exe');
  assert.equal(fs.existsSync(setup),true,'Windows Setup EXE가 필요합니다.');
  assert.equal(fs.existsSync(path.join(root,'dist/YourSQL-Windows-x64.zip')),false,'Windows ZIP을 배포하면 안 됩니다.');
  const script=fs.readFileSync(path.join(root,'installer/YourSQL.nsi'),'utf8');
  assert.match(script,/InstallDir "\$LOCALAPPDATA\\Programs\\YourSQL"/);
  assert.match(script,/RequestExecutionLevel user/);
}

console.log(`${mode} ${target} 배포 자산 검사 통과`);
