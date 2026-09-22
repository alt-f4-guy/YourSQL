const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('Windows ZIP은 새 폴더 전체와 바이트가 같고 이전 파일·누락을 거부한다',t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-zip-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const dir=path.join(base,'YourSQL-win32-x64'),zip=path.join(base,'YourSQL-Windows-x64.zip');fs.mkdirSync(path.join(dir,'resources'),{recursive:true});
 fs.writeFileSync(path.join(dir,'YourSQL.exe'),'new-app');fs.writeFileSync(path.join(dir,'resources','app.asar'),'version-0.0.11');fs.writeFileSync(path.join(dir,'.included'),'hidden');
 const {createWindowsZip,verifyWindowsZip}=require('../scripts/windows-zip.cjs');createWindowsZip(dir,zip);verifyWindowsZip(dir,zip);
 fs.writeFileSync(path.join(dir,'YourSQL.exe'),'changed');assert.throws(()=>verifyWindowsZip(dir,zip),/ZIP/);
 createWindowsZip(dir,zip);verifyWindowsZip(dir,zip);
 fs.unlinkSync(path.join(dir,'.included'));assert.throws(()=>verifyWindowsZip(dir,zip),/ZIP/);
});
