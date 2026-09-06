#!/bin/sh
# 경로는 명령 문자열에 삽입하지 않고 인자로 받는다. 현재 앱이 종료된 뒤에만 교체한다.
set -u
target=$1
candidate=$2
backup=$3
failed=$4
ready=$5
result=$6
parent=$7
work=$(/usr/bin/dirname "$ready")
new_pid=''
fail() { printf 'failed\n' > "$result"; exit 1; }
printf 'armed\n' > "$work/armed" || exit 1
count=0
while kill -0 "$parent" 2>/dev/null; do
  count=$((count + 1))
  [ "$count" -lt 120 ] || fail
  sleep 1
done
/bin/mv "$target" "$backup" || fail
rollback() {
  # 이 보조 프로그램이 시작한 프로세스만 종료하고 원래 앱을 복구한다.
  if [ -n "$new_pid" ] && kill -0 "$new_pid" 2>/dev/null; then
    kill "$new_pid" 2>/dev/null || true
    sleep 1
    kill -0 "$new_pid" 2>/dev/null && kill -9 "$new_pid" 2>/dev/null
    wait "$new_pid" 2>/dev/null || true
  fi
  if [ -e "$target" ]; then /bin/mv "$target" "$failed" || fail; fi
  /bin/mv "$backup" "$target" || fail
  printf 'rollback\n' > "$result"
  unset YOURSQL_UPDATE_WORK
  "$target/Contents/MacOS/YourSQL" </dev/null >>"$work/rollback.log" 2>&1 &
  exit 1
}
/bin/mv "$candidate" "$target" || rollback
YOURSQL_UPDATE_WORK="$work" "$target/Contents/MacOS/YourSQL" </dev/null >"$work/launch.log" 2>&1 &
new_pid=$!
count=0
while [ ! -f "$ready" ]; do
  kill -0 "$new_pid" 2>/dev/null || rollback
  count=$((count + 1))
  [ "$count" -lt 90 ] || rollback
  sleep 1
done
printf 'success\n' > "$result"
# 새 앱의 화면 로드가 확인된 뒤에만 임시 파일과 이전 앱을 정리한다.
/bin/rm -rf "$work"
exit 0
