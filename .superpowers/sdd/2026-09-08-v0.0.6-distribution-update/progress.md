# SDD ledger — plan: /Users/wiww1030/Desktop/YourSQL/docs/superpowers/plans/2026-09-08-v0.0.6-distribution-update.md

## 기준 상태

- 작업공간: `/private/tmp/yoursql-v0.0.6`
- 브랜치: `codex/v0.0.6-distribution`
- 기준 커밋: `80e23c8`
- 기준 검사: `npm test` — 39개 중 38개 통과, Windows 전용 1개 건너뜀
- 장기 메모리 조회: 관련 기록 없음

## 사전 충돌 검사

| 범위 | 생산·소비 또는 공유 지점 | 확인 결과 |
|---|---|---|
| Task 1 자체 | 새 테스트 → `checkUpdate`, `Updater.open`; 제거 파일·의존성 → test 스크립트 | 단계와 기대 결과가 일치함 |
| Task 2 자체 | UI 실패 테스트 → IPC/preload/DOM/렌더러 변경 | 단계와 기대 결과가 일치함 |
| Task 3 자체 | 경로·이관 실패 테스트 → 플랫폼/main/package 변경 | 단계와 기대 결과가 일치함 |
| Task 4 자체 | 배포 검사 모드 → NSIS/release 구현 | Windows 실행 단계는 로컬 Mac에서 수행 불가, Task 5 CI가 실제 검증을 담당함 |
| Task 5 자체 | Setup EXE → PowerShell 실기 검사 → Actions 산출물 | 구현은 로컬 가능하나 실제 실행은 Windows Actions 필요 |
| Task 6 자체 | 버전·문서 → 전체 검사 → 양 OS 자산 → 공개 릴리스 | 로컬 Mac 단계와 외부 GitHub 단계가 섞여 있어 외부 변경 전 승인이 필요함 |
| Task 1 → Task 2 | `Updater.check/open`을 main IPC가 소비 | 이름과 상태 계약이 일치함 |
| Task 1 ↔ Task 6 | `package.json`, `package-lock.json`; 완성 updater를 최종 검증 | Task 1 의존성 제거 뒤 Task 6 버전 변경 순서가 안전함 |
| Task 2 ↔ Task 3 | `main.cjs` 공유 | Task 3은 Task 2의 updater 연결을 보존하며 테마 초기화만 수정함 |
| Task 2 ↔ Task 6 | `ui/index.html` 공유; 새 UI를 최종 버전으로 검증 | Task 6은 브랜드 버전과 문구만 갱신함 |
| Task 3 ↔ Task 4 | `tests/distribution-themes.cjs` 공유; 원시 패키지 계약을 공개 자산 검사로 확장 | Task 4가 Task 3 검사를 모드별로 보존함 |
| Task 3 → Task 6 | 사용자 테마 경로를 README·릴리스 노트가 설명 | 경로와 보존 계약이 일치함 |
| Task 4 → Task 5 | `YourSQL-Setup-x64.exe`와 NSIS 무인 설치 계약 | 산출물명과 `/S`, `/D` 소비 계약이 일치함 |
| Task 4 → Task 6 | DMG/Setup 공개 자산 생성 | 자산명이 전역 제약과 일치함 |
| Task 5 → Task 6 | Windows Actions의 검증된 Setup과 실행 SHA를 최종 릴리스가 소비 | 동일 커밋 검증 요구가 일치함 |

## 판정

- Ruling: 설계서의 선택적 `v` 태그보다 계획의 전역 제약인 `vMAJOR.MINOR.PATCH`만 인정한다 — 설계서 내부의 고정 `/tag/v<버전>` URL 모순을 계획이 명시적으로 해소했기 때문 — 잘못된 경우 `v` 없는 기존 정식 릴리스를 앱이 인식하지 못함.
- Ruling: Task 5 Step 4와 Task 6 Step 7~9의 `main` 푸시·Actions 실행·태그·공개 릴리스는 로컬 구현·검증 완료 뒤 사용자 승인 단계로 분리한다 — 격리 브랜치를 검토 없이 `main`에 밀거나 공개 배포하는 외부 부작용을 피하기 위함 — 승인 전에는 Windows 실기 검증과 원격 릴리스 완료 기준이 미완료로 남음.

## 작업 상태

- Task 1: Ruling: `main.cjs`, `preload.cjs`, `ui/index.html`, `ui/updates.js`, `tests/updates-ui.cjs`의 구형 API와 시작 실패는 Task 2의 명시된 범위로 이관한다 — Task 1은 새 updater 모듈과 제거 파일만 다루고 Task 2가 즉시 모든 호출부를 교체하도록 계획되어 있기 때문 — Task 2 완료 전 중간 커밋은 실행 가능한 앱이 아님.
- Task 1: minor (deferred): `Updater.open()`의 확인 전 거부는 직접 검사하지만 자산 부재 확인 후 거부는 `checkUpdate` 상태 검사와 간접 결합되어 있음; 최종 통합 검토에서 직접 사례 필요성을 재평가.
- Task 1: complete (commits 80e23c8..254b7e2, 교차 작업 지적은 Task 2로 이관, 경미 1건 보류)
- Task 2: Ruling: 계획의 `page.reload()` 대신 앱 시작 직후 `firstWindow()` 전에 테스트용 fetch를 주입하고 reload를 제거하며, `Updater` 기본 fetcher는 동적 래퍼로 보완한다 — renderer reload가 기존 정상 종료 프로토콜을 실행하고 생성 시점 fetch 캡처가 계획의 주입을 무효화하기 때문 — 잘못된 경우 테스트가 실제 시작 자동 확인 시점을 충분히 재현하지 못할 수 있음.
- Task 2: fix round 1/5 (0 addressed, 1 open — UI 테스트가 `process.arch`를 반영하지 않음; commits 2f81270..d496ce4)
- Task 2: fix round 2/5 (1 addressed, 0 open; commits d496ce4..4db58fe)
- Task 2: complete (commits 254b7e2..4db58fe, review clean)
- Task 2: Ruling: 업데이트 UI 테스트가 최초 MySQL 초기화 도중 앱을 닫을 때 `execFile` 초기화 자식을 `Engine.stop()`이 소유하지 못해 고아 mysqld와 대용량 로그가 남았다 — 초기화 자식을 Engine 생명주기에 포함하고 실제 UI 테스트 없이 가짜 자식 기반 회귀 테스트로 고친다 — 잘못된 경우 조기 앱 종료에서 다시 디스크를 채울 수 있음.
- Task 2: fix round 3/5 (0 addressed, 1 open — SIGTERM 무응답 시 초기화 자식 참조를 지워 고아 프로세스가 남음; commits 3ff005f..5cd28d6)
- Task 2: fix round 4/5 (1 addressed, 0 open — SIGKILL·실제 exit 대기·동시 stop 공유·staging 정리; commits 5cd28d6..5b2c47c)
- Task 2: minor (deferred): 준비 완료된 일반 서버 자식은 기존처럼 SIGTERM 후 5초에 종료 확인 없이 참조를 해제함; admin SHUTDOWN 실패 실제 사례가 생기면 같은 강제 종료 helper로 통합.
- Task 2: complete (누수 후속 commits 3ff005f..5b2c47c, review clean)
- Task 3: complete (commits 4db58fe..bb2df42, review clean)
- Task 4: Ruling: NSIS 디렉터리 선택 화면과 `/D` 사용자 지정 설치 경로를 제거하고 `$LOCALAPPDATA\\Programs\\YourSQL`을 강제하며, 설치 표식과 경로 검증 후에만 재귀 제거한다 — 계획 예제보다 전역의 고정 설치 위치와 데이터 보존이 우선하기 때문 — 잘못된 경우 고급 사용자의 사용자 지정 설치와 기존 Task 5 임시 경로 검사가 불가능해짐.
- Task 4: fix round 1/5 (1 addressed, 0 open — 임의 경로 재귀 삭제 방지; commits 81cf38e..25860e4)
- Task 4: complete (commits bb2df42..25860e4, review clean)
- Task 5: Ruling: Windows 보존 실기 검사는 `GITHUB_ACTIONS=true`와 `RUNNER_TEMP`를 요구하고, 해당 일회용 runner 계정의 실제 Roaming AppData `YourSQL` 경로에 표식을 둔다 — NSIS의 `$APPDATA`는 프로세스 환경변수 덮어쓰기를 따르지 않아 실제 셸 폴더 경계를 검사해야 하기 때문 — 잘못된 경우 로컬 수동 실행이 차단되고 runner 프로필이 임시 경로라는 전제에 의존함.
- Task 5: minor (deferred): 보존 표식은 존재 여부뿐 아니라 내용까지 비교하는 편이 강함.
- Task 5: fix round 1/5 (1 addressed, 0 open — 실제 runner AppData 경계와 내용 보존 검증; commits 5b2c47c..99af893)
- Task 5: complete (commits 25860e4..99af893, review clean; Windows Actions 실기는 외부 승인 대기)
- Task 6: local complete (commits 99af893..63fc15e, review clean; Step 7~9 Windows Actions·태그·공개 릴리스 승인 대기)
- 최종 브랜치 검토: 단일 수정 1/1 완료 (4건 처리, 열린 지적 0건). Mac 모의 경로에 `path.posix` 지정, 업데이트 화면 응답 두 곳을 `v0.0.7`로 수정, 일반 서버 SIGTERM 무응답 시 SIGKILL·실제 exit 대기 적용, 자산 부재 재확인 후 `Updater.open()` 거부 직접 검사 추가. 기존 Task 1·Task 2의 보류한 경미 지적도 해소함.
- 최종 수정 검증: 일반 서버 회귀 RED 11/12 → GREEN 12/12; `npm test` 1회 38/38 통과; `npm run test:updates` 1회 통과. 직후 지정한 `lsof` 검색 결과 없음, 데이터 볼륨 여유 195Gi. Windows 실기와 배포 산출물 재생성은 이번 수정 범위에서 미실행. 증거: `final-fix-report.md`.
