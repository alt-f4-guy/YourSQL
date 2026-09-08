Unicode true
!include "MUI2.nsh"

!ifndef APP_VERSION
  !error "APP_VERSION is required"
!endif
!ifndef SOURCE_DIR
  !error "SOURCE_DIR is required"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE is required"
!endif

Name "YourSQL ${APP_VERSION}"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\YourSQL"
InstallDirRegKey HKCU "Software\YourSQL" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\YourSQL.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"

Function .onInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\YourSQL"
FunctionEnd

Section "YourSQL" MainSection
  SetShellVarContext current
  InitPluginsDir
  File /oname=$PLUGINSDIR\close-app.ps1 "${__FILEDIR__}\close-app.ps1"
  DetailPrint "실행 중인 YourSQL을 종료합니다. 응답하지 않으면 강제 종료합니다."
  ; 64비트 앱의 실행 경로를 읽을 수 있도록 네이티브 PowerShell을 사용합니다.
  StrCpy $2 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" 0 +2
  StrCpy $2 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  nsExec::ExecToStack '"$2" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\close-app.ps1" -InstallDirectory "$INSTDIR"'
  Pop $0
  Pop $1
  StrCmp $0 "0" app_closed
  DetailPrint "$1"
  MessageBox MB_OK|MB_ICONSTOP "YourSQL을 종료하지 못했습니다. 앱을 종료한 뒤 설치를 다시 실행해 주세요." /SD IDOK
  SetErrorLevel 1
  Abort
app_closed:
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*"
  FileOpen $0 "$INSTDIR\.yoursql-install" w
  FileWrite $0 "YourSQL"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\YourSQL" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL" "DisplayName" "YourSQL"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL" "DisplayIcon" "$INSTDIR\YourSQL.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL" "NoRepair" 1
  CreateDirectory "$SMPROGRAMS\YourSQL"
  CreateShortcut "$SMPROGRAMS\YourSQL\YourSQL.lnk" "$INSTDIR\YourSQL.exe"
SectionEnd

Function un.onInit
  StrCmp $INSTDIR "$LOCALAPPDATA\Programs\YourSQL" 0 uninstall_invalid
  IfFileExists "$INSTDIR\.yoursql-install" uninstall_valid uninstall_invalid
uninstall_invalid:
  MessageBox MB_ICONSTOP "YourSQL의 고정 설치 위치와 표식 파일을 확인할 수 없어 제거를 중단합니다."
  Abort
uninstall_valid:
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$SMPROGRAMS\YourSQL\YourSQL.lnk"
  RMDir "$SMPROGRAMS\YourSQL"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL"
  DeleteRegKey HKCU "Software\YourSQL"
  RMDir /r "$INSTDIR"
SectionEnd
