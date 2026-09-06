// 시작 알림과 설정창은 같은 상태를 표시하며, 파일 교체는 메인 프로세스에 맡긴다.
document.addEventListener('DOMContentLoaded',async()=>{
  const repository=document.getElementById('update-repository');
  const save=document.getElementById('save-update-repository');
  const check=document.getElementById('check-updates');
  const install=document.getElementById('install-update');
  const status=document.getElementById('update-status');
  const popup=document.getElementById('update-dialog');
  const popupStatus=document.getElementById('update-dialog-status');
  const popupInstall=document.getElementById('update-now');
  const later=document.getElementById('update-later');
  let state={};
  function render(value) {
    state=value;
    const busy=['checking','downloading','preparing','installing'].includes(value.phase);
    document.getElementById('update-version').textContent=`현재 ${value.current}${value.latest?` · 최신 ${value.latest}`:''}`;
    status.textContent=value.message+(value.phase==='downloading'?` ${value.percent||0}%`:'');
    popupStatus.textContent=status.textContent;
    repository.disabled=save.disabled=check.disabled=busy;
    install.hidden=!value.available;
    install.disabled=popupInstall.disabled=busy || !value.installable;
    later.disabled=busy;
  }
  function report(error) {status.textContent=popupStatus.textContent=error.message;}
  async function checkVersion(startup=false) {
    try {
      const result=await window.practice.checkUpdates();render(result);
      if (startup && result.available && !popup.open) {
        document.getElementById('update-dialog-version').textContent=`${result.current} → ${result.latest}`;
        popup.showModal();
        later.focus();
      }
    } catch(error) {report(error);}
  }
  save.addEventListener('click',async()=>{
    try {
      render(await window.practice.saveUpdateRepository(repository.value));
      repository.value=state.repository?`https://github.com/${state.repository}`:'';
      if (state.repository) await checkVersion();
    } catch(error) {report(error);}
  });
  check.addEventListener('click',()=>checkVersion());
  async function update() {
    install.disabled=popupInstall.disabled=true;
    try {await window.practice.installUpdate();}
    catch(error) {render({...state,phase:'idle'});report(error);}
  }
  install.addEventListener('click',update);
  popupInstall.addEventListener('click',update);
  later.addEventListener('click',()=>popup.close());
  popup.addEventListener('cancel',event=>{if(later.disabled) event.preventDefault();});
  window.practice.onUpdateChanged(render);
  try {
    render(await window.practice.updateState());repository.value=state.repository?`https://github.com/${state.repository}`:'';
    if (state.repository) await checkVersion(true);
  } catch(error) {report(error);}
});
