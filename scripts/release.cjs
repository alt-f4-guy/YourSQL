// 두 앱을 새로 빌드한 뒤 GitHub Releases에 올릴 ZIP을 다시 만든다.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if (process.platform!=='darwin') throw new Error('Mac 심볼릭 링크를 보존하기 위해 Mac에서 npm run release를 실행하세요. Windows에서는 npm run package:windows를 사용할 수 있습니다.');
execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{cwd:root,stdio:'inherit'});
const image=path.join(root,'dist','YourSQL-Mac-arm64.dmg'),temporaryImage=image.replace(/\.dmg$/,'.new.dmg');
const imageSource=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yoursql-dmg-'));
try {
  fs.cpSync(path.join(root,'dist/YourSQL-darwin-arm64/YourSQL.app'),path.join(imageSource,'YourSQL.app'),{recursive:true,verbatimSymlinks:true});
  fs.symlinkSync('/Applications',path.join(imageSource,'Applications'));
  fs.rmSync(temporaryImage,{force:true});
  execFileSync('/usr/bin/hdiutil',['create','-volname','YourSQL','-srcfolder',imageSource,'-ov','-format','UDZO',temporaryImage],{stdio:'inherit'});
  fs.rmSync(image,{force:true});fs.renameSync(temporaryImage,image);
  fs.rmSync(path.join(root,'dist/YourSQL-Mac-arm64.zip'),{force:true});
  console.log('배포 DMG 생성:',image);
} finally {fs.rmSync(imageSource,{recursive:true,force:true});}
const windows=path.join(root,'dist','YourSQL-Windows-x64.zip'),temporaryWindows=windows.replace(/\.zip$/,'.new.zip');
fs.rmSync(temporaryWindows,{force:true});
execFileSync('/usr/bin/ditto',['-c','-k','--keepParent','--norsrc',path.join(root,'dist/YourSQL-win32-x64'),temporaryWindows],{stdio:'inherit'});
fs.rmSync(windows,{force:true});fs.renameSync(temporaryWindows,windows);
console.log('배포 ZIP 생성:',windows);
execFileSync(process.execPath,[path.join(root,'tests','distribution-themes.cjs')],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'tests','mac-signature.cjs')],{cwd:root,stdio:'inherit'});
