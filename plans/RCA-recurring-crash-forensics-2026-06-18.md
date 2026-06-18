# RCA: 재발한 "전(全) pane -1 사망 → reload 시 빈 PowerShell → 좀비 프로세스 누적 → 자비스 사망" (2026-06-18)

> 작성일 2026-06-18 · ultracode 다중에이전트 조사(10 에이전트 / ~126만 토큰 / 288 코드조사) → 종합 → 3명 적대적 검증
> 선행 RCA: [`RCA-daemon-session-replacement-2026-05-29.md`](RCA-daemon-session-replacement-2026-05-29.md)(세션 교체), [`RCA-orphan-daemon-zombie-2026-06-15.md`](RCA-orphan-daemon-zombie-2026-06-15.md)(좀비 데몬). 본 문서는 그 둘의 **재발**을 다룬다.

## 0. 상태

- **1단계(진단 계측) 배포 완료** — 아래 §8의 로그 마커. 재현 불가하므로 선행 RCA의 P0 원칙("관측성 먼저 → 다음 재발 시 로그로 트리거 확정")을 따른다.
- **2단계(저위험 수정 2건) 적용 완료 (2026-06-18):** §6-1(generic `shutdown()` → `hardExit`), §6-2(launcher SIGKILL 직전 `killProcessTree`로 트리 회수). 기존 검증된 메커니즘만 재사용, 신규 의존성 없음, 타입체크 + 402 테스트 통과. **GUI dogfood로 실환경 확인 필요.**
- **나머지 §6 항목은 미구현** — Job Object 테더, F3/F4, `-1` 위조 제거, 에이전트 시작명령 영속화, 잔존 누수 추적, ProcessMonitor 보강. 고위험 daemon-lifecycle은 PR 1개씩 적대적 검증 + GUI dogfood로 진행.

## 1. 한 줄 결론

증상 4개는 **하나의 결합 실패**로 수렴한다. (1) pane의 `-1`은 실제 종료코드가 아니라 `pty.handler.ts`의 **`payload.exitCode ?? -1` 위조 sentinel**이다(ConPTY는 kill된 셸에 `null`을 보고). (2)·(4) recovery는 **재attach가 아니라 셸 재시작**이라, 진짜 데몬 사망 후엔 pane이 빈 PowerShell로 돌아오고 그 안에서 돌던 claude(자비스)는 설계상 복원되지 않는다. (3) 고아 프로세스 누적의 진짜 출처는 **`launcher.ts`의 bare `process.kill(pid,'SIGKILL')`(641·782)** 와 외부 강제종료/리부트다 — 이 경로엔 `killProcessTree`가 연결돼 있지 않고 PTY에 Job Object 테더도 없어 `powershell→claude→node-MCP` 손주 트리가 OS로 reparent되어 고아가 된다.

## 2. 증상 (사용자 보고, 2026-06-17)

1. 각 pane이 `[Process exited with code -1]`을 띄우고 거의 동시에 사망.
2. 메뉴 **reload** 사용 → 모든 pane이 **새 PowerShell 프롬프트**로 복귀(직전에 돌던 Claude Code / Cursor가 아님).
3. 작업 관리자에 **node.js 수십 개 + "Claude Code" 수십 개** 고아(실사용 ~3 Cursor + ~4 wmux claude 외 전부 빈 프로세스).
4. **자비스**(외부 텔레그램 릴레이로 제어하는 장기 실행 claude)가 응답 없음 → 사망, reload 후에도 미복원.

핵심: 이 모든 게 `fix/process-leaks-and-resize` 브랜치의 선행 수정(0d1945a / 5e31946 / 0eafabd / 069f50c)에도 **불구하고 재발**했다.

## 3. 확정 사실 (코드 교차검증, 적대적 검증 통과)

### 증상 1 — `-1`은 위조 sentinel
- `src/main/ipc/handlers/pty.handler.ts` `onDaemonSessionDied`: `win.webContents.send(IPC.PTY_EXIT, sessionId, payload.exitCode ?? -1)` — 코드베이스에서 `-1`을 만드는 **유일한 지점**. `src/renderer/hooks/useTerminal.ts`가 그대로 `[Process exited with code -1]`로 렌더.
- `exitCode`가 `null`인 경우가 거의 모든 비정상 사망: ConPTY는 kill된 셸에 `null`/`undefined`를 보고(`DaemonPTYBridge` onExit), ProcessMonitor·recovery 경로는 `session:died`에 `exitCode:null`을 하드코딩.
- **전 pane 동시 `-1`** = 한 이벤트원이 한 tick에 모든 세션의 `session:died`를 발화 → 데몬 `disposeAll()`(`src/daemon/index.ts`의 `shutdown()`), 또는 외부 강제종료/리부트.

### 증상 2·4 — recovery = 셸 재시작(재attach 아님)
- `src/daemon/index.ts` `recoverSessions()`의 3개 분기 모두 `createSession({ cmd: session.cmd, ... })`로 **셸(powershell.exe)** 을 재spawn. 스크롤백만 RingBuffer에 미리 채울 뿐, pane 안에서 돌던 프로그램(claude)은 재실행하지 않음.
- `session.agent`는 A2A 정체성(`{role, teamId, displayName}`)일 뿐 실행 명령이 아님 → 복원에 쓰이지 않음.
- 저장 상태(`Surface`)에 "실행 중이던 명령" 필드 자체가 없음. **데몬이 죽으면 자비스는 설계상 복원 불가.** 텔레그램 릴레이는 외부에 있고, 빈 PowerShell에 메시지가 닿아 무응답.

### 증상 3 — 고아 손주 트리의 진짜 출처
- `src/main/daemon/launcher.ts`의 두 daemon-kill 지점이 bare `process.kill(pid,'SIGKILL')`:
  - `ensureDaemon`의 unresponsive-daemon respawn 분기,
  - `killDaemonByPidFile`(full-shutdown 백스톱).
  - `killProcessTree`가 **launcher.ts에 import조차 안 됨.** SIGKILL/TerminateProcess는 JS를 한 줄도 안 돌리므로 데몬이 `disposeAll()→killProcessTree`를 부를 기회가 없다.
- PTY에 **Windows Job Object 테더 없음**(`AssignProcessToJobObject` 0건) → OS도 자식을 cascade-kill 하지 않음 → 손주 생존.
- launcher는 `~/.wmux/daemon.pid` **단일 파일**로만 데몬을 추적하고 respawn 전 그 파일을 unlink → 이전(고아) 데몬 + 그 트리는 영구 추적 불가(F3 multi-orphan reaper 미구현) → **reload/크래시 사이클마다 누적**.

## 4. 적대적 검증이 잡은 정정 (선행 합성안의 오류 — 이 문서엔 반영됨)

- ❌ "모든 종료 경로가 손주를 고아로 만든다"는 **틀림**: graceful `shutdown()`은 `process.exit(0)` **전에** `disposeAll()→destroySession→killProcessTree`를 돌려 트리를 reap한다. 그 경로의 `process.exit(0)` wedge는 **좀비 데몬**(부모)을 만들 뿐, 손주 고아화의 원인이 아니다. 손주 고아화의 원인은 **launcher SIGKILL + 외부 강제종료**다.
- ❌ ProcessMonitor "false-mass-death" 과대평가: 이미 PID별 `isDefinitelyDead(pid)` 재확인 가드가 있어 한 번의 불량 tasklist 사이클이 다수 사망을 일괄 발화하기 어렵다(가능성 낮음).
- ❌ 선행 합성안의 `wmic` `execSync` 계측은 **이 사용자의 Win11 26200에서 wmic이 제거되어** 'enum-failed'만 뱉고 kill 경로에 2초 동기 stall → 채택 안 함.
- ❌ 800ms "EXIT DID NOT FINALIZE" non-unref'd 타이머는 측정 대상인 종료 타이밍 자체를 교란하는 동작 변경 → 채택 안 함(수동적 한 줄 로그로 대체).

## 5. 왜 선행 수정(2.14~2.16)이 막지 못했나

- 2.14.0(A1 비파괴 reconcile/reconnect)·2.16.2(split-brain)·2.16.1(probe-timeout)은 **렌더러/main 재연결 경로**와 **데몬 quit→relaunch**를 굳혔다. 그러나:
  - 이번 트리거는 메뉴 **reload**(렌더러 `webContents.reload()`) — recovery를 재실행하지 않는 별도 경로. 즉 증상 2가 보였다는 건 reload **이전에 데몬 자체가 이미 죽거나 respawn**됐다는 뜻.
  - 5e31946(tree-kill + hardExit)은 **graceful 경로에만** 연결됨(`destroySession`/`PTYManager.dispose`, `daemon.shutdown` RPC). **launcher SIGKILL·SIGTERM/idle/uncaught의 `process.exit(0)`** 는 미적용 → 좀비/고아 잔존(이 RCA의 핵심 회귀).
  - F3(multi-orphan reaper)·F4(parent-liveness tether)는 선행 RCA에서 명시적으로 **미구현**.

## 6. 후속 코드 수정

1. ✅ **[DONE 2026-06-18]** generic `shutdown()` 최종 exit를 `hardExit()`로 라우팅 (`index.ts:1206`, 10s 타임아웃 가드 `:1097`도 `hardExit(1)`로). SIGTERM/SIGINT/idle/uncaught도 conhost wedge를 우회 — 좀비 데몬의 가장 직접적 수정.
2. 🟡 **[PARTIAL — DONE 2026-06-18]** launcher SIGKILL 전에 PTY 트리 reap — `killProcessTree`를 `launcher.ts`의 두 kill 사이트(ensureDaemon respawn + killDaemonByPidFile)에 연결 완료. **남음:** wmux-개시 kill만 커버 — 외부 강제종료/리부트까지 덮으려면 데몬 소유 Windows **Job Object(kill-on-close)** 필요(네이티브 API → 별도 큰 작업).
3. **F3**(데몬 image+cmdline로 전(全) 세대 열거·reap) + **F4**(부모 PID 핸드셰이크로 부모 사망 시 self-reap). **미구현.**
4. **`-1` 위조 중단** — `signal`(이미 `DaemonPTYBridge`가 포착, broadcast에서 누락)·`reason`을 렌더러까지 전달해 "데몬 종료로 종료됨" 등으로 표시.
5. **에이전트 복원 가능화** — surface별 "시작 명령"(claude 실행)을 영속·재생하거나, 에이전트 pane은 빈 셸 재spawn을 막아 자비스가 복원되게.
6. **잔존 메모리 누수 추적** — ENOMEM(FATAL_CODE) / uncaught 3-in-30s 차단기를 트립시켜 느린 누수가 전(全) pane 일괄 사망으로 비화하는 경로 차단.
7. **ProcessMonitor 보강** — 한 사이클에 X% 초과가 사망 플립되면 추가 확인(false-mass-death 방어).

---

## 7. 다음 재발 시 디버깅 절차 (이번에 심은 로그로) ★

로그 위치 — 둘 다 `appendFileSync`(라인별 fsync, 크래시 내구성), 14일 보존:
- 데몬: `~/.wmux/logs/daemon-YYYY-MM-DD.log` (`%USERPROFILE%\.wmux\logs\`)
- main(+렌더러 console 포워딩): `%APPDATA%\wmux\logs\main-YYYY-MM-DD.log`

재발하면 **두 로그를 사고 시각 기준으로 모아** 아래 마커를 grep한다:

| 질문 | grep 마커 | 어디서 | 무엇을 말해주나 |
|------|-----------|--------|----------------|
| `-1`이 진짜 코드인가? 동시 사망인가? | `[lifecycle] session:died→render` | main | `rawExitCode=null willRender=-1`이면 위조 확정. 여러 id의 `ts=`가 같은 ms면 **데몬 일괄 사망**(고립 사망 아님). |
| 무엇이 PTY를 죽였나 / 왜 | `[lifecycle] session:died` | daemon | `reason=`(`pty-exit`/`process-monitor`/`recovery`)·`signal=`·`cmd=`·`liveTotal=`. 직전에 `destroySession` 로그 있으면 wmux가 죽인 것. |
| **이게 같은 데몬인가, respawn된 데몬인가?** | `[boot] daemon generation` | daemon | reload 시각 근처에 새 `pid=`/`bootId=` 부팅 줄이 있으면 → **데몬이 죽고 새로 떠 셸만 복원**(증상 2 확정). 없으면 같은 데몬에 재attach. |
| pane이 왜 빈 셸로 돌아왔나 | `[recovery] re-spawn ... SHELL only` | daemon | 복원된 `cmd=`가 powershell이고 `agent=set`이면 **그 pane이 자비스였고 claude는 미복원**(증상 2·4). |
| 자비스가 cap에서 잘렸나 | `[recovery.cap] skipped ids=` | daemon | 자비스 세션 id가 `(agent)` 표식으로 목록에 있으면 → 40개 cap 초과로 suspended(증상 4의 대체 경로). |
| 손주(claude/node)가 왜 고아가 됐나 | `[launcher] SIGKILL daemon PID ... WITHOUT tree-kill` | main | launcher가 트리 reap 없이 데몬을 SIGKILL한 횟수·시각 = 고아 발생 이벤트. |
| tree-kill이 안 돈 건가, 돌았는데 실패한 건가 | `[killProcessTree] reaped tree` / `taskkill failed status=` | main·daemon | 마커가 **없으면** abrupt 경로(JS 미실행). `taskkill failed status=`(128 아님)면 **돌았으나 실패**(AV/권한) — 정반대 수정 필요. |
| 데몬이 좀비로 wedge됐나 | `[shutdown.exit] calling process.exit(0)` | daemon | 이 줄이 해당 pid의 **마지막 줄**인데 프로세스가 살아있으면 → `process.exit(0)`가 conhost 핸들에 wedge(좀비 데몬). |

판정 분기:
- `[boot] daemon generation`이 reload 직전에 **있다** → 데몬 사망/respawn이 선행. `[launcher] ... WITHOUT tree-kill` 또는 `[shutdown.exit]`/외부 kill로 사망 원인 추적 → §6-1·6-2.
- **없다** → 같은 데몬인데 PTY들만 죽음. daemon `[lifecycle] session:died`의 `reason=`으로 분기(`process-monitor`면 §6-7, `pty-exit`면 셸 자체 사망 원인).
- 고아가 보이는데 `[killProcessTree]` 마커가 **전무** → §6-2(launcher tree-kill/Job Object)가 정답.

## 8. 이번에 심은 계측 (코드)

| 파일 | 마커 | 증상 |
|------|------|------|
| `src/shared/killProcessTree.ts` | `[killProcessTree] reaped tree` / `taskkill failed status=` | 3 |
| `src/main/daemon/launcher.ts` (641·782) | `[launcher] SIGKILL daemon PID ... WITHOUT tree-kill` | 3 |
| `src/daemon/index.ts` recoverSessions | `[recovery] re-spawn ... SHELL only` | 2·4 |
| `src/daemon/index.ts` recovery cap | `[recovery.cap] skipped ids=` | 4 |
| `src/daemon/index.ts` main() | `[boot] daemon generation pid= bootId= recoveredLiveSessions=` | 2 |
| `src/daemon/index.ts` shutdown() | `[shutdown.exit] calling process.exit(0)` / `deferring final exit` | 3 |
| `src/main/ipc/handlers/pty.handler.ts` | `[lifecycle] session:died→render rawExitCode= willRender=` | 1 |

마커는 `src/daemon/__tests__/crashForensicsInstrumentation.test.ts`(source-text invariant)로 잠겨 있어, 리팩터링이 조용히 떨어뜨리면 테스트가 실패한다.

## 9. 정직한 한계

코드만으로는 어제 사고의 **정확한 단일 트리거**를 확정할 수 없다(데몬 일괄 사망 vs 외부 kill/리부트 vs respawn). 모두 동일 종착점(`exitCode:null→-1` + 셸-only 복원)으로 수렴하지만 선행조건이 로그로 입증되지 않았다. **올바른 순서: 위 계측 배포 → 다음 재발 시 §7로 트리거 확정 → §6에서 해당 수정 1개 PR.**
