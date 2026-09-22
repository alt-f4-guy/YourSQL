const fs=require('node:fs'),path=require('node:path');
// 제거 프로세스가 공유 쓰기를 금지한 표식을 실제로 잡고 있을 때만 차단한다.
function isUninstalling(executable,platform=process.platform){
 if(platform!=='win32')return false;
 const directory=path.dirname(executable),file=path.join(directory,'.yoursql-uninstall');
 let marker;try{marker=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return false;}
 if(!Number.isInteger(marker.pid)||marker.pid<=0||typeof marker.installDirectory!=='string'||path.resolve(marker.installDirectory).toLowerCase()!==path.resolve(directory).toLowerCase())return false;
 try{process.kill(marker.pid,0);}catch{return false;}
 try{const fd=fs.openSync(file,'r+');fs.closeSync(fd);return false;}
 catch(error){return ['EBUSY','EPERM','EACCES'].includes(error.code);}
}
module.exports={isUninstalling};
