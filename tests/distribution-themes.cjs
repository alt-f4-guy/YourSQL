// Mac 앱에는 내장 기본 테마만, Windows 폴더와 ZIP에는 외부 기본 테마만 있어야 한다.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),expected=['macos-dark.json','macos-light.json'];
const mac=path.join(root,'dist/YourSQL-darwin-arm64');
assert.equal(fs.existsSync(path.join(mac,'theme')),false);
assert.deepEqual(expected.map(name=>path.join(mac,'YourSQL.app/Contents/Resources',name)).filter(fs.existsSync).map(file=>path.basename(file)).sort(),expected);
assert.equal(fs.existsSync(path.join(root,'dist/YourSQL-Mac-arm64.zip')),false);
assert.equal(fs.existsSync(path.join(root,'dist/YourSQL-Mac-arm64.dmg')),true);
const windows=path.join(root,'dist/YourSQL-win32-x64'),zip=path.join(root,'dist/YourSQL-Windows-x64.zip');
assert.deepEqual(fs.readdirSync(path.join(windows,'theme')).sort(),expected);
const entries=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).split('\n');
assert.deepEqual(entries.filter(name=>name.startsWith('YourSQL-win32-x64/theme/')&&!name.endsWith('/')).map(name=>path.basename(name)).sort(),expected);
console.log('Mac DMG 내장 테마·Windows ZIP 외부 테마 검사 통과');
