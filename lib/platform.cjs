// 공유 앱에서 운영체제에 따라 달라지는 경로만 분리한다.
const path=require('node:path');
function themeDirectory(executable,platform=process.platform) {
  const paths=platform==='win32'?path.win32:path.posix;
  return paths.resolve(paths.dirname(executable),platform==='darwin'?'../../..':'.','theme');
}
function mysqlCandidates(platform=process.platform,env=process.env) {
  const paths=platform==='win32'?path.win32:path.posix;
  const installed=platform==='win32'
    ? ['8.4','8.0'].map(version=>paths.join(env.ProgramFiles||'C:\\Program Files','MySQL',`MySQL Server ${version}`,'bin','mysqld.exe'))
    : ['/usr/local/mysql/bin/mysqld','/opt/homebrew/opt/mysql@8.0/bin/mysqld','/opt/homebrew/opt/mysql@8.4/bin/mysqld','/opt/homebrew/opt/mysql/bin/mysqld'];
  return [env.YOURSQL_MYSQLD,...installed,...(env.PATH||'').split(paths.delimiter).filter(Boolean).map(folder=>paths.join(folder,platform==='win32'?'mysqld.exe':'mysqld'))].filter(Boolean);
}
function validSocket(socket,platform=process.platform) {
  return platform==='win32' ? /^\\\\\.\\pipe\\yoursql-[a-f0-9]{32}$/.test(socket) : /^\/tmp\/aura-sql-[A-Za-z0-9]+\/mysql\.sock$/.test(socket);
}
module.exports={themeDirectory,mysqlCandidates,validSocket};
