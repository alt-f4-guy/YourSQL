// 공개 릴리스만 신뢰하며 다운로드 검증이 끝나기 전에는 현재 앱을 변경하지 않는다.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {atomicJSON}=require('./core.cjs');

function normalizeRepository(value) {
  if (typeof value!=='string' || value.length>300) throw new Error('공개 GitHub 저장소 주소를 입력하세요.');
  const repository=value.trim().replace(/^https:\/\/github\.com\//i,'').replace(/\/$/,'').replace(/\.git$/,'');
  if (repository && (!/^[a-z\d][a-z\d-]{0,38}\/[a-z\d_.-]{1,100}$/i.test(repository) || /^\.+$/.test(repository.split('/')[1]))) throw new Error('https://github.com/계정/저장소 형식으로 입력하세요.');
  return repository;
}
function versionParts(value) {
  return typeof value==='string' && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) && value.length<50 ? value.replace(/^v/,'').split('.').map(BigInt) : null;
}
async function checkUpdate(value,current,fetcher=fetch) {
  const repository=normalizeRepository(value),result={repository,current,available:false};
  if (!repository) return {...result,message:'공개 GitHub 저장소를 저장하면 앱 실행 시 업데이트를 확인합니다.'};
  try {
    const response=await fetcher(`https://api.github.com/repos/${repository}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'YourSQL'},signal:AbortSignal.timeout(10000),redirect:'error'});
    if (!response.ok) return {...result,message:response.status===404?'공개 저장소 또는 정식 릴리스를 찾지 못했습니다.':`업데이트 확인 실패 (${response.status}). 잠시 후 다시 확인하세요.`};
    const release=await response.json(),parts=versionParts(release?.tag_name),installed=versionParts(current);
    if (!parts || !installed || release.draft || release.prerelease) return {...result,message:'비교 가능한 정식 버전 태그(v0.0.2 형식)가 없습니다.'};
    const different=parts.findIndex((part,index)=>part!==installed[index]);
    const available=different!==-1 && parts[different]>installed[different];
    return {...result,available,latest:release.tag_name.replace(/^v/,''),release,message:available?'업데이트가 있습니다.':'현재 버전이 최신입니다.'};
  } catch {return {...result,message:'인터넷 연결을 확인하고 다시 시도하세요.'};}
}
function selectAsset(release,repository,platform,arch) {
  const name=platform==='darwin' && arch==='arm64'?'YourSQL-Mac-arm64.zip':platform==='win32' && arch==='x64'?'YourSQL-Windows-x64.zip':null;
  const asset=name && release.assets?.find(item=>item.name===name);
  if (!asset) throw new Error('이 운영체제용 업데이트 ZIP이 아직 등록되지 않았습니다.');
  const expected=`https://github.com/${repository}/releases/download/${encodeURIComponent(release.tag_name)}/${name}`;
  if (typeof asset.browser_download_url!=='string' || asset.browser_download_url.toLowerCase()!==expected.toLowerCase() || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || !Number.isSafeInteger(asset.size) || asset.size<=0 || asset.size>1024**3) throw new Error('업데이트 파일의 주소·크기·SHA-256 검증 정보를 확인할 수 없습니다.');
  return asset;
}
// GitHub의 HTTPS 다운로드 리디렉션만 따라가며 스트림으로 크기와 해시를 확인한다.
async function downloadAsset(asset,file,progress=()=>{},fetcher=fetch) {
  let url=asset.browser_download_url,response;
  const signal=AbortSignal.timeout(10*60*1000);
  for (let redirects=0;redirects<=5;redirects++) {
    const parsed=new URL(url);
    if (parsed.protocol!=='https:' || parsed.username || parsed.password || parsed.port || !['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname)) throw new Error('허용되지 않은 다운로드 주소입니다.');
    response=await fetcher(url,{redirect:'manual',signal});
    if (![301,302,303,307,308].includes(response.status)) break;
    const location=response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('다운로드 주소가 없습니다.');
    url=new URL(location,url).href;
  }
  if (!response.ok || !response.body) throw new Error('업데이트 파일을 다운로드하지 못했습니다.');
  const hash=createHash('sha256');
  let received=0,last=-1;
  await pipeline(Readable.from((async function*(){
    for await (const chunk of response.body) {
      received+=chunk.length;
      if (received>asset.size) throw new Error('다운로드 크기 검증에 실패했습니다.');
      hash.update(chunk);
      const percent=Math.floor(received/asset.size*100);
      if (percent!==last) {last=percent;progress(percent);}
      yield chunk;
    }
  })()),fs.createWriteStream(file,{flags:'wx',mode:0o600}));
  if (received!==asset.size || `sha256:${hash.digest('hex')}`!==asset.digest) throw new Error('다운로드 파일 검증에 실패했습니다. 현재 앱을 유지합니다.');
}
function validatePackage(directory,version,platform,arch) {
  const root=path.join(directory,`YourSQL-${platform}-${arch}`);
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'update.json'),'utf8'));
  if (metadata.product!=='YourSQL' || metadata.version!==version || metadata.platform!==platform || metadata.arch!==arch) throw new Error('배포 대상 또는 버전이 일치하지 않습니다.');
  const candidate=platform==='darwin'?path.join(root,'YourSQL.app'):root;
  const executable=platform==='darwin'?'Contents/MacOS/YourSQL':'YourSQL.exe';
  const resources=platform==='darwin'?'Contents/Resources':'resources';
  if (!fs.statSync(path.join(candidate,executable)).isFile()) throw new Error('실행 앱이 없습니다.');
  // Electron의 파일 API로 ASAR 내부 버전도 검사한다.
  const packaged=JSON.parse(fs.readFileSync(path.join(candidate,resources,'app.asar','package.json'),'utf8'));
  if (packaged.name!=='yoursql' || packaged.version!==version) throw new Error('앱 이름 또는 내부 버전이 일치하지 않습니다.');
  return candidate;
}

// 메인 프로세스만 릴리스 정보와 설치 경로를 보관한다. 화면은 임의 파일을 지정할 수 없다.
class Updater {
  constructor(app,notify) {
    this.app=app;this.notify=notify;this.busy=false;
    this.file=path.join(app.getPath('userData'),'updates.json');
    this.resultFile=path.join(app.getPath('userData'),'update-result.txt');
    let repository='alt-f4-guy/YourSQL';
    try {repository=normalizeRepository(JSON.parse(fs.readFileSync(this.file,'utf8')).repository);} catch {}
    this.state={repository,current:app.getVersion(),available:false,installable:false,message:repository?'업데이트 확인 대기 중':'공개 GitHub 저장소를 입력하세요.'};
  }
  publish(value) {Object.assign(this.state,value);this.notify({...this.state});return {...this.state};}
  save(value) {
    if (this.busy) throw new Error('업데이트 작업이 끝난 뒤 저장소를 변경하세요.');
    const repository=normalizeRepository(value);
    atomicJSON(this.file,{repository});this.release=null;
    return this.publish({repository,available:false,installable:false,latest:null,message:repository?'저장했습니다. 업데이트를 확인하세요.':'자동 확인을 해제했습니다.'});
  }
  async check() {
    if (this.busy) return {...this.state};
    this.busy=true;this.publish({phase:'checking',message:'업데이트 확인 중…'});
    try {
      const {release,...result}=await checkUpdate(this.state.repository,this.app.getVersion());
      this.release=release;
      let installable=false;
      if (result.available) {
        try {selectAsset(release,result.repository,process.platform,process.arch);installable=this.app.isPackaged;}
        catch(error) {result.message=error.message;}
        if (!this.app.isPackaged) result.message='새 버전이 있습니다. 업데이트 설치는 빌드된 앱에서 사용할 수 있습니다.';
      }
      return this.publish({...result,latest:result.latest||null,installable,phase:'idle'});
    } finally {this.busy=false;}
  }
  async install() {
    if (this.busy || !this.state.installable || !this.release) throw new Error('먼저 설치 가능한 새 버전을 확인하세요.');
    this.busy=true;
    let work,helperChild,handedOff=false;
    try {
      const target=process.platform==='darwin'?path.resolve(path.dirname(process.execPath),'../..'):path.dirname(process.execPath);
      if (target.includes('/AppTranslocation/') || path.dirname(target)===target) throw new Error('앱을 쓰기 가능한 일반 폴더로 옮긴 후 다시 실행하세요.');
      const relativeData=path.relative(target,this.app.getPath('userData'));
      if (!relativeData.startsWith(`..${path.sep}`) && relativeData!=='..' && !path.isAbsolute(relativeData)) throw new Error('학습 기록이 앱 교체 경로 안에 있어 업데이트를 중단했습니다.');
      work=fs.mkdtempSync(path.join(path.dirname(target),'.yoursql-update-'));
      const asset=selectAsset(this.release,this.state.repository,process.platform,process.arch);
      this.publish({phase:'downloading',message:'업데이트 다운로드 중…',percent:0});
      await downloadAsset(asset,path.join(work,'update.zip'),percent=>this.publish({percent}));
      this.publish({phase:'preparing',message:'파일을 검증하고 새 앱을 준비하는 중…'});
      const {extract}=await import('@electron-internal/extract-zip');
      await extract(path.join(work,'update.zip'),{dir:path.join(work,'extracted')});
      const candidate=validatePackage(path.join(work,'extracted'),this.state.latest,process.platform,process.arch);
      const extension=process.platform==='darwin'?'sh':'ps1';
      const helper=path.join(work,`helper.${extension}`);
      fs.copyFileSync(path.join(__dirname,`update-helper.${extension}`),helper);
      const transaction={target,candidate,backup:path.join(work,'previous'),failed:path.join(work,'failed'),ready:path.join(work,'ready'),result:this.resultFile,parent:process.pid};
      atomicJSON(path.join(work,'transaction.json'),transaction);
      const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
      const command=process.platform==='darwin'?'/bin/sh':process.env.ComSpec||path.join(process.env.SystemRoot||'C:\\Windows','System32','cmd.exe');
      const args=process.platform==='darwin'?[helper,target,candidate,transaction.backup,transaction.failed,transaction.ready,this.resultFile,String(process.pid)]:['/d','/s','/c',powershell,'-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(fs.readFileSync(helper,'utf8'),'utf16le').toString('base64')];
      // 시작 전 PowerShell 오류도 작업 폴더 정리와 무관하게 보존한다.
      const helperOutput=path.join(this.app.getPath('userData'),'update-helper-output.txt');
      const output=fs.openSync(helperOutput,'w',0o600);
      let child;
      // Windows PowerShell은 직접 분리하면 실행되지 않으므로 cmd를 분리하고 그 자식으로 실행한다.
      try {child=spawn(command,args,{detached:true,stdio:['ignore',output,output],cwd:work,windowsHide:true,env:{...process.env,YOURSQL_UPDATE_TRANSACTION:path.join(work,'transaction.json')}});}
      finally {fs.closeSync(output);}
      helperChild=child;
      await new Promise((resolve,reject)=>{child.once('error',reject);child.once('spawn',resolve);});
      // 명령 실행·권한 오류가 있으면 현재 앱을 종료하지 않는다.
      for (let attempt=0;!fs.existsSync(path.join(work,'armed'));attempt++) {
        if (attempt>=100 || child.exitCode!==null) {
          const detail=fs.readFileSync(helperOutput,'utf8').trim().slice(-8000);
          throw new Error(`업데이트 보조 프로그램을 시작하지 못했습니다. (종료 코드: ${child.exitCode ?? '실행 중'})${detail?`\n${detail}`:''}`);
        }
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      child.unref();handedOff=true;
      this.publish({phase:'installing',message:'학습 내용을 저장하고 앱을 종료합니다. 잠시 후 다시 실행됩니다.'});
      this.app.quit();
    } catch(error) {
      // 정리 과정이 실패하더라도 설치 단계의 원인과 경로를 보존한다.
      try {fs.writeFileSync(path.join(this.app.getPath('userData'),'update-error.txt'),`${new Date().toISOString()} ${this.state.phase || 'preparing'}\n${error.stack || error}\n작업 폴더: ${work || ''}\n`,{mode:0o600});} catch {}
      this.publish({phase:'idle',message:`업데이트 실패: ${error.message}`,percent:null});
      throw error;
    } finally {
      if (!handedOff) {
        try {
          // Windows는 보조 프로세스가 작업 폴더를 놓은 뒤에만 삭제할 수 있다.
          if (helperChild?.pid && helperChild.exitCode===null && helperChild.signalCode===null) {
            const stopped=once(helperChild,'close',{signal:AbortSignal.timeout(5000)});
            try {helperChild.kill();} finally {await stopped;}
          }
          if (work) await fs.promises.rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:200});
        } catch(error) {
          try {fs.appendFileSync(path.join(this.app.getPath('userData'),'update-error.txt'),`정리 실패 (${error.code || ''}): ${error.stack || error}\n`);} catch {}
        } finally {this.busy=false;}
      }
    }
  }
  confirmLaunch() {
    // 보조 프로그램이 전달한 작업 폴더와 실제 실행 경로가 일치할 때만 성공을 알린다.
    const work=process.env.YOURSQL_UPDATE_WORK;
    if (work) {
      const transaction=JSON.parse(fs.readFileSync(path.join(work,'transaction.json'),'utf8'));
      const target=process.platform==='darwin'?path.resolve(path.dirname(process.execPath),'../..'):path.dirname(process.execPath);
      if (transaction.target!==target || transaction.ready!==path.join(work,'ready')) throw new Error('업데이트 실행 확인 경로가 일치하지 않습니다.');
      fs.writeFileSync(transaction.ready,'ready',{mode:0o600});
      delete process.env.YOURSQL_UPDATE_WORK;
    }
    try {
      const outcome=fs.readFileSync(this.resultFile,'utf8').trim();
      if (outcome==='rollback') this.publish({message:'새 앱을 시작하지 못해 이전 앱으로 복구했습니다.'});
      else if (outcome==='failed') this.publish({message:'이전 업데이트가 완료되지 않았습니다. 현재 앱과 백업 폴더를 확인하세요.'});
    } catch {}
  }
}
module.exports={normalizeRepository,checkUpdate,selectAsset,downloadAsset,validatePackage,Updater};
