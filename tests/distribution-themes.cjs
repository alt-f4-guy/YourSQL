// 배포 폴더와 ZIP에는 공개용 두 테마만 있어야 한다.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
for(const [folder,zip] of [['YourSQL-darwin-arm64','YourSQL-Mac-arm64.zip'],['YourSQL-win32-x64','YourSQL-Windows-x64.zip']]){
  const expected=['macos-dark.json','macos-light.json'];
  assert.deepEqual(fs.readdirSync(path.join(root,'dist',folder,'theme')).sort(),expected);
  const entries=execFileSync('unzip',['-Z1',path.join(root,'dist',zip)],{encoding:'utf8'}).split('\n');
  assert.deepEqual(entries.filter(name=>name.startsWith(`${folder}/theme/`)&&!name.endsWith('/')).map(name=>path.basename(name)).sort(),expected);
}
console.log('Mac·Windows 배포 폴더 및 ZIP: macOS 라이트·다크만 포함');
