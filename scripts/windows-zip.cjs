// 매번 새 폴더 전체를 압축하고 파일 목록·해시를 확인한 뒤 ZIP을 교체한다.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash,randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
function manifest(directory){
 const result={};function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  const file=path.join(folder,entry.name);if(entry.isDirectory())visit(file);else{
   if(!entry.isFile())throw new Error('Windows ZIP에는 일반 파일과 폴더만 허용합니다.');
   result[path.relative(directory,file).split(path.sep).join('/')]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
 }}visit(directory);return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));
}
function powershell(args){execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'windows-zip.ps1'),...args],{stdio:'pipe'});}
function verifyWindowsZip(directory,archive){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-zip-check-'));
 try{
  if(process.platform==='win32')powershell(['-Action','Extract','-Source',archive,'-Destination',temporary]);
  else execFileSync('/usr/bin/unzip',['-q',archive,'-d',temporary]);
  const roots=fs.readdirSync(temporary);if(roots.length!==1||roots[0]!==path.basename(directory))throw new Error('Windows ZIP의 최상위 폴더가 일치하지 않습니다.');
  if(JSON.stringify(manifest(directory))!==JSON.stringify(manifest(path.join(temporary,roots[0]))))throw new Error('Windows ZIP의 파일 목록 또는 파일 해시가 새 빌드와 다릅니다.');
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
function createWindowsZip(directory,archive){
 const temporary=archive.replace(/\.zip$/,`.new-${randomUUID()}.zip`);
 try{
  if(process.platform==='win32')powershell(['-Action','Create','-Source',directory,'-Destination',temporary]);
  else execFileSync('/usr/bin/zip',['-q','-r',temporary,path.basename(directory)],{cwd:path.dirname(directory)});
  verifyWindowsZip(directory,temporary);fs.renameSync(temporary,archive);
 }finally{fs.rmSync(temporary,{force:true});}
}
module.exports={createWindowsZip,verifyWindowsZip};
if(require.main===module){const root=path.resolve(__dirname,'..');createWindowsZip(path.join(root,'dist/YourSQL-win32-x64'),path.join(root,'dist/YourSQL-Windows-x64.zip'));}
