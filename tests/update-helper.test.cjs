// 실제 보조 프로그램을 임시 앱에 실행해 교체·복구와 경로 인자 처리를 검사한다.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
test('Mac 보조 프로그램은 정상 앱을 교체하고 실행 실패 시 이전 앱을 복구한다',{skip:process.platform!=='darwin'},async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"yoursql-helper '한글-"));
  try {
    for(const success of [true,false]) {
      const work=path.join(directory,String(success));fs.mkdirSync(work);
      const target=path.join(directory,`기존 앱 ${success}.app`),candidate=path.join(work,'새 앱.app'),backup=path.join(work,'previous'),failed=path.join(work,'failed'),ready=path.join(work,'ready'),result=path.join(directory,`result-${success}`);
      for(const app of [target,candidate]) fs.mkdirSync(path.join(app,'Contents','MacOS'),{recursive:true});
      fs.writeFileSync(path.join(target,'Contents','MacOS','YourSQL'),'#!/bin/sh\nexit 0\n',{mode:0o755});
      fs.writeFileSync(path.join(candidate,'Contents','MacOS','YourSQL'),success?'#!/bin/sh\nprintf ready > "$YOURSQL_UPDATE_WORK/ready"\n':'#!/bin/sh\nexit 1\n',{mode:0o755});
      fs.writeFileSync(path.join(target,'old'),'이전 앱');fs.writeFileSync(path.join(candidate,'new'),'새 앱');
      const child=spawn('/bin/sh',[path.resolve(__dirname,'../lib/update-helper.sh'),target,candidate,backup,failed,ready,result,'99999999'],{stdio:'pipe'});
      let error='';child.stderr.on('data',chunk=>error+=chunk);
      const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
      assert.equal(code,success?0:1,error);
      assert.equal(fs.readFileSync(result,'utf8').trim(),success?'success':'rollback');
      assert.ok(fs.existsSync(path.join(target,success?'new':'old')));
    }
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
// Windows에서 실행하면 실제 PowerShell 교체·테마 보존·실패 복구를 검사한다.
test('Windows 보조 프로그램은 테마를 보존하고 실행 실패 시 복구한다',{skip:process.platform!=='win32'},async()=>{
  const {execFileSync}=require('node:child_process');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-helper-'));
  const powershell=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const encoded=script=>['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
  try {
    for(const success of [true,false]) {
      const work=path.join(directory,String(success));fs.mkdirSync(work);
      const target=path.join(directory,`기존 앱 [${success}]`),candidate=path.join(work,'새 앱');
      for(const folder of [target,candidate]) fs.mkdirSync(path.join(folder,'theme'),{recursive:true});
      fs.writeFileSync(path.join(target,'theme','custom.json'),'내 테마');
      fs.writeFileSync(path.join(candidate,'theme','default.json'),'기본 테마');
      for(const folder of [target,candidate]) {
        const acknowledge=folder===candidate && success;
        const source=`using System; using System.IO; public class App { public static void Main() { ${acknowledge?'File.WriteAllText(Path.Combine(Environment.GetEnvironmentVariable("YOURSQL_UPDATE_WORK"), "ready"), "ready");':''} } }`;
        // Add-Type은 대괄호를 와일드카드로 해석하므로 컴파일 후 실제 검사 경로로 옮긴다.
        const compiled=path.join(work,folder===candidate?'new.exe':'old.exe');
        execFileSync(powershell,encoded('Add-Type -TypeDefinition $env:TEST_SOURCE -OutputAssembly $env:TEST_OUTPUT -OutputType ConsoleApplication'),{env:{...process.env,TEST_SOURCE:source,TEST_OUTPUT:compiled}});
        fs.renameSync(compiled,path.join(folder,'YourSQL.exe'));
      }
      const result=path.join(directory,`result-${success}`),transactionFile=path.join(work,'transaction.json');
      fs.writeFileSync(transactionFile,JSON.stringify({target,candidate,backup:path.join(work,'previous'),failed:path.join(work,'failed'),ready:path.join(work,'ready'),result,parent:99999999}));
      const child=spawn(powershell,encoded(fs.readFileSync(path.join(__dirname,'../lib/update-helper.ps1'),'utf8')),{env:{...process.env,YOURSQL_UPDATE_TRANSACTION:transactionFile},stdio:'pipe'});
      let error='';child.stderr.on('data',chunk=>error+=chunk);
      const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
      const diagnostic=path.join(work,'error.txt');
      assert.equal(code,success?0:1,error+(fs.existsSync(diagnostic)?fs.readFileSync(diagnostic,'utf8'):''));
      assert.equal(fs.readFileSync(result,'utf8').trim(),success?'success':'rollback');
      assert.equal(fs.readFileSync(path.join(target,'theme','custom.json'),'utf8'),'내 테마');
      assert.equal(fs.existsSync(path.join(target,'theme','default.json')),false);
    }
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
