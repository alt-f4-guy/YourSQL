# 오후 8시 학습 알림

배포 상태: 다른 세션의 개선 작업 완료 후 함께 배포할 예정입니다. 현재 산출물은 알림 작업 시점의 검증용이며, 통합 배포 일정·남은 검사는 [통합 배포 대기 기록](pending-release.md)에 정리했습니다.

설정 → 하루 학습량 아래 **학습 알림**에서 **오후 8시 학습 알림**을 켭니다. 기본은 꺼짐입니다. 현재 컴퓨터에 로그인한 사용자에게만 적용합니다.

- 현지 시각 20시에 오늘 완료한 사이클이 오늘 목표보다 적으면 알림을 요청합니다. 빈칸 6개와 쿼리 2개로 구성된 배정의 완료 여부를 사용하며, 총 풀이 수를 8로 나누지 않습니다.
- 목표 변경은 오늘부터 적용됩니다. 달성 후 추가 학습 중이거나 전체 과정이 끝나 더 배정할 문제가 없으면 생략합니다.
- 앱을 완전히 닫아도 Mac LaunchAgent / Windows Task Scheduler가 앱의 `--reminder-check` 모드를 잠시 실행합니다. 이 모드는 창과 MySQL 엔진을 만들지 않습니다.
- 절전·로그인으로 놓쳤을 때 당일 20:00 이상 22:00 미만에 다시 확인합니다. 컴퓨터를 깨우거나 전날 알림을 이월하지 않습니다.
- 날짜별 시도 기록을 먼저 저장합니다. 요청 도중 비정상 종료하면 당일 알림이 누락될 수 있지만 중복 요청하지 않습니다. 테스트 알림은 별도입니다.

## 알림 권한과 확인

**권한 확인 필요**는 예약이 등록되었지만 OS 알림 허용 여부는 확인할 수 없다는 뜻입니다. **테스트 알림**을 누르고 시스템 설정에서 YourSQL의 알림 허용과 집중 모드를 확인하세요. “요청했어요”는 실제 배너가 표시되었다는 보장이 아닙니다.

등록 실패 시 원인이 표시되고 **다시 시도**할 수 있습니다. 알림 끄기는 설정을 먼저 저장합니다. 작업 해제에 실패해도 남아 있는 작업은 꺼짐 상태를 읽고 종료합니다. 실패 상태의 다시 시도는 마지막 켜기/끄기 작업을 다시 실행합니다.

알림 검사는 열린 화면이나 SQL 초안을 바꾸지 않습니다. 알림 클릭 시에만 기존 초안 저장 흐름을 통해 오늘의 학습 화면으로 이동합니다. 풀이·저장 작업이 진행 중이면 화면 전환을 보류합니다.

## 앱 이동과 삭제

실제 앱 실행 경로를 예약에 등록합니다. 앱을 옮겼다면 새 위치에서 한 번 실행해야 작업이 갱신됩니다. Mac의 휴지통 이동은 자동으로 감지할 수 없으므로 **삭제 전에 알림을 꺼 주세요**. Windows ZIP은 압축을 푼 전체 폴더를 유지하고, 이동 후 새 위치의 `YourSQL.exe`를 실행합니다.

Mac에서 앱을 이미 지워 예약이 남았다면 다음 명령으로 이 앱의 작업만 해제할 수 있습니다.

```sh
launchctl bootout "gui/$(id -u)/local.yoursql.practice.reminder"
rm -f "$HOME/Library/LaunchAgents/local.yoursql.practice.reminder.plist"
```

Windows 설치 제거는 `YourSQL Daily Reminder` 작업과 YourSQL 전용 알림 바로가기·등록을 해제합니다. ZIP을 수동 삭제했다면 작업 스케줄러에서 **YourSQL Daily Reminder**만 삭제하세요. 사용자 학습 기록은 삭제하지 않습니다.

## 저장소와 개발 검사

각 플랫폼의 기존 YourSQL 사용자 데이터 디렉토리 아래 `reminders.json`에 알림 설정, 날짜별 시도, 마지막 오류를 저장합니다. 알림 검사는 `learning.json`을 읽기만 하며, 없을 때만 `learning-v2.json`을 읽습니다. 두 파일이 없으면 기본 목표 1사이클로 판정합니다. 손상·읽기 오류는 알림을 생략하고 오류를 남깁니다.

`SQL_PRACTICE_DATA_DIR` 사용 시 실제 OS 작업 등록·해제를 차단합니다. `npm run test:daily-reminder`는 임시 데이터와 숨김 창을 사용합니다. `npm run test:reminder-native`는 배포본의 알림 전용 실행과 일반 실행 전환을 확인하며, Mac에서는 `local.yoursql.practice.reminder.test-<pid>` 식별자의 임시 작업만 등록·해제합니다. 개인 학습 기록이나 일반 알림 작업을 변경하지 않습니다.

## 검증 상태 (2026-09-22)

- 핵심 자동 검사 `npm test` 66개 통과. 기존 전체 화면 검사와 새 알림 설정·SQL 초안 보존 검사를 숨김 창에서 통과.
- Mac 배포본의 알림 전용 실행(창·학습 파일·MySQL 엔진 없음), 검사 중 일반 실행 전환, 테스트 LaunchAgent 등록·조회·해제 확인.
- Mac·Windows 빌드, Mac ad-hoc 서명 무결성, Windows ZIP 전체 재압축·CRC·내용 일치 확인.
- Mac 임시 서명 배포 앱, 숨김 창에서 `Notification.isSupported() === true` 및 `show` 이벤트 확인.
- `show` 이벤트만으로 실제 배너 표시, 종료 후 클릭 활성화, 재서명·업데이트 이후 권한 유지까지 입증되지는 않습니다. 이 항목은 별도 실기 확인이 남아 있습니다.
- Windows x64는 동일 소스의 빌드와 작업 XML·공통 판정 자동 검사를 수행합니다. Windows 실기 표시·클릭·설치 제거는 이 Mac 환경에서 검증하지 않았습니다.
- 버전은 검증용 0.0.11을 유지합니다. 공개 릴리스나 알림 지원 검증 완료를 의미하지 않습니다.

## API 근거

- [Electron 알림 조건](https://www.electronjs.org/docs/latest/tutorial/notifications)
- [Electron Notification: Windows 활성화·Mac 알림 기록](https://www.electronjs.org/docs/latest/api/notification)
- [Electron 고정 Toast Activator CLSID](https://www.electronjs.org/docs/latest/api/app#appsettoastactivatorclsidid-windows)
- [Apple 사용자 LaunchAgent](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [Microsoft 작업 실행 보안 컨텍스트](https://learn.microsoft.com/en-us/windows/win32/taskschd/security-contexts-for-running-tasks)
