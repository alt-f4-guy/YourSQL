// 사용자가 받는 ZIP을 풀어 중첩 코드와 리소스 서명을 검증한다.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-signed-'));
try{
  execFileSync('/usr/bin/ditto',['-x','-k',path.join(root,'dist/YourSQL-Mac-arm64.zip'),temporary]);
  const app=path.join(temporary,'YourSQL-darwin-arm64/YourSQL.app');
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app],{stdio:'inherit'});
  // codesign의 표시 정보는 stderr이므로 별도로 수집한다.
  const details=require('node:child_process').spawnSync('/usr/bin/codesign',['--display','--verbose=4',app],{encoding:'utf8'});
  assert.equal(details.status,0);assert.match(details.stderr,/Signature=adhoc/);assert.match(details.stderr,/Identifier=local\.yoursql\.practice/);
  if(process.argv.includes('--launch'))execFileSync(process.execPath,[path.join(root,'tests/ui-check.cjs')],{cwd:root,env:{...process.env,YOURSQL_TEST_EXECUTABLE:path.join(app,'Contents/MacOS/YourSQL')},stdio:'inherit'});
  console.log('Mac ZIP 압축 해제 후 임시 서명·리소스 무결성 검사 통과');
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
