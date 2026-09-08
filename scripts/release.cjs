// 현재 OS의 공개 배포 자산을 새로 만든다.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const version=require(path.join(root,'package.json')).version;

function releaseMac(){
  execFileSync(process.execPath,[path.join(__dirname,'package.cjs'),'mac'],{cwd:root,stdio:'inherit'});
  const image=path.join(root,'dist','YourSQL-Mac-arm64.dmg'),temporaryImage=image.replace(/\.dmg$/,'.new.dmg');
  const imageSource=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'yoursql-dmg-'));
  try {
    fs.cpSync(path.join(root,'dist/YourSQL-darwin-arm64/YourSQL.app'),path.join(imageSource,'YourSQL.app'),{recursive:true,verbatimSymlinks:true});
    fs.symlinkSync('/Applications',path.join(imageSource,'Applications'));
    fs.rmSync(temporaryImage,{force:true});
    execFileSync('/usr/bin/hdiutil',['create','-volname','YourSQL','-srcfolder',imageSource,'-ov','-format','UDZO',temporaryImage],{stdio:'inherit'});
    fs.rmSync(image,{force:true});fs.renameSync(temporaryImage,image);
    fs.rmSync(path.join(root,'dist','YourSQL-Mac-arm64.zip'),{force:true});
    console.log('배포 DMG 생성:',image);
  } finally {fs.rmSync(imageSource,{recursive:true,force:true});}
  execFileSync(process.execPath,[path.join(root,'tests','distribution-themes.cjs'),'release','mac'],{cwd:root,stdio:'inherit'});
  execFileSync(process.execPath,[path.join(root,'tests','mac-signature.cjs')],{cwd:root,stdio:'inherit'});
}

function releaseWindows(){
  execFileSync(process.execPath,[path.join(__dirname,'package.cjs'),'windows'],{cwd:root,stdio:'inherit'});
  const final=path.join(root,'dist','YourSQL-Setup-x64.exe');
  const temporary=path.join(root,'dist','YourSQL-Setup-x64.new.exe');
  const programFiles=process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)';
  const makensis=process.env.YOURSQL_MAKENSIS||path.join(programFiles,'NSIS','makensis.exe');
  fs.rmSync(temporary,{force:true});
  execFileSync(makensis,[
    `/DAPP_VERSION=${version}`,
    `/DSOURCE_DIR=${path.join(root,'dist','YourSQL-win32-x64')}`,
    `/DOUTPUT_FILE=${temporary}`,
    path.join(root,'installer','YourSQL.nsi')
  ],{cwd:root,stdio:'inherit'});
  fs.rmSync(final,{force:true});
  fs.renameSync(temporary,final);
  fs.rmSync(path.join(root,'dist','YourSQL-Windows-x64.zip'),{force:true});
  execFileSync(process.execPath,[path.join(root,'tests','distribution-themes.cjs'),'release','windows'],{cwd:root,stdio:'inherit'});
}

if(process.platform==='darwin') releaseMac();
else if(process.platform==='win32') releaseWindows();
else throw new Error('npm run release는 macOS 또는 Windows에서만 지원합니다.');
