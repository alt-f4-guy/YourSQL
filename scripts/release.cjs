// 두 앱을 새로 빌드한 뒤 GitHub Releases에 올릴 ZIP을 다시 만든다.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if (process.platform!=='darwin') throw new Error('Mac 심볼릭 링크를 보존하기 위해 Mac에서 npm run release를 실행하세요. Windows에서는 npm run package:windows를 사용할 수 있습니다.');
execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{cwd:root,stdio:'inherit'});
for(const [folder,name] of [['YourSQL-darwin-arm64','YourSQL-Mac-arm64.zip'],['YourSQL-win32-x64','YourSQL-Windows-x64.zip']]) {
  const source=path.join(root,'dist',folder),zip=path.join(root,'dist',name),temporary=zip.replace(/\.zip$/,'.new.zip');
  fs.rmSync(temporary,{force:true});
  execFileSync('/usr/bin/ditto',['-c','-k','--keepParent','--norsrc',source,temporary],{stdio:'inherit'});
  fs.rmSync(zip,{force:true});fs.renameSync(temporary,zip);
  console.log('배포 ZIP 생성:',zip);
}
