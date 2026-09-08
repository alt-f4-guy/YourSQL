// 두 원시 앱 폴더에는 내장 기본 테마만 있어야 한다.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),expected=['macos-dark.json','macos-light.json'];
const mac=path.join(root,'dist/YourSQL-darwin-arm64');
assert.equal(fs.existsSync(path.join(mac,'theme')),false);
assert.deepEqual(expected.map(name=>path.join(mac,'YourSQL.app/Contents/Resources',name)).filter(fs.existsSync).map(file=>path.basename(file)).sort(),expected);
assert.equal(fs.existsSync(path.join(mac,'update.json')),false);
const windows=path.join(root,'dist/YourSQL-win32-x64');
assert.equal(fs.existsSync(path.join(windows,'theme')),false);
assert.deepEqual(expected.map(name=>path.join(windows,'resources',name)).filter(fs.existsSync).map(file=>path.basename(file)).sort(),expected);
assert.equal(fs.existsSync(path.join(root,'dist/YourSQL-win32-x64/update.json')),false);
console.log('Mac·Windows 앱 리소스 내장 테마 검사 통과');
