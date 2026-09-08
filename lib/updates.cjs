const REPOSITORY='alt-f4-guy/YourSQL';

function versionParts(value) {
  return typeof value==='string' && /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) && value.length<50
    ? value.slice(1).split('.').map(BigInt) : null;
}
function assetName(platform,arch) {
  if(platform==='darwin'&&arch==='arm64') return 'YourSQL-Mac-arm64.dmg';
  if(platform==='win32'&&arch==='x64') return 'YourSQL-Setup-x64.exe';
  return null;
}
async function checkUpdate(current,platform,arch,fetcher=fetch) {
  const base={current,latest:null,available:false,downloadable:false};
  try {
    const response=await fetcher(`https://api.github.com/repos/${REPOSITORY}/releases/latest`,{
      headers:{Accept:'application/vnd.github+json','User-Agent':'YourSQL'},
      signal:AbortSignal.timeout(10000),redirect:'error'
    });
    if(!response.ok) return {...base,message:response.status===404?'정식 릴리스를 찾지 못했습니다.':`업데이트 확인 실패 (${response.status}). 잠시 후 다시 확인하세요.`};
    const release=await response.json(),next=versionParts(release?.tag_name),installed=versionParts(`v${current}`);
    if(!next||!installed||release.draft||release.prerelease) return {...base,message:'비교 가능한 정식 버전 태그(v0.0.6 형식)가 없습니다.'};
    const different=next.findIndex((part,index)=>part!==installed[index]);
    const available=different!==-1&&next[different]>installed[different];
    const latest=release.tag_name.slice(1);
    if(!available) return {...base,latest,message:'현재 버전이 최신입니다.'};
    const expected=assetName(platform,arch);
    const downloadable=Boolean(expected&&release.assets?.some(asset=>asset?.name===expected));
    return {...base,latest,available,downloadable,
      ...(downloadable?{url:`https://github.com/${REPOSITORY}/releases/tag/${release.tag_name}`} : {}),
      message:downloadable?'업데이트가 있습니다.':`${platform==='win32'?'Windows 설치 파일':'Mac 디스크 이미지'}이 아직 등록되지 않았습니다.`};
  } catch {return {...base,message:'인터넷 연결을 확인하고 다시 시도하세요.'};}
}

class Updater {
  constructor(app,notify,openExternal,platform=process.platform,arch=process.arch,fetcher=(...args)=>fetch(...args)) {
    this.app=app;this.notify=notify;this.openExternal=openExternal;
    this.platform=platform;this.arch=arch;this.fetcher=fetcher;
    this.state={current:app.getVersion(),latest:null,available:false,downloadable:false,phase:'idle',message:'업데이트 확인 대기 중'};
  }
  publish(value){Object.assign(this.state,value);this.notify({...this.state});return {...this.state};}
  async check(){
    this.publish({phase:'checking',message:'업데이트 확인 중…'});
    const {url,...state}=await checkUpdate(this.app.getVersion(),this.platform,this.arch,this.fetcher);
    this.url=url;
    return this.publish({...state,phase:'idle'});
  }
  async open(){
    if(!this.state.downloadable||!this.url) throw new Error('먼저 설치 가능한 새 버전을 확인하세요.');
    await this.openExternal(this.url);
    return {...this.state};
  }
}
module.exports={versionParts,assetName,checkUpdate,Updater};
