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
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"

Section "YourSQL" MainSection
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${SOURCE_DIR}\*"
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

Section "Uninstall"
  SetShellVarContext current
  Delete "$SMPROGRAMS\YourSQL\YourSQL.lnk"
  RMDir "$SMPROGRAMS\YourSQL"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\YourSQL"
  DeleteRegKey HKCU "Software\YourSQL"
  RMDir /r "$INSTDIR"
SectionEnd
