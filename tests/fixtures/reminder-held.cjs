// 알림 검사 중 일반 실행이 들어오는 순간을 재현하는 테스트 전용 진입점.
const modulePath=require.resolve('../../lib/reminder-runtime.cjs');
const runtimeModule=require(modulePath),original=runtimeModule.createReminderRuntime;
runtimeModule.createReminderRuntime=options=>{
  const runtime=original(options),check=runtime.check;
  let first=true;
  runtime.check=async value=>{
    if(first){first=false;await new Promise(resolve=>{const timer=setInterval(()=>{if(global.releaseReminderCheck){clearInterval(timer);resolve();}},20);});}
    return check(value);
  };
  return runtime;
};
require('../../main.cjs');
