// 같은 소스로 Mac과 Windows 배포본을 만들고 개인 기록은 제외한다.
const path = require('node:path');
const fs = require('node:fs');
async function main() {
  const {packager} = await import('@electron/packager');
  const root=path.resolve(__dirname,'..');
  const name='YourSQL';
  const version=require('../package.json').version;
  const target=process.argv[2]||'all';
  if (!['all','mac','windows'].includes(target)) throw new Error('빌드 대상은 all, mac, windows 중 하나여야 합니다.');
  const staging=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'sql-package-'));
  try {
    const paths=[];
    for (const [label,platform,arch,icon] of [['mac','darwin','arm64','icon.icns'],['windows','win32','x64','icon.ico']]) {
      if (target!=='all' && target!==label) continue;
      paths.push(...await packager({dir:root,out:staging,name,platform,arch,
      appBundleId:'local.yoursql.practice',appVersion:version,buildVersion:version,asar:{unpack:'**/*.node'},overwrite:true,
      icon:path.join(root,'assets',icon),
      ignore:[/^\/[^/]+\.app(\/|$)/,/^\/(dist|artifacts|tests|scripts|docs|examples|theme)(\/|$)/,/^\/assets\/icon\.iconset/,/^\/\..*runtime/,/^\/\.yoursql-update-/,/^\/content\/(build-content\.cjs|extra-[a-z]+\.cjs|hints\.cjs|mutants\.cjs|checks\.json)$/],
      extendInfo:{NSHumanReadableCopyright:'로컬 SQL 코딩 테스트 연습장'}}));
    }
    // 배포 폴더는 공개용 테마만 구성한다. 루트의 개인 테마는 건드리지 않는다.
    for (const output of paths) {
      const destinationDirectory=path.join(root,'dist',path.basename(output));
      fs.mkdirSync(destinationDirectory,{recursive:true});
      for (const file of fs.readdirSync(output)) {
        const destination=path.join(destinationDirectory,file);
        fs.rmSync(destination,{recursive:true,force:true});
        fs.cpSync(path.join(output,file),destination,{recursive:true,verbatimSymlinks:true});
      }
      const destination=path.join(destinationDirectory,'theme');
      fs.rmSync(destination,{recursive:true,force:true});
      fs.mkdirSync(destination,{recursive:true});
      for (const file of ['macos-light.json','macos-dark.json']) {
        fs.copyFileSync(path.join(root,'theme',file),path.join(destination,file));
      }
      const [platform,arch]=path.basename(output).replace('YourSQL-','').split('-');
      fs.writeFileSync(path.join(destinationDirectory,'update.json'),JSON.stringify({product:name,version,platform,arch},null,2));
      console.log('앱 생성:',destinationDirectory);
    }
  } finally { fs.rmSync(staging,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
