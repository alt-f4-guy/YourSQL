// 시작 알림과 설정창은 같은 공식 릴리스 상태를 표시한다.
document.addEventListener('DOMContentLoaded',async()=>{
  const check=document.getElementById('check-updates');
  const open=document.getElementById('open-update-page');
  const status=document.getElementById('update-status');
  const popup=document.getElementById('update-dialog');
  const popupStatus=document.getElementById('update-dialog-status');
  const popupOpen=document.getElementById('update-now');
  const later=document.getElementById('update-later');
  let state={};
  function render(value){
    state=value;
    const busy=value.phase==='checking';
    document.getElementById('update-version').textContent=`현재 ${value.current}${value.latest?` · 최신 ${value.latest}`:''}`;
    status.textContent=popupStatus.textContent=value.message;
    check.disabled=busy;
    open.hidden=!value.available;
    open.disabled=popupOpen.disabled=busy||!value.downloadable;
    later.disabled=false;
  }
  function report(error){render({...state,message:error.message});}
  async function checkVersion(startup=false){
    try {
      const result=await window.practice.checkUpdates();render(result);
      if(startup&&result.available&&!popup.open){
        document.getElementById('update-dialog-version').textContent=`${result.current} → ${result.latest}`;
        popup.showModal();
        later.focus();
      }
    } catch(error){report(error);}
  }
  async function openPage(){
    open.disabled=popupOpen.disabled=true;
    try {await window.practice.openUpdatePage();popup.close();}
    catch(error){report(error);}
    finally {render(state);}
  }
  check.addEventListener('click',()=>checkVersion());
  open.addEventListener('click',openPage);
  popupOpen.addEventListener('click',openPage);
  later.addEventListener('click',()=>popup.close());
  window.practice.onUpdateChanged(render);
  try {render(await window.practice.updateState());await checkVersion(true);}
  catch(error){report(error);}
});
