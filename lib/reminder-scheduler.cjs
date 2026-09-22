// OS에는 실행 경로와 검사 인자만 등록한다. 목표와 날짜는 실행 시 다시 읽는다.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {promisify}=require('node:util');
const exec=promisify(require('node:child_process').execFile);
const APP_ID='local.yoursql.practice';
const TOAST_CLSID='{C00C9F0B-5698-4B7D-9845-487475797391}';
const xmlEscape=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
function launchAgentXML({executable,label,environment={}}){return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${xmlEscape(label)}</string>
<key>ProgramArguments</key><array><string>${xmlEscape(executable)}</string><string>--reminder-check</string></array>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
<key>RunAtLoad</key><true/><key>ProcessType</key><string>Background</string><key>LimitLoadToSessionType</key><string>Aqua</string>
<key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([k,v])=>`<key>${xmlEscape(k)}</key><string>${xmlEscape(v)}</string>`).join('')}</dict>
</dict></plist>`;}
function windowsTaskXML({executable,sid}){return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<Triggers><CalendarTrigger><StartBoundary>2026-01-01T20:00:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger><LogonTrigger><Enabled>true</Enabled><UserId>${xmlEscape(sid)}</UserId></LogonTrigger></Triggers>
<Principals><Principal id="User"><UserId>${xmlEscape(sid)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><WakeToRun>false</WakeToRun></Settings>
<Actions Context="User"><Exec><Command>${xmlEscape(executable)}</Command><Arguments>--reminder-check</Arguments><WorkingDirectory>${xmlEscape(path.win32.dirname(executable))}</WorkingDirectory></Exec></Actions></Task>`;}
const psQuote=s=>`'${String(s).replaceAll("'","''")}'`;
function createScheduler({platform=process.platform,executable=process.execPath,packaged=false,testData=false,testId=null,directory,home=os.homedir(),shell,run=exec}={}){
  if(testId&&!/^test-[a-z0-9-]+$/.test(testId))throw new Error('테스트 작업 식별자를 확인하세요.');
  const label=`${APP_ID}.reminder${testId?`.${testId}`:''}`,taskName=`YourSQL Daily Reminder${testId?` ${testId}`:''}`;
  const file=path.join(home,'Library','LaunchAgents',`${label}.plist`),domain=`gui/${process.getuid?.()}`;
  const shortcut=path.join(process.env.APPDATA||home,'Microsoft','Windows','Start Menu','Programs','YourSQL','YourSQL Reminders.lnk');
  const guard=()=>{if(testData&&!testId)throw new Error('테스트 데이터에서는 OS 알림 작업을 등록·해제하지 않습니다.');if(!packaged)throw new Error('배포된 YourSQL 앱에서 알림을 켜 주세요.');if(!['darwin','win32'].includes(platform))throw new Error('이 운영체제에서는 학습 알림을 지원하지 않습니다.');if(testId&&platform==='win32')throw new Error('Windows 예약 실기는 전용 사용자 계정에서 확인하세요.');};
  const powershell=source=>run('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(`$ErrorActionPreference='Stop'; ${source}`,'utf16le').toString('base64')],{windowsHide:true,timeout:20000});
  async function removeMac(){
    try{await run('/bin/launchctl',['print',`${domain}/${label}`]);}catch{return;}
    await run('/bin/launchctl',['bootout',`${domain}/${label}`]);
  }
  return {identity:executable,label,taskName,file,
    async register(){guard();
      if(platform==='darwin'){
        const environment=testId?{SQL_PRACTICE_DATA_DIR:directory,YOURSQL_TEST_HIDDEN:'1'}:{};
        const xml=launchAgentXML({executable,label,environment});
        let previous=null;try{previous=fs.readFileSync(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
        if(previous===xml){try{await run('/bin/launchctl',['print',`${domain}/${label}`]);return;}catch{}}
        fs.mkdirSync(path.dirname(file),{recursive:true});
        await removeMac();
        try{fs.writeFileSync(`${file}.tmp`,xml,{mode:0o600});fs.renameSync(`${file}.tmp`,file);await run('/bin/launchctl',['bootstrap',domain,file]);}
        catch(error){if(previous!==null){fs.writeFileSync(file,previous,{mode:0o600});await run('/bin/launchctl',['bootstrap',domain,file]).catch(()=>{});}else fs.rmSync(file,{force:true});throw error;}
      }else{
        fs.mkdirSync(path.dirname(shortcut),{recursive:true});
        if(!shell?.writeShortcutLink(shortcut,'create',{target:executable,cwd:path.win32.dirname(executable),description:'YourSQL 학습 알림',appUserModelId:APP_ID,toastActivatorClsid:TOAST_CLSID}))throw new Error('알림 시작 메뉴 바로가기를 만들지 못했습니다.');
        const xml=windowsTaskXML({executable,sid:'__CURRENT_SID__'});
        await powershell(`$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $xml=${psQuote(xml)}.Replace('__CURRENT_SID__',$sid); Register-ScheduledTask -TaskName ${psQuote(taskName)} -Xml $xml -Force | Out-Null`);
      }
    },
    async unregister(){guard();if(platform==='darwin'){await removeMac();fs.rmSync(file,{force:true});}else{
      await powershell(`$task=Get-ScheduledTask -TaskName ${psQuote(taskName)} -ErrorAction SilentlyContinue; if($task){$task | Unregister-ScheduledTask -Confirm:$false}`);
      fs.rmSync(shortcut,{force:true});
    }}
  };
}
module.exports={APP_ID,TOAST_CLSID,xmlEscape,launchAgentXML,windowsTaskXML,createScheduler};
