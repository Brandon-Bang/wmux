# 오케스트레이션 프리미티브 대조 조사 — 2026-07-28

- **무엇**: `orchestration-retro-2026-07-28.md` §11이 제기한 갭 5개(G1~G5)를 경쟁 제품·프로토콜
  표준·인접 도메인과 대조해, 어디까지가 이미 풀린 문제이고 어디부터가 우리 몫인지 가른다.
- **방법**: Orca는 **소스 직독**(MIT 클론, 파일:라인 앵커). 나머지 OSS는 클론 또는 스펙 직독.
  라이선스는 전부 `gh api repos/{r}` + LICENSE 원문 확인. 확인 못 한 항목은 **UNVERIFIED** 명시.
- **관계**: `as-is-to-be-2026-07-28.md` §4(TO-BE 5축)에 **T6를 추가할지**를 §8에서 판정한다.
- **비고**: 이 문서는 조사 결과다. 코드 변경 없음.

## 조사 대상 갭 (retro §11 요약)

| ID | 갭 | 실측 |
|---|---|---|
| **G1** | 위임 | 채널 멘션이 유휴 에이전트의 턴을 못 시작시킴(4/4). `a2a_task_send`만 작동. 실패가 침묵 |
| **G2** | 관측 | 오케스트레이터가 타 워크스페이스 워커 화면을 못 봄. 침묵의 원인 구분 불가 |
| **G3** | 승인 | manual 워커가 permission prompt에 막히면 오케스트레이터가 못 풂 |
| **G4** | 완료 신호 | 완료가 오케스트레이터를 안 깨움 → 폴링 루프 자작 |
| **G5** | 상태 정직성 | `agentStatus` 양방향 거짓(파생 추론), `deliveryStatus` 미배달/배달됨 뭉갬 |

---

## 1. Orca — 소스 직독 (최우선 대상)

### 1.0 기본 사실 (실검증)

| 항목 | 값 | 출처 |
|---|---|---|
| 리포 | `stablyai/orca` | — |
| ★ | **31,003** | `gh api repos/stablyai/orca` (2026-07-28 실행) |
| 라이선스 | 🟢 **MIT** (`LICENSE`: "MIT License / Copyright (c) 2026 Lovecast Inc.") | `gh api` + LICENSE 직독 |
| 활동 | `pushed_at 2026-07-28T04:18Z` — **오늘** | 동일 |
| 스택 | Electron 43 / TypeScript / node-pty 1.1 / xterm 6.1-beta | `package.json:127-193` |

**스택·라이선스가 우리와 동일하다.** 코드 반입에 법적 장애가 없고, 이식 비용도 낮다.
`as-is-to-be` §8의 UNVERIFIED 항목("Orca 30,749★ 및 MIT")은 **이로써 검증 완료**다.

### 1.1 아키텍처 한 줄

> Orca의 오케스트레이션은 **SQLite에 적힌 Run/Task/Dispatch 3층 상태 기계 + 워커가 CLI로
> 자기 상태를 선언하는 메시지 프로토콜 + 코디네이터의 long-poll 대기**로 구성된다.
> 터미널 화면 파싱은 **관측의 폴백**이지 상태의 원천이 아니다.

핵심 파일:

| 파일 | 역할 |
|---|---|
| `src/main/runtime/orchestration/types.ts` | 전 상태 enum의 정본 |
| `src/main/runtime/orchestration/coordinator.ts` | 결정론적 폴링 루프(2s) |
| `src/main/runtime/orchestration/preamble.ts` | 워커에게 주입되는 계약문 |
| `src/main/runtime/orchestration/lifecycle-reconciliation.ts` | 워커 보고의 권한·정합성 검증 |
| `src/main/runtime/rpc/methods/orchestration.ts` | `check --wait` long-poll RPC |
| `src/main/runtime/orca-runtime.ts:27469` | `waitForMessage` 웨이터 구현(~80줄) |
| `skill-guides/orchestration.md` (366줄) | **LLM 오케스트레이터용 계약 문서** |

### 1.2 G1 위임 — "메일함은 위임 경로가 아니다"를 코드와 문서에 못 박았다

Orca는 **읽을 메일**과 **턴을 시작시키는 것**을 명시적으로 분리한다.

- 위임 실체는 `sendTerminalAgentPrompt(handle, preamble + spec)`
  (`coordinator.ts:453`) → `orca-runtime.ts:14045-14072`에서 **PTY에 붙여넣기 + submit
  키**(`buildAgentPromptPasteBytes` + `AGENT_PROMPT_SUBMIT`)를 쓴다. 즉 **터미널 입력이
  위임 프리미티브**다. 우리의 fan-out이 턴을 시작시키는 것과 같은 원리다.
- 스킬 가이드가 그 경계를 문장으로 박아둔다:
  > `orca orchestration check --peek --format --json` returns locally formatted unread mail
  > without consuming it; **it never writes to terminal input or remotely wakes another
  > terminal.** Use `orchestration dispatch --inject` to deliver a tracked task, or
  > `terminal send` when an existing agent needs a free-form prompt.
  > — `skill-guides/orchestration.md`
- preamble은 **완료 후 유휴 상태에서 다음 지시가 어떻게 도착하는지**까지 워커에게 설명한다:
  > Why: re-dispatch reaches idle agents as terminal input; **inbox polling after completion
  > cannot receive that new TASK block and looks hung.** — `preamble.ts:155-156`

**판정**: Orca는 우리가 G1에서 밟은 지뢰를 **이미 밟았고, 주석으로 남겼다.** 해법은
프로토콜 발명이 아니라 (a) 위임 = 터미널 입력으로 일원화, (b) 메일 표면에 "이건 깨우지
않는다"를 못 박기다. retro §11 P0-1의 (b)+(c) 권고와 정확히 일치한다.

부수 프리미티브: `orca terminal wait --terminal <h> --for tui-idle --timeout-ms <n>` —
**dispatch 전에 에이전트 TUI가 프롬프트를 받을 준비가 됐는지 기다린다.** k8s readiness
probe의 터미널 판이다. 이게 없으면 첫 프롬프트를 통째로 잃는다.

### 1.3 G2 관측 — `worker-read`: 증명 가능한 소스만 읽고, 폴백은 이유를 밝힌다

`orca orchestration worker-read --dispatch <id> --json`가 유일한 관측 창구다.

- 소스 3종: `auto | transcript | terminal`
  (`src/shared/orchestration-worker-output.ts:5-6`)
- **hook이 보고한 provider session**으로 정확한 transcript를 잡을 수 있으면 구조화된
  transcript 페이지를, 못 잡으면 bounded terminal 출력을 준다.
- 폴백 시 **타입화된 이유**를 반드시 싣는다 —
  `provider_unsupported | session_not_reported | transcript_missing | transcript_unreadable |
  transcript_parse_failed | remote_capability_unavailable`
  (`orchestration-worker-output.ts:8-17`)
- 설계 원칙이 명문화돼 있다 (`ORCHESTRATION_STRUCTURED_OUTPUT_DESIGN.md`):
  > Never select the "latest session in this directory." … If Orca cannot prove the
  > association, return a **labeled terminal fallback**. … The response must always say
  > which source was used. **It must never silently read a different agent session.**
- 커서(`cursor`)는 소스에 고정되며, 소스가 바뀌면 `source_changed`를 반환해 새 읽기를 요구한다.

**판정**: G2를 **푼 유일한 제품**이다. 그리고 해법의 핵심은 "화면을 더 잘 긁는 것"이 아니라
**증명 가능한 관측만 하고 불가능하면 그 사실을 타입으로 반환하는 것**이다. retro §2의
"파생 신호는 부재를 증명하지 못한다"의 엔지니어링 답이 여기 있다.

### 1.4 G3 승인 — 코드가 아니라 **preamble 계약**으로 풀었다

Orca도 Claude의 permission prompt를 자동 응답하지 않는다. 대신 **관측 불가능한 프롬프트를
애초에 못 쓰게 금지**하고, 관측 가능한 대체 경로를 제공한다.

`preamble.ts:106-115` (워커에게 주입되는 문장, 원문):

> **BEHAVIOR RULE #1 (MUST NOT VIOLATE):**
> NEVER use AskUserQuestion; use `orca orchestration ask` or send `--type decision_gate`.
> **AskUserQuestion opens a local TUI prompt that the coordinator cannot see and cannot
> answer — your session will hang forever waiting on a human.** Every interactive question
> goes through `ask` below.

대체 경로 `orchestration ask`의 계약:

- 워커가 블로킹 호출 → DB에 `QuestionRow`(status `pending|answered|closed`) 내구 기록
  (`types.ts:64-78`) → 코디네이터가 `orchestration reply --id <msg_id>`로 답 → 워커 해제
- 반환 형태가 실패 모드를 전부 구분한다:
  `{ answer, messageId, threadId, timedOut, timeoutMs, cancelled, connectionLost }`
  (`src/cli/handlers/orchestration.ts:947-957`)
- **타임아웃/연결끊김은 질문을 죽이지 않는다** — `--resume <messageId>`로 같은 질문에 재접속.
  중복 질문 생성 금지가 preamble에 명시(`preamble.ts:113-115`).
- 별도로 `decision_gate`(코디네이터 소유 DAG 결정)가 있고, **코디네이터는 게이트를 절대
  자동 해소하지 않는다**:
  > the coordinator never auto-resolves gates (humans do, via `orchestration.gateResolve`) —
  > that would defeat them as approval checkpoints. — `coordinator.ts:336`

한편 Orca는 **AskUserQuestion 자체는 원격 응답한다** — hook의 PreToolUse가 도구 입력
전체를 잡아주기 때문이다(`shared/agent-hook-listener.ts:503` `interactivePrompt`), 그걸
모바일/웹의 `NativeChatQuestionCard`로 렌더하고 키스트로크 그룹으로 답을 써넣는다
(`native-chat-runtime-send.ts:201`). **훅이 있는 프롬프트는 원격 응답하고, 훅이 없는
프롬프트는 금지한다** — 이 분리가 정확히 wmux `approvalKeystrokes.ts`가 세운 규율과 같고,
차이는 Orca가 **금지 쪽에 대체재를 붙여줬다**는 것뿐이다.

**판정**: G3의 실용 해법은 권한 확대가 아니라 **계약 + 대체재**다. 비용 S. 우리 코드
한 줄도 안 건드리고 preamble/툴 설명만 고쳐도 오늘 손실의 상당 부분이 사라진다.

### 1.5 G4 완료 신호 — 서버측 long-poll (`check --wait`)

- CLI: `orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000`
- 서버: `runtime.waitForMessage(address, { typeFilter, timeoutMs, signal, exclusive })`
  (`rpc/methods/orchestration.ts:712-717`, `814-818`, `881-885`)
- 구현은 **in-memory `Map<handle, Set<waiter>>` ~80줄**
  (`orca-runtime.ts:27469-27548`). 새 트랜스포트도, 데몬도 필요 없다.
- 반환값이 결과 종류를 전부 구분한다: `timedOut / cancelled / connectionLost /
  waiter_exists / consumer_fenced`. **소켓이 닫히면 `signal`로 즉시 슬롯 해제**
  (`orchestration.ts:880`).
- 스킬 가이드가 안티패턴을 이름으로 지목한다:
  > While supervising workers manually, use `check --wait --types …` **instead of sleep/poll
  > loops**. — `skill-guides/orchestration.md`
- 그리고 오해까지 미리 막는다:
  > Treat a `check --wait` timeout or `{count:0}` as a **checkpoint, not a worker failure**.
  > Long coding tasks routinely run 15-60 minutes.

부수: 배치 셸(에이전트 아님)의 완료는 **in-band sentinel**로 잡는다 —
`__ORCA_SETUP_COMPLETE__:<token>:<exit_code>`를 셸이 직접 echo하고 PTY 스트림에서 스캔
(`setup-completion-signal.ts:5,14-42`). **Windows는 PowerShell `-EncodedCommand`로 동일
계약**을 구현했다(같은 파일 19-35). 우리 Windows 1급 제약과 정확히 호환된다.

**판정**: G4는 **완전히 풀린 문제**이고, 이식 비용이 이 조사에서 가장 낮다.

### 1.6 G5 상태 정직성 — 두 층으로 나뉜다 (중요)

Orca를 통째로 "선언형"이라 부르면 틀린다. **두 층이 다르다.**

**(a) 오케스트레이션 상태 = 100% 선언형.** 워커가 CLI로 선언한 것만 상태가 된다.

| enum | 값 | 앵커 |
|---|---|---|
| `MessageType` | status, dispatch, worker_done, merge_ready, escalation, handoff, decision_gate, question, **heartbeat** | `types.ts:1-11` |
| `TaskStatus` | pending, ready, dispatched, completed, failed, **blocked** | `types.ts:17` |
| `DispatchStatus` | pending, dispatched, completed, failed, **circuit_broken** | `types.ts:19` |
| `DeliveryStatus` | **outstanding, acknowledged, fenced** | `types.ts:52` |
| `WorkerDispatchState` | starting, ready, **start_unknown**, failed, succeeded, stopping, **stop_unknown**, stopped, **abandoned** | `types.ts:93-102` |
| `GateStatus` | pending, resolved, timeout | `types.ts:36` |
| `QuestionStatus` | pending, answered, closed | `types.ts:64` |

세 가지가 특히 우리 문제에 직격이다:

1. **`DeliveryStatus`가 정확히 3상태다** — retro §11 P0-2가 제안한
   `undelivered/delivered/acknowledged`와 같은 골격이고, Orca는 여기에 `fenced`(소비자
   세대 교체로 무효화)를 하나 더 뒀다. `getOrCreateRunDelivery` + `--ack <delivery_id>`로
   **ack 전까지 같은 배치를 재생(replay)** 한다 — at-least-once + 명시적 영수증.
2. **`start_unknown` / `stop_unknown` / `outcome_unknown`** — **"모른다"를 1급 상태로 뒀다.**
   이것이 G5의 핵심 통찰이다. wmux의 `agentStatus`가 거짓말한 이유는 추론이 틀려서가 아니라
   **"모름"을 표현할 자리가 없어서 아무 값이나 골랐기** 때문이다. 스킬 가이드가 운용
   규칙까지 준다:
   > A failed or **unknown** start exits nonzero; inspect its `stage`, `effects`, and
   > `residualResources` **instead of guessing or automatically retrying**. A wait-for-setup
   > timeout can honestly leave setup `running`, **which is not proof of failure**.
   > … `worker-abandon` … while **accepting that resources may still be live**.
3. **heartbeat는 워커가 보내고, 코디네이터는 경고만 한다.**
   - 5분 cadence를 preamble이 지시(`preamble.ts:40`), 코디네이터 임계 10분 = 2×
     (`coordinator.ts:74-75`)
   - 그리고 **절대 자동 실패시키지 않는다**:
     > warn only, never auto-fail — a false positive (slow but correct worker) costs more
     > than a false negative (hung worker holding a slot) — `coordinator.ts:207`
   - retro의 "#3 워커가 mtime 29분 정지를 보고 죽었다고 판정 → 하마터면 결함 3건을 버릴
     뻔함"이 정확히 이 false positive다. Orca는 그 트레이드오프를 **주석으로 명시하고 선택**했다.

**보고 권한(authority) 검증**도 배울 값어치가 있다. `worker_done`/`heartbeat`는 다음을 전부
통과해야 상태를 바꾼다(`lifecycle-reconciliation.ts`):
- payload에 **taskId + dispatchId 둘 다** 필수 → 재시도된 태스크의 낡은 완료 보고가 현재
  dispatch를 완료시키지 못함(`preamble.ts:5-9`)
- `hasLifecycleAuthority`: dispatch에 기록된 **pane key**와 발신 pane이 일치해야 함
  (`:16-28`) — "다른 pane의 heartbeat가 hung assignee의 타이머를 갱신하는" 사고 차단(`:159-166`)
- 거부 코드가 11종으로 타입화 (`LifecycleRejectionCode`, `:41-52`)

**(b) UI용 에이전트 상태 = 여전히 파생형.** 냉정하게 적는다.

`AgentStatus = 'working' | 'permission' | 'idle'` (`src/shared/terminal-title-status.ts:19`)는
**터미널 타이틀 문자열 파싱**으로 결정된다 — Gemini의 기호 상수, Claude의 `✳` idle 접두,
braille 스피너, `ready|idle|done` / `working|thinking|running` 키워드 정규식
(`terminal-title-status.ts:22-40, 89-130`). 즉 Orca도 파생 추론을 쓴다. **다만 우리보다 두 가지가 낫다**:

1. **소스가 출력 케이던스가 아니라 에이전트가 스스로 쓴 타이틀**이다 — 반(半)선언적.
2. **다중 소스 우선순위 해소기**가 있다 (`orca-runtime.ts:14074-14115`):
   `permission 타이틀(live)` → `waitText 기반 blocked 판정` → **훅이 보고한 explicit status
   (신선도 비교)** → 타이틀 status → 프로세스 기반 추론. 각 단계에 "왜 이 순서인가" 주석이
   달려 있다(예: `:14096` "permission titles can linger after hooks report the agent resumed").
3. **`'permission'`이 1급 상태다.** wmux의 `agentStatus`에는 이 값이 없다.

**판정**: G5의 답은 "선언 vs 추론"의 이분법이 아니라 **층 분리**다 —
지휘에 쓰이는 상태(태스크·dispatch·배달)는 **선언만** 받고, 화면 뱃지 같은 편의 표시는
추론을 쓰되 **소스와 신선도를 함께 노출**한다. 그리고 어느 층이든 **"모름"을 표현할 수 있어야** 한다.

### 1.7 Orca가 안 푼 것 (공정성)

- **중복 태스크 감지 없음** — retro §5(P1-3)에 해당하는 것은 못 찾았다. Orca는 명시적으로
  "Orca does not schedule workers or infer conflicts"라고 스킬 가이드에서 선언한다. **미해결.**
- **decompose(AI 태스크 분해) 미구현** — `coordinator.ts:185-186` "decomposition isn't
  implemented yet — tasks must be pre-created before run()".
- **retired scheduler** — `coordinator-start`/`run`/`run-stop`은 은퇴했다. 즉 Orca 자신도
  결정론적 코디네이터 루프를 **주력에서 내렸고**, 지금 권장 경로는 **LLM이 코디네이터가 되어
  `check --wait`를 돌리는 것**이다. 우리와 같은 방향으로 수렴 중이라는 강한 신호다.
- 워크트리 청소/고아 정리 계약은 이 조사 범위에서 확인하지 않았다 — **UNVERIFIED**.

### 1.8 Orca에서 훔칠 것 — 우선순위

| # | 항목 | 앵커 | 노력 | 성격 |
|---|---|---|---|---|
| O1 | `waitForMessage` long-poll (~80줄) + `timedOut/cancelled/connectionLost` 구분 | `orca-runtime.ts:27469-27548` | **S** | 신규(소형) |
| O2 | preamble의 "관측 불가 프롬프트 금지 + 대체재" 계약문 | `preamble.ts:106-115` | **S** | 문서만 |
| O3 | 3상태 Delivery + `--ack <id>` replay | `types.ts:52-62` | M | 신규 |
| O4 | `*_unknown` / `abandoned` — "모름"의 1급화 | `types.ts:93-102` | S~M | 스키마 |
| O5 | `worker-read`의 타입화된 `fallbackReason` | `orchestration-worker-output.ts:8-17` | M | 신규 |
| O6 | heartbeat = 워커 선언 + **경고만** (자동 실패 금지) | `coordinator.ts:74,207` | S | 신규(소형) |
| O7 | lifecycle authority (taskId+dispatchId+paneKey 삼중 검증) | `lifecycle-reconciliation.ts:16-28` | M | 신규 |
| O8 | LLM 오케스트레이터용 계약 문서(366줄 스킬 가이드) | `skill-guides/orchestration.md` | S | 문서만 |
| O9 | in-band 완료 sentinel (Windows PowerShell 포함) | `setup-completion-signal.ts` | S | 신규(소형) |
| O10 | `terminal wait --for tui-idle` (dispatch 전 readiness) | 스킬 가이드 | S | 노출 |

전부 **MIT**라 반입에 제약이 없다.

---

## 2. wmux가 이미 갖고 있는데 안 쓰는 것 (소스 직독)

> 이 절이 이 조사에서 **경제적으로 가장 중요한 부분**이다. G1~G5 대부분은 신규 서브시스템이
> 아니라 **이미 존재하는 자산의 스코프·스키마 문제**로 밝혀졌다.

### 2.1 G1의 근본 원인 — mention에 pane pin을 실을 수가 없다

retro §1은 "채널 멘션이 위임 경로가 아니다"로 끝냈다. 실제 원인은 더 구체적이고, **더 싸다.**

자동 paste가 일어나려면 렌더러의 `resolveTaskTargetPty()`가 대상 pty를 찾아야 한다
(`src/renderer/hooks/channelMentionFlush.ts:171-204`). 그 함수는 `to.paneId`가 없으면
`task.history[0].metadata.mentionPaneId`를 보고, 그것도 없으면 **null을 반환하고 끝난다**
(badge만 남는다).

- `ChannelMention` 타입은 `paneId`/`ptyId`를 **지원한다** (`src/shared/channels.ts:254-260`)
- 데몬은 있으면 싣고 없으면 통과시킬 뿐 보강하지 않는다 (`ChannelService.ts:2084-2089`)
- **그런데 MCP `channel_post` 스키마에 `pane_id`/`pty_id`가 없다**
  (`src/mcp/channels.ts:142-151`, 호출부 `:331-336` — `workspace_id`/`name`/`member_id` 3개뿐)

⇒ **MCP로 올린 멘션은 구조적으로 항상 ws-level이고, `mentionPaneId`가 스탬프되지 않으므로
자동 paste 경로는 코드상 도달 불가능하다.** GUI 컴포저로 찍은 멘션만 pane pin을 갖는다.
4/4 재현은 우연이 아니라 **결정론**이었다.

두 번째 차단막: 데몬 wake worker(`src/daemon/channels/channelWakeWorker.ts`, 15초 틱 ·
백오프 `[0,60s,300s]` · cap 3 · `channel.nudgeExhausted` 방송 `:269-277`)는
**GUI가 붙은 Claude pane을 전부 제외한다**(`:426`, `:403` — "the renderer's Stop-hook mention
path owns them while a GUI is alive"). 도그푸딩은 GUI 켠 Claude 8대였으므로 wake worker는
**한 번도 발화하지 않았고, 그래서 exhausted 경고조차 안 나왔다.** 침묵의 정체가 이것이다.

대조군: `a2a_task_send`는 `deliverPtyNudge()`를 **즉시, idle 검사 없이** 호출한다
(`src/renderer/hooks/useRpcBridge.ts:309-318, 1775`). 이것이 유일한 실질 차이다.

그리고 세 번째: 설령 pin이 있어도 `isBusy` 게이트가 `agentStatus`를 본다
(`useChannelsEventSubscription.ts:319-329`). **즉 G5(거짓 status)가 G1을 2차로 막는다.**

**⇒ G1의 최소 수정: `channel_post` 스키마에 `pane_id`/`pty_id` 2필드 + 매핑 2줄.**
(retro P0-1의 (b)+(c)는 그 위에 얹는 정직성 개선이지, 이 결함의 수정이 아니다.)

### 2.2 G2 — 절반은 오늘 이미 열려 있다

- `pane_list({workspace_id: <남의 ws>})`는 **소유권 검사 없이** 통과한다
  (`useRpcBridge.ts:813-858`, `mcp/index.ts:1030-1039`). 반환에 `ptyId`, `agentName`,
  `agentStatus`, **`pendingQuestion`**이 실린다.
- 즉 오케스트레이터는 오늘 당장 남의 pane의 **"무엇을 묻고 막혀 있는가"를 읽을 수 있다.**
  retro가 "장님"이라고 쓴 것은 **터미널 내용**에 한정된 얘기였다.
- 막힌 것은 `input.readScreen`/`input.send`/`input.sendKey`뿐
  (`input.rpc.ts:106-124, 313, 355` `assertWorkspaceOwnsPty`).

**그리고 그 벽을 넘는 토큰 메커니즘도 이미 있다.** `WMUX_COMMANDER_TOKEN` →
`deck.resolvePaneRoute`(`src/main/pipe/handlers/deck.rpc.ts:46-72`)가 임의 ptyId의 진짜
owner를 해석해 주고 MCP가 이를 라우트로 쓴다(`src/mcp/terminalRouting.ts:200-220`,
`src/mcp/index.ts:770-780`). 커맨더 툴 표면은 **읽기 fleet-global, 쓰기 자기 ws 한정**으로
설계돼 있고(`src/shared/commanderSurface.ts:34-45`), 여기에 `terminal_read`,
`terminal_read_events`, `terminal_send`, `terminal_send_key`, `wmux_events_poll`이
**전부 들어 있다**(`commanderSurface.ts:47-77`).

⚠️ 단 M1.5에서 그 토큰을 **의도적으로 자기 워크스페이스로 좁혔다**(`deck.rpc.ts:11-15, 67-71`).
즉 **fleet-wide 형태가 과거에 존재했고 지금은 정책으로 닫혀 있다.**

**⇒ G2는 "새 신뢰 프리미티브 구현"이 아니라 "이미 있는 커맨더 레인의 허용 집합을
`task.owner.verifiedWorkspaceId`로 재개방할 것인가"라는 정책 판정이다.** retro P1-1의
직관이 맞았고, 예상보다 훨씬 싸다.

### 2.3 G3 — 승인 RPC는 있다. 다른 파이프에 있을 뿐이다

retro §4의 "승인 RPC는 wire에 0건"은 **부정확하다.**

- `daemon.approvals.list` / `daemon.approvals.resolve`가 **존재한다**
  (`src/daemon/index.ts:2410-2435`). resolve는 CAS + 화면 재검증 + 키 1회를 한다.
- 다만 **데몬 파이프(token-only)** 전용이고, 주석이 "deliberately NOT in the RpcMethod
  union or methodCapabilityMap"이라 못 박았다(`daemon/index.ts:2400-2404`).
  MCP는 메인 앱 파이프로만 말하므로(`src/mcp/wmux-client.ts:208`) 닿지 않는다.
- 소비자는 웹서버(`WebTerminalServer.ts:760`)와 폰 push뿐. **MCP 툴은 0개 — 이 부분은 사실.**

승인 인박스의 **내용물**이 진짜 제약이다. `HookIngest.driveApprovals`는
`agent.awaiting_input` + hook 소스만 처리하고(`src/daemon/hooks/HookIngest.ts:566, 553`),
Claude에서 그 신호의 유일한 출처는 `AskUserQuestion` PreToolUse 훅이다
(`integrations/claude/hooks/hooks.json:3-13`).

> Claude's PERMISSION prompts ("Do you want to proceed?", the tool-approval gate) have **no
> hook at all** — they are detector-only … and **why M2 refuses to act on detector-sourced
> signals.** — `src/daemon/approvals/approvalKeystrokes.ts:14-18`

**⇒ G3의 정확한 형태: Claude의 일반 permission prompt는 approval 레코드를 아예 만들지 않는다.**
승인 인박스에는 `AskUserQuestion`만 들어온다. Orca와 **정확히 같은 경계**다(§1.4).

한편 **탈출구도 이미 설계돼 있다.** `deckAutonomyStore.ts`의 워크스페이스 autonomy 3-cap 모델:

| cap | 기본 | 의미 |
|---|---|---|
| `summarize` | on | 브레인이 요약만 |
| `continueInstruction` | off | 브레인이 pane에 후속 지시 |
| **`approvalPress`** | **off** | **브레인이 승인 프롬프트에 y/1/2/3을 누름** |

그리고 오너 결정(2026-07-17)이 규율까지 정해뒀다:

> with `approvalPress` on, a **hook-source** awaiting_input may be pressed directly; a
> **`detector`-source (regex) one must be VERIFIED on screen first (`terminal_read`) before
> pressing** — `deckAutonomyStore.ts:21-27`

**⇒ "wmux가 permission prompt 자동응답을 의도적으로 거부한다"는 M2(폰) 경로에 한정된 사실이다.
커맨더 브레인에는 `auto` 모드에서 verify-then-press가 이미 승인돼 있다.** retro의 오케스트레이터는
커맨더가 아니었을 뿐이다.

그리고 `input.sendKey`에 승인 가드가 없다는 retro 주장은 **확인**된다
(`input.rpc.ts:290-327` — 키 유효성 + self-loop + `assertWorkspaceOwnsPty`가 전부).
오히려 MCP 툴 설명이 y/N 승인 프롬프트를 정당한 용도로 광고한다(`src/mcp/index.ts:939`).
**같은 워크스페이스 안에서는 감사 흔적 0으로 승인 키를 누를 수 있다.**

### 2.4 G4 — `Stop` 훅이 이미 배선돼 있다

`integrations/claude/hooks/hooks.json` 5종: `PreToolUse`(AskUserQuestion만) · `PostToolUse` ·
**`Stop`(:25-35)** · `SubagentStop` · `SessionStart`. 없는 것: `Notification`,
`UserPromptSubmit`, `SessionEnd`, `PreCompact`.

`Stop` → `agent.stop` 신호 → `HookIngest` → EventBus tee(`hooks.rpc.ts:695`) → `events.poll`.
**완료 push의 전 구간이 이미 존재한다.** 빠진 것은 "task owner에게 라우팅"뿐이다.

그리고 lifecycle 이벤트는 **RPC 계층에서 이미 전 워크스페이스 firehose다.**
`src/main/pipe/handlers/events.rpc.ts:29-34`가 private 타입을 딱 4개로 한정하고
(`a2a.task`, `channel.message`, `channel.catalog`, `channel.nudgeExhausted`),
최종 필터는 `events.rpc.ts:286`:

```ts
return clientScoped ? clientSet.has(e.workspaceId) : true;
```

주석도 "convenience filter, **not a confidentiality boundary**"라고 자인한다(`:282-285`).

**그런데 MCP 래퍼가 그 문을 닫는다.** `src/mcp/index.ts:1087-1089`가 항상
`requireWorkspaceId()` 결과를 무조건 박아 넣고, `WMUX_EVENTS_POLL_SHAPE`(`:163-181`)에는
`workspaceId` 파라미터가 아예 없다. **raw pipe 클라이언트는 오늘도 전 워크스페이스 lifecycle을
읽을 수 있는데, MCP 오케스트레이터만 못 읽는다.**

**⇒ G4의 최소 수정: `WMUX_EVENTS_POLL_SHAPE`에 `workspace_ids?: string[]`를 추가하고
서버가 "내가 owner인 task의 workspace 집합"과 교집합. private 타입 필터는 손댈 필요 없다.**

⚠️ **단 이것만으로는 push가 아니다** — 아래 §7 제약 참조(10초 MCP 데드라인).

### 2.5 G5 — 선언 신호가 이미 흐르고 있고, 이미 cross-workspace로 보인다

파생 경로(문제의 근원)는 확인된다: `src/main/pty/ActivityMonitor.ts:26-33` —
3초 창에 2000바이트 초과 → `active`, 5초 무출력 → `idle`. 반대편 `waiting`/`complete`는
`AgentDetector`의 regex가 만드는데, 매칭 대상이 **턴 중에도 상시 화면에 있는 status
footer**(`bypass permissions on`, `shift+tab to cycle`)다(`AgentDetector.ts:105-140`).
코드가 이 결함을 자인한다(`PTYBridge.ts:420-441`: "Claude's status footer is visible
MID-TURN, so without this veto the detector both re-alerts while the agent is still working
AND pre-poisons the ledger"). **양방향 거짓말의 구조적 이유가 여기 있다.**

**그러나 hook 권위 신호가 같은 자리에 이미 있다.** `hooks.rpc.ts:152-176`
`buildTurnBoundaryMetadata()`가 `agent.stop`에서 `agentStatus: 'complete'`(파생 아님)와
**`pendingQuestion`**을 함께 찍는다. 그리고 **이 둘은 `pane_list`로 이미 cross-workspace로
노출돼 있다**(§5.2).

⇒ **G5는 "선언 신호를 만들어라"가 아니라 "선언 신호와 파생 신호를 소비자가 구분할 수 있게
소스와 신선도를 함께 노출하라"다.** Orca의 다중소스 우선순위 해소기(§1.6b)와 동형이다.

`deliveryStatus`는 retro 주장 그대로 확인: 타입은 `pending | delivered | target_gone`
(`src/shared/channels.ts:169`)인데 post 시점에 **무조건 `pending`**
(`ChannelService.ts:2106`), `delivered`로 뒤집는 유일한 경로는 수신자 `ack()`
(`:2345-2479`), `target_gone`을 세팅하는 프로덕션 코드는 **없다**.
`channelWakeWorker.ts:40-42` 주석이 이를 "the deliveryStatus dead-code audit finding"이라 부른다.

### 2.6 이미 A2A v1.0을 만족하는 부분

- `TaskState = submitted | working | input-required | completed | failed | canceled`
  (`src/shared/types.ts:793`) — **A2A v1.0과 동일 집합.**
- `VALID_TRANSITIONS`(`:824-832`): `working → input-required`, `input-required → working|canceled`
- MCP `a2a_task_update`가 `input-required`를 노출한다(`src/mcp/index.ts:191-193`)
- `a2a.task` 이벤트는 **dual-party**이므로 워커가 `input-required`로 전이하면
  **오케스트레이터(=`from`)에게 이미 이벤트가 간다**(`events.rpc.ts:243-251`)

⇒ **G3의 프로토콜 경로는 이미 end-to-end로 존재한다.** 빠진 것은 두 가지뿐이다:
(a) 워커에게 "막히면 `input-required`로 전이하라"고 말해주는 계약문이 없다,
(b) **답변/재개 동사가 없다** — Orca의 `ask`↔`reply` 쌍에서 `reply`에 해당하는 것이 없다.
wmux에는 워커→인간(`deck_ask_decision`, 커맨더 전용)과 오케스트레이터→워커(`a2a_task_send`)는
있는데, **워커→오케스트레이터의 블로킹 질문**이 없다.

`a2a.task` dual-party 필터의 구현 방식 자체가 **가시성 확장의 템플릿**이다: EventBus의
`wsFilter`를 쓰지 않고(그러면 `to` 수신자가 매칭 전에 pre-drop된다 — `events.rpc.ts:169-177`)
링 전체를 over-fetch한 뒤 post-filter로 scope를 재부과하고 `max` 절단 + `nextCursor` 되감기
(`:289-299`). `agent.lifecycle`에 "이 ptyId의 워크스페이스를 소유한 task의 owner"를 두 번째
매칭 키로 추가하면 **동일 패턴이 그대로 재사용된다.**

### 2.7 fan-out이 100% 성공하는 이유 (G1의 정답 모델)

`src/main/worktask/FanOutService.ts:299-315`:

```ts
const initialCommand = buildInitialCommand(ctx.agentCmd, promptPath);
// `{agentCmd} "$(cat '{promptPath}')"`
const spawned = await this.renderer.spawnWorkspace({ name, cwd: plan.worktreePath, initialCommand });
```

프롬프트는 `<metaDir>/prompt.md`에 쓰이고(`:290-292`) **새 프로세스의 argv로 전달된다.**
fan-out은 "기존 에이전트에게 메시지를 보내는" 문제를 아예 풀지 않는다 — **프롬프트를 들고
프로세스를 새로 띄운다.** 한계: `FANOUT_MAX_TASKS = 8`, `FANOUT_PROMPT_MAX_BYTES = 8KB`
(`src/shared/workTask.ts:122, 130`).

**⇒ 오늘 wmux에서 "턴을 확실히 시작하는" 방법은 정확히 두 가지다:
(a) argv로 프로세스를 새로 띄우기(fan-out), (b) idle gate 없이 즉시 paste(`a2a_task_send`).
채널 멘션은 둘 다 아니다.** Orca와 같은 결론(§1.2)이고, 원인만 다르다.

### 2.8 부정 확인 (없는 것)

| 없는 것 | 확인 |
|---|---|
| `agent.awaiting_input`에 프롬프트 텍스트 | `events.ts:266-275` — `lastMessage`는 `agent.stop`+hook에만. `hooks.rpc.ts:113-116`이 강제 |
| approvals MCP 툴 | 0건 |
| approval의 EventBus tee | 없음 (`daemon/index.ts:4264`는 폰 push만) |
| `Notification`/`UserPromptSubmit`/`SessionEnd` 훅 | `hooks.json`에 없음 |
| mission MCP 툴 (`task.mission.list`) | RPC는 있음(`daemon/index.ts:3216`), MCP 툴 0건 |
| `wmux_events_poll`의 블로킹/wait 파라미터 | 없음 — 커서 기반 논블로킹, 링 1024 (`events.ts:536`) |

---

## 3. 경쟁 제품 (Orca 외) — G1~G5 대조

> ⚠️ **조사 신뢰성 주의**: 이 절의 1차 초안에는 위임 워커가 지어낸 앵커(존재하지 않는
> 파일:라인, 이슈 번호, 버전, 내부 식별자)가 다수 섞여 있었다. 워커가 스스로 이를 발견해
> 철회하고 1차 문서로 전량 재검증했다. **아래는 재검증본이며, 확인된 것만 앵커를 달았다.
> 철회된 주장은 아예 싣지 않았고, 확인 못 한 것은 UNVERIFIED로 표기했다.**

### 3.0 라이선스 실검증 (SPDX + LICENSE 원문 이중 확인)

| 제품 | SPDX (`gh api`) | LICENSE 원문 | 판정 | ★ | 최종 커밋 |
|---|---|---|---|---|---|
| Orca | MIT | "MIT License / Lovecast Inc." | 🟢 | 31,003 | 2026-07-28 |
| Sculptor (imbue-ai) | MIT | "MIT / Imbue, Inc." | 🟢 | 211 | 2026-07-27 |
| Nimbalyst | MIT | "MIT / Nimbalyst Inc." | 🟢 | 1,333 | 2026-07-27 |
| Crystal (stravu) | MIT | "MIT / Stravu" | 🟢 (**사망**) | 3,108 | **2026-02-26** |
| emdash | Apache-2.0 | "Apache 2.0 / General Action" | 🟢 | 5,279 | 2026-07-25 |
| Routa | MIT | "MIT / Routa Community" | 🟢 | 1,761 | 2026-07-28 |
| container-use | Apache-2.0 | "Apache License 2.0" | 🟢 | 3,922 | 2026-06-12 |
| OpenHands SDK | MIT | "MIT / OpenHands contributors" | 🟢 | 936 | 2026-07-27 |
| **cmux** | **NOASSERTION** | **"GPL-3.0-or-later"** | 🔴 **RED** | 25,227 | 2026-07-28 |

> 🔴 **cmux — 스캐너 함정**: `gh api repos/manaflow-ai/cmux/license`는 `spdx_id: NOASSERTION`을
> 반환한다(헤더에 상용 조항이 붙어 GitHub 파서가 인식 못 함). **LICENSE 원문을 직접 읽어야만**
> "licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later)"가 드러난다.
> `as-is-to-be` §6의 RED 판정은 **1차 자료로 재확인**됐다. 배포되는 Electron 바이너리에
> 전염 실질 위험. **코드 열람·복사 금지 — 참고하려면 독립 재구현.**
> ⚠️ 자동 라이선스 스캐너만 믿으면 이런 리포를 통과시킨다. `THIRD_PARTY_NOTICES` 가드에
> "NOASSERTION은 자동 통과 금지, 사람이 원문 확인" 규칙을 넣을 근거다.

**정정 2건**:
- `All-Hands-AI/OpenHands` → `OpenHands/OpenHands`로 리다이렉트(현 "Agent Canvas", TS).
  파이썬 코어(AgentState·event stream·Condenser)는 **`OpenHands/software-agent-sdk`로 이전**.
- **Crystal은 사망**(5개월 정지). **Nimbalyst가 후계.**

### 3.1 Sculptor (Imbue, 🟢 MIT, 211★) — 작지만 설계가 가장 날카롭다

- **G1 해결** — 모든 에이전트 셸이 `SCULPT_AGENT_ID`/`SCULPT_WORKSPACE_ID`/`SCULPT_PROJECT_ID`를
  export하고(`tools/sculpt/sculpt/main.py:17-22`) full agent ID가 **워크스페이스를 넘어 해석된다.**
  → wmux의 "External MCP has no workspace identity" 문제를 **env var 하나로** 해소.
- **G2 해결** — `sculpt agent status --json` → `status` + `current_activity` + `waiting_detail`
  + `waiting_options` + `error_detail` (`commands/data_types.py:193-207`).
  rate-limit 전용 상태는 **미해결**.
- **G3 의도적 미해결 — wmux와 동일 입장.** SKILL.md 원문:
  > Answering is reserved for the human user in the Sculptor UI — **there is deliberately no
  > CLI answer command.**

  탈출구는 `sculpt agent interrupt`(질문 자체를 폐기)뿐이다.
- **G4 해결 — 이 조사에서 가장 우아한 형태.** `--follow`가 **턴 종료 시 exit**하고
  **exit code 0 = 완료, 2 = WAITING.** SKILL.md가 이를
  "delegate-and-await: the core orchestration pattern"으로 명명하고 폴링보다 우선하라고 지시한다.
- **G5 해결 — DECLARED.** `sculpt signal busy|idle|waiting`를 훅이 호출 →
  `POST /api/v1/agents/{id}/signal`. 어휘는 `TerminalStatusSignal = BUSY|IDLE|WAITING`
  (`interfaces/agents/agent.py:259-268`). 질문 상태는 서버 유지 `pendingUserQuestion`이고
  주석이 파생 추론을 명시적으로 거부한다:
  > its presence is authoritative — **no message-history scanning needed** (`ws_client.py:118-120`)

### 3.2 Nimbalyst (🟢 MIT, 1,333★) — 오케스트레이터 툴세트가 통째로 있다

- **G1·G2·G3 해결.** 메타 에이전트용 MCP 툴 세트가 한 자리에 정의돼 있다 —
  `respond_to_prompt`, `get_session_status`, `get_session_result`, `list_spawned_sessions`,
  `list_worktrees` (`packages/runtime/src/ai/server/services/mcpTopology.ts:158-162`).
- **`respond_to_prompt`은 이 조사에서 확인된 유일한 "오케스트레이터가 자식의 permission
  프롬프트에 직접 답하는" 툴**이다. e2e 테스트 존재(`electron/e2e/ai/meta-agent.spec.ts:393`).
  별도 bypass 플래그를 만들지 않고 **사람이 쓰는 것과 동일한 경로**를 태운 것이 핵심 —
  감사 추적이 하나로 유지된다.
- **G5 해결 — durable waiting.** `SessionStatus = 'idle'|'running'|'waiting_for_input'|'error'`
  이고 `waiting_for_input`에 **"survives restart"** 주석이 달려 있다(`SessionState.ts:10-14`).
  → **대기 상태를 휘발성 UI 상태가 아니라 재시작을 견디는 durable 상태로 둔 것.**
  wmux의 "시작도 안 한 워커가 complete"는 상태가 프로세스 수명에 묶여 생기는 문제이므로 직결된다.
- **G4** EventEmitter 기반 push로 보이나 **정확한 이벤트명·파일은 UNVERIFIED.**

### 3.3 OpenHands (🟢 MIT) — 상태 기계가 가장 정교하다

- **`AgentState`** (`openhands/src/types/agent-state.tsx:1-15`):
  `LOADING, INIT, RUNNING, **AWAITING_USER_INPUT**, PAUSED, STOPPED, FINISHED, REJECTED,
  ERROR, **RATE_LIMITED**, **AWAITING_USER_CONFIRMATION**, USER_CONFIRMED, USER_REJECTED`
  → **wmux G2가 구분 못 하는 4가지(승인대기 / 도구실패 / rate limit / 그냥 느림)를
  타입 레벨에서 전부 분리한다.** `AWAITING_USER_INPUT`(질문)과
  `AWAITING_USER_CONFIRMATION`(승인)까지 갈라놓았다.
- SDK 코어: `ConversationExecutionStatus = IDLE|RUNNING|PAUSED|WAITING_FOR_CONFIRMATION|
  FINISHED|ERROR|**STUCK**|DELETING` + `is_terminal()` (`conversation/state.py:48-79`)
- **G1 — 이 조사에서 찾은 유일한 명시적 위임 계약.**
  `SendMessageRequest.run: bool = False` — *"Whether the agent loop should automatically run
  if not running"* (`conversation/request.py:69-72`).
  **wmux의 G1 갭이 그대로 API 플래그로 명시화돼 있다.** 침묵이 사라지고 `run:false`라는
  관측 가능한 계약이 된다. 추가로 `delegate` 툴이 서브에이전트를 스레드 병렬 실행 후
  join하며 *"waiting for results (blocking)"*로 명시(`tools/delegate/impl.py:38`).
- **G2 해결** — WebSocket `/events/{conversation_id}`(`sockets.py:225`) +
  `LLMRateLimitError` 타입(`llm/exceptions/types.py:114`).
- **G3 해결** — `POST /events/respond_to_confirmation` +
  `ConfirmationResponseRequest{accept: bool, reason: str}`
  (`event_router.py:217-226`, `models.py:401-405`).
  정책은 `AlwaysConfirm` / `NeverConfirm` / **`ConfirmRisky(threshold=HIGH)`**이고,
  **LLM이 액션별 `SecurityRisk = UNKNOWN|LOW|MEDIUM|HIGH`를 선언**하면 정책이 판정한다.
- **G4 해결 — PUSH 2중.** `WebhookSpec`(버퍼링 + 재시도, `config.py:70-103`) + WebSocket 콜백.
- **G5 DECLARED + `StuckDetector`** — 출력 케이던스가 아니라 **action/observation 쌍·독백·
  반복 에러의 의미론적 패턴**으로 교착 판정(`conversation/stuck_detector.py:24-33`).
- **Condenser** — append-only event log에서 이벤트를 "잊기" 위해 Cassandra/Kafka식
  **tombstone**(`Condensation` 이벤트)을 추가하고 `View`가 이를 적용해 LLM 가시 집합을
  계산. 전반부를 요약으로 치환해 prompt cache 재구축 비용과 컨텍스트 보존을 균형
  (`context/condenser/README.md`). *(`as-is-to-be` §5-P2의 "OpenHands Condenser 이식" 항목 근거)*

### 3.4 Claude Agent Teams — 문서와 구현이 어긋난다. wmux G1과 동형이다

- **G1: 문서는 PUSH.**
  > when teammates send messages, they're delivered automatically to recipients.
  > **The lead doesn't need to poll for updates.**

  **그러나 메일함은 JSON 파일**(`~/.claude/teams/{team}/inboxes/{agent}.json`)이고,
  이슈 [anthropics/claude-code#24108](https://github.com/anthropics/claude-code/issues/24108)은
  tmux split-pane에서 teammate가 *"never process their initial mailbox message"*라고 보고한다.
  그리고 **v2.1.207 이전에는 엔트리 하나가 깨지면 해당 메일박스 배달이 통째로 차단**됐다고
  공식 문서가 자인한다. → **wmux의 "실패가 침묵으로 나타난다"와 같은 병리다.**
- **G2 해결** — 패널에서 Enter로 teammate transcript 열람, Esc로 턴 인터럽트. working/failed/idle 구분.
- **G3 명시적 거부 — wmux와 정확히 같은 입장(원문):**
  > A teammate **cannot approve a permission prompt** or supply consent on your behalf, and a
  > teammate that was denied an action **cannot relay it to another teammate to bypass the
  > check.** In auto mode, the classifier treats an approval claim relayed from another agent
  > as **untrusted input** rather than confirmation from you.
  > … Teammate permission prompts appear in the lead session, so **approve them there yourself.**

  유일한 예외는 **plan 승인**: *"the lead session grants teammate plan approvals without a
  separate prompt to you."*
- **G4 PUSH** — *"Idle notifications: when a teammate finishes and stops, it automatically
  notifies the lead."* + `TeammateIdle` 훅(exit 2로 계속 일 시킴), `TaskCreated`/`TaskCompleted` 훅.
- **G5 미해결 — 공식 enum 없음. 그리고 문서가 거짓말을 자인한다:**
  > **Task status can lag**: teammates sometimes fail to mark tasks as completed, which
  > blocks dependent tasks.

### 3.5 Devin — 상태 어휘가 가장 풍부. 2필드 설계가 정답이다

- **G2/G5 해결.** 문서화된 `status_enum`(verbatim): `working, blocked, expired, finished,
  suspend_requested, suspend_requested_frontend, resume_requested, resume_requested_frontend,
  resumed`. 별도로 v3 문서에 `status='running'`의 detail로
  `working / waiting_for_user / **waiting_for_approval** / finished`,
  `suspended`의 detail로 `inactivity / usage_limit_exceeded / out_of_credits / payment_declined / …`
  → **"승인 대기" · "그냥 느림(inactivity)" · "에러"가 전부 구분된다.**
  ⇒ **wmux `agentStatus`가 양방향으로 거짓말하는 원인이 정확히 "한 축에 두 개념을
  눌러담아서"임을 보여주는 반례다.**
- **G4 미해결 — POLL.** list-sessions 문서에 **webhook 언급이 전무**하다.
- **G1/G3 UNVERIFIED** — 휴면 세션 메시지가 즉시 재개를 유발하는지, 승인 전용 엔드포인트가
  있는지 1차 문서에서 확인 못 함.

### 3.6 Cursor Cloud Agents

- **G1 해결** — `POST /v1/agents`(*"immediately enqueue its initial run"*),
  `POST /v1/agents/{id}/runs`(*"Send a follow-up prompt to an existing active agent"*).
- **G2 해결** — `CREATING, RUNNING, FINISHED, ERROR, CANCELLED, EXPIRED` +
  SSE `GET /v1/agents/{id}/runs/{runId}/stream`(assistant text · thinking · tool calls).
  rate-limit / 느림 구분 없음.
- **G3 미해결(API 기준)** — 승인 프롬프트에 답하는 엔드포인트가 공개 API에 **없다**.
  *(초안에 있던 "샌드박스라 승인 프롬프트가 아예 없다"는 인용은 재검증 실패 — 철회)*
- **G4 해결 — PUSH.** webhook `statusChange`, `ERROR` 또는 `FINISHED`에 발화,
  payload에 `id/status/source/target/summary`.
- **G5 DECLARED**(타입 enum + webhook).

### 3.7 Factory droids

- **G3 해결 — `droid.request_permission`.**
  `droid exec --input-format stream-jsonrpc --output-format stream-jsonrpc` 모드에서
  **서버→클라이언트 JSON-RPC 요청** `droid.request_permission`이 나가고, 감싸는 프로세스가
  이를 받아 승인/거부를 반환한다. 문서 표현: *"a policy layer that approve, deny, transform,
  or audit tool permission requests"*.
  ⇒ **승인을 프로토콜 메시지로 외부화**한 설계. wmux가 "자동 응답 금지"를 지키면서도 승인
  요청을 supervisor로 **라우팅**할 길을 보여준다.
- 자율 등급: 기본 read-only(spec-mode), `--auto low` / `medium` / `high`(git push·deploy),
  그리고 명시적 unsafe 플래그.
- **G4 부분 미해결** — `droid exec`는 **동기 + exit code만**, webhook/이벤트 스트림 없음.
- **G1/G2/G5 UNVERIFIED**(SDK 이벤트 상세).

### 3.8 emdash (🟢 Apache-2.0)

- **G1 미해결** — 에이전트 간 dispatch 프리미티브 없음.
- **G2 부분** — **`NotificationType = 'permission_prompt' | 'idle_prompt' | 'auth_success' |
  'elicitation_dialog'`** (`packages/core/src/agents/plugins/capabilities/hooks-types.ts:17-20`)
  + `CanonicalHookEvent{ kind:'status', type:'start'|'stop'|'error'|'notification' }`.
  **이질적인 여러 harness 훅을 하나의 타입으로 정규화한 계층**이 값어치다.
  모델 rate-limit은 미해결.
- **G3 부분** — provider별 `autoApproveFlag`(사람의 사전 승인)
  (`plugins/src/agents/impl/claude/index.ts:172`). 2차 에이전트가 답할 수는 없다.
- **G4 해결 — PUSH.** 훅이 localhost HTTP 수신기(`EMDASH_HOOK_PORT` + nonce +
  `X-Emdash-Pty-Id`)로 POST(`impl/grok/hooks.ts:16-55`); `Stop`/`SessionEnd` → `stop`.
- **G5 대체로 DECLARED**(훅 스트림). fallback 패턴 매칭 존재 여부는 **UNVERIFIED.**

### 3.9 Routa (🟢 MIT)

- A2A 구현은 실체가 있다 — `src/core/a2a/`에 `a2a-agent-card`, `a2a-session-registry`,
  `a2a-executor`, `a2a-outbound-client`, `a2a-task-bridge` + e2e 스펙.
  `submitted`/`input-required`/`auth-required` 문자열이 소스에 존재.
- 프로토콜 분업: **ACP가 주 실행 경로**(*"spawn, prompt, stream"*), SSE가 증분 업데이트,
  A2A는 `/api/a2a/*` (`docs/ARCHITECTURE.md:180-190`).
  → **ACP와 A2A를 역할로 나눠 쓴 선례**로서 §4의 판정과 일치한다.
- **G3 host-only** — `"Only host can approve or reject prompts."` throw
  (`src/core/shared-session/service.ts:433`).
- **G1 UNVERIFIED** — 릴리스 노트에 *"A2A transport runner for Kanban lane automation"*
  언급만 확인. 정확한 트리거 경로는 미확인.

### 3.10 container-use (🟢 Apache-2.0) — **오케스트레이터가 아니다**

MCP 툴 표면이 `environment_create/run_cmd/file_*/checkpoint/…` 뿐이고
**`agent_status`·`list_agents`류 툴이 없다.**
- **G1·G3·G4 미해결. G5 N/A.**
- **G2 부분(사람용, POLL)** — `container-use watch`는 `watch.Watcher{Interval: time.Second}`로
  `git log --remotes=container-use`를 **1초 폴링**한다(`cmd/container-use/watch_unix.go:23-34`).
  **관측 대상은 commit이지 에이전트 상태가 아니다.**
  *(`as-is-to-be` §6의 "Docker 전제 → Windows 1급 지원과 충돌" 기각 유지. 이 조사로
  "오케스트레이션 프리미티브를 배울 것도 없다"가 추가된다.)*

### 3.11 cmux (🔴 GPL-3.0-or-later)

LICENSE 원문 GPL-3.0-or-later 확정, 25,227★, 활발. **아키텍처 세부는 조사하지 않았다** —
GPL이라 어차피 코드 차용이 불가하고, 참고하려면 독립 재구현이 필요하다.
*(초안의 `Resolution` enum·sanitizer 서술은 근거 없어 철회했다.)*

### 3.12 Conductor

- **G1 해결** — `POST /v0/sessions/{id}/messages`가 실제로 작업을 시작.
- **G2 부분** — 세션 `idle`/`working`/errored, 워크스페이스
  `initializing`/`ready`/`sleeping`/`archived`. **승인대기·rate-limit 구분 없음.**
- **G3 미해결** — 승인용 엔드포인트 없음.
- **G4 미해결 — POLL only.** `GET /v0/sessions/{id}/status` 반복 호출이 문서상 유일한 방법.

### 3.13 교차 종합

| | G1 위임 | G2 관측 | G3 승인 | G4 완료 | G5 정직성 |
|---|---|---|---|---|---|
| **Orca** | ✅ 터미널 주입 | ✅ **worker-read + fallbackReason** | ⛔ 계약 금지 + `ask` 대체 | ✅ **long-poll** | ✅ 선언(2층 분리) |
| Sculptor | ✅ cross-ws ID | ✅ waiting_detail | ⛔ **의도적 거부** | ✅ **exit code 2** | ✅ signal 훅 |
| **Nimbalyst** | ✅ | ✅ | ✅ **respond_to_prompt** | 🔶 UNVERIFIED | ✅ **durable waiting** |
| **OpenHands** | ✅ **`run:bool`** | ✅ **RATE_LIMITED** | ✅ **respond_to_confirmation** | ✅ webhook+WS | ✅ **+StuckDetector** |
| emdash | ❌ | 🔶 typed notif | 🔶 사전승인만 | ✅ 훅→HTTP | 🔶 |
| Routa | 🔶 UNVERIFIED | 🔶 | 🔶 host-only | ✅ SSE | 🔶 |
| container-use | ❌ | 🔶 1s git poll | ❌ | ❌ | N/A |
| cmux 🔴 | 미조사 | — | — | — | — |
| Claude Teams | 🔶 **문서≠구현** | ✅ transcript | ⛔ **명시적 거부** | ✅ idle 통지 | ❌ **lag 자인** |
| Devin | 🔶 UNVERIFIED | ✅ **2필드** | 🔶 UNVERIFIED | ❌ **POLL** | ✅ 최다 어휘 |
| Cursor | ✅ | ✅ SSE | ❌ API에 없음 | ✅ **statusChange** | ✅ |
| Factory | ✅ | 🔶 | ✅ **request_permission** | 🔶 동기만 | 🔶 |
| Conductor | ✅ | 🔶 3값 | ❌ | ❌ POLL | 🔶 |
| **wmux (오늘)** | ❌ | 🔶 pane_list만 | ⛔ detector-only | ❌ | ❌ |

**가장 수렴한 갭 = G4(완료 신호).** 형태가 셋으로 정리된다:
① **훅 기반**(Sculptor `signal`, emdash `Stop`/`SessionEnd`)
② **이벤트버스/WS/webhook/long-poll**(Orca, OpenHands, Cursor, Routa SSE)
③ **동기 delegate-and-await**(Sculptor `--follow` exit code, OpenHands blocking `delegate`)

손수 만든 폴링 루프를 정본으로 남긴 곳은 **Devin·Conductor뿐**이고, 둘 다 원격 API-first라
로컬 IPC를 못 쓰는 구조적 제약 탓이다.
**wmux는 로컬 Electron이므로 ①②③을 전부 쓸 수 있다 — 변명의 여지가 없는 갭이다.**

**가장 갈라진 갭 = G3(승인).** 그리고 이것이 이 조사의 가장 중요한 전략적 발견이다.
업계가 세 진영으로 갈렸고 **wmux의 현재 입장은 소수파가 아니라 주류다**:

| 진영 | 제품 | 입장 |
|---|---|---|
| **원칙적 거부** | **Claude Agent Teams**, Sculptor, **wmux** | 타 에이전트의 승인 주장을 untrusted input으로 명시 처리 |
| **문제 해소** | Cursor Cloud | 격리된 머신에 가둠(단 "프롬프트가 아예 없다"는 문구는 UNVERIFIED) |
| **위임 허용** | Nimbalyst, OpenHands, Factory | risk 등급 또는 명시적 policy layer를 걸고 프로그래매틱 승인 허용 |

⇒ **G3는 "아무도 못 푼 난제"가 아니라 의도적 정책 선택이며, wmux는 Anthropic 본사와 같은
포지션에 서 있다.** 다만 위임 허용 3사가 실증했듯 **risk 등급 또는 policy-layer 라우팅을
걸면 안전하게 열 수 있다.**

---

## 4. 프로토콜·표준 — 답이 있나

> 이 절은 **1차 스펙 직독**이다(클론 후 schema/proto/spec 원문). 위임 워커의 조사가 중도
> 실패해 전량 재검증했다.

### 4.1 ACP (Agent Client Protocol) — 🟢 Apache-2.0

리포가 `zed-industries/agent-client-protocol` → **`agentclientprotocol/agent-client-protocol`**
으로 이관됐다(3,787★, 2026-07-28 활동). 최신 릴리스 **v1.6.0 (2026-07-21)**, 그리고
**v2 스키마가 `unstable`로 병행 개발 중**이다(`CHANGELOG.md`).

**v1 실측** (`schema/v1/schema.json`):

| 항목 | 값 |
|---|---|
| `StopReason` | `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled` |
| `SessionUpdate` 11종 | `user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `plan`, `available_commands_update`, `current_mode_update`, `config_option_update`, `session_info_update`, `usage_update` |
| `PermissionOptionKind` | `allow_once`, `allow_always`, `reject_once`, `reject_always` |

**핵심 판정 3건**:

1. **`StopReason`에 "입력 대기"가 없다.** 턴은 끝나거나 아직 도는 중일 뿐이다. 왜냐하면
   ACP에서 승인은 **인밴드 동기 요청**(`session/request_permission`)이고, **클라이언트가
   곧 승인자**이기 때문이다. 즉 ACP는 G3를 "막힘 상태"로 모델링하지 않고 **"클라이언트가
   지금 답한다"로 없애버린다.** → wmux가 ACP 클라이언트가 되면 승인은 **자동으로 우리
   게이트를 통과한다.** (`as-is-to-be` P0-A의 근거가 스펙 수준에서 확인됨)
2. **`SessionUpdate`에 "에이전트가 유휴/대기 중" 알림이 없다.** 스트림은 산출물 중계이지
   상태 선언이 아니다. **⇒ G5는 ACP로 안 풀린다.**
3. **오케스트레이터(제3자) 개념이 없다.** client↔agent는 **엄격히 1:1**이며 세션을 만들지
   않은 제3자가 관측·구동하는 계약이 스펙에 **없다**. **⇒ G1·G2는 ACP 범위 밖이다.**

**v2에서 새로 생긴 것 — wmux에 직접 유용**:
`RequestPermissionSubject`가 타입화됐다 — `tool_call` | **`command`** | `other`.
그리고 `CommandPermissionSubject`는 `{ command: string, cwd: AbsolutePath, toolCallId?, terminalId? }`
를 싣는다(`schema/v2/schema.json`).

> ⇒ **ACP v2를 채택하면 승인 게이트가 화면에서 긁은 문자열이 아니라 구조화된
> `{command, cwd}`를 받는다.** `as-is-to-be` P0-B(결정론적 명령 판정, tree-sitter-bash)의
> **입력 품질이 근본적으로 달라진다.** O-1(A 선행) 권고가 더 강해진다.

### 4.2 MCP — 🟢 (Apache-2.0 전환 중, `NOASSERTION`)

`gh api repos/modelcontextprotocol/modelcontextprotocol/license` → `NOASSERTION`.
LICENSE 원문: "The MCP project is undergoing a licensing transition from the MIT License to
the Apache License, Version 2.0… Documentation contributions (excluding specifications) are
licensed under CC-BY-4.0." **⇒ `as-is-to-be` §5-C의 THIRD_PARTY_NOTICES 정정 항목이 재확인된다.**

스펙 리비전: `2024-11-05` / `2025-03-26` / `2025-06-18` / **`2025-11-25`** / `draft`.
**wmux는 `@modelcontextprotocol/sdk ^1.27.1`(2025-06-18 세대)이라 아래 둘 다 못 쓴다.**

**(a) `tasks` — 2025-11-25 실험 기능 (SEP-1686). G4의 스펙 수준 정답.**

> Tasks are **durable state machines** that carry information about the underlying execution
> state of the request they wrap, and are intended for requestor polling and deferred result
> retrieval. — `docs/specification/2025-11-25/basic/utilities/tasks.mdx:14`

| 요소 | 내용 |
|---|---|
| status | `working` \| **`input_required`** \| `completed` \| `failed` \| `cancelled` |
| 필드 | `statusMessage`, `ttl`, **`pollInterval`**(서버가 폴링 주기를 지시) |
| 메서드 | `tasks/get`(폴), `tasks/result`(**터미널까지 블록**), `tasks/cancel` |
| 푸시 | `notifications/tasks/status` — **optional**. "Requestors **MUST NOT** rely on receiving this notification" |

⇒ 이것이 **retro §5에서 워커 A가 독자적으로 발명한 "accept-then-poll"의 표준형**이다.
그때 A가 옳았다는 것이 스펙으로 확인된다. 그리고 `pollInterval`은 우리가 못 가진
"폴링 주기를 서버가 알려준다"는 정직성 장치다.

**(b) `InputRequiredResult` / MRTR — `draft`(미released, SEP-2322). G3의 MCP 판.**

> Multi Round-Trip Requests (MRTR) pattern introduced which **replaces the previous approach
> of sending server-initiated requests**, such as `roots/list`, `sampling/createMessage`, or
> `elicitation/create`. Servers return an `InputRequiredResult` (`resultType: "input_required"`)
> whose `inputRequests` field carries the requests for the additional information needed…
> Clients respond with `inputResponses` on a **retry of the original request**.
> — `docs/specification/draft/changelog.mdx:24`

그리고 모든 result에 `resultType`이 필수가 된다(`"complete"` | `"input_required"`),
구버전 서버의 누락은 `"complete"`로 간주(`changelog.mdx:26`).

⇒ **stdio에서 서버→클라이언트 요청 없이 "나 막혔다"를 표현하는 방법**이다. wmux가 자기
자신을 MCP로 노출하는 제품이라는 점에서 장기적으로 매우 중요하지만, **아직 draft다.**

**(c) elicitation — 2025-11-25에 URL 모드 추가 (SEP-1036).**
`mode: "form" | "url"`, 응답 action은 `accept | decline | cancel`.
form은 스키마 기반 입력, url은 아웃오브밴드(데이터가 클라이언트에 노출되지 않음).
G3에 매핑되지만 **MRTR이 이를 대체하는 방향**이므로 지금 붙이는 것은 낭비다.

### 4.3 A2A v1.0 — 🟢 Apache-2.0 (25,048★)

`specification/a2a.proto` 실측 — **9개 상태**:

```
TASK_STATE_UNSPECIFIED=0, SUBMITTED=1, WORKING=2, COMPLETED=3, FAILED=4,
CANCELED=5, INPUT_REQUIRED=6, REJECTED=7, AUTH_REQUIRED=8
```

스펙은 이를 **"interrupted state" vs "terminal state"**로 나눈다:

> …until it reaches an **interrupted state (e.g., `input-required`, `auth-required`)** or a
> terminal state (e.g., `completed`, `canceled`, `rejected`, `failed`).
> — `docs/topics/life-of-a-task.md:11-14`

**`input-required`가 G3의 답인가 — 부분적으로 그렇다.**

- 그렇다: 워커가 "나 막혔다"를 **선언**하고, 그 상태가 **비종단**임이 계약돼 있으며,
  `status.message`에 **질문 자체가 실린다**(`docs/tutorials/python/7-streaming-and-multiturn.md:82`).
- 그리고 재개 계약이 있다: 클라이언트가 같은 `taskId`(+`contextId`)로 후속 메시지를 보내면
  태스크가 `working`으로 돌아간다.
- 아니다: **누가 답할 권한이 있는지, 어떻게 답이 전달되는지에 대한 승인 의미론은 없다.**
  A2A는 "무엇을 말할까"의 계약이고 "누가 눌러도 되는가"는 여전히 우리 문제다.

**푸시 알림**: `pushNotificationConfig` webhook — 서버가 "significant state change
(**terminal state, `input-required`, or `auth-required`**)"에 발화한다
(`docs/topics/streaming-and-async.md:54`). **⇒ G4 + G3의 알림 계약이 이미 표준에 있다.**

**wmux와의 겹침 — 이미 6/9다.** `src/shared/types.ts:793`이
`submitted|working|input-required|completed|failed|canceled`를 갖고 있다.
**빠진 것은 `rejected`와 `auth-required` 둘뿐**이고, 둘 다 wmux에 의미가 있다 —
`rejected`("이 태스크 안 받는다", retro §9-#9의 대체된 브랜치 리뷰 같은 상황),
`auth-required`(rate limit / 재로그인 — **G2가 구분 못 하는 4가지 중 하나**).

### 4.4 AG-UI — 🟢 MIT (14,935★)

`EventType`에 `RUN_STARTED/RUN_FINISHED/RUN_ERROR/STEP_STARTED/STEP_FINISHED/CUSTOM/…`.
"사람 대기"는 **별도 이벤트가 아니라 `RUN_FINISHED`의 `outcome.type === "interrupt"`**로
표현된다(`sdks/typescript/packages/client/src/agent/agent.ts:62`,
`sdks/typescript/packages/core/src/__tests__/run-finished-event.test.ts:110`).
LangGraph의 `interrupt()`를 그대로 실어 나르는 구조다.

⇒ **UI 스트리밍 프로토콜이지 오케스트레이션 계약이 아니다.** wmux에 채택할 것 없음.
다만 **"막힘 = 실행의 결과(outcome)이지 별도 상태가 아니다"**라는 모델링은 참고할 만하다.

### 4.5 AGNTCY — 실체 약함

`agntcy/oasf` **325★**, 최종 활동 2026-07-21. 에이전트 **디렉터리/스키마** 쪽이고,
**워커 관측·막힘 보고 계약은 찾지 못했다(not found).** 현 단계에서 채택 대상 아님.

### 4.6 LangGraph `interrupt()` / `Command(resume=…)` — 🟢 MIT (38,287★)

G3의 가장 가까운 프로그래밍 모델 유사물이다 — 그래프가 `interrupt()`로 스스로 멈추고,
호출자가 `Command(resume=value)`로 **같은 지점에서 재개**한다. 체크포인터가 상태를 내구
저장하므로 프로세스가 죽어도 재개된다.

**단 wmux에 직접 채택 불가**: 파이썬 그래프 런타임 전제이고, 우리 워커는 **우리가 통제하지
않는 서드파티 CLI**다(BYO 구독). **개념만 가져온다 — "막힘은 상태가 아니라 재개 가능한
지점이다"**, 즉 Orca `ask --resume <messageId>`와 같은 모양.

### 4.7 G1~G5 × 프로토콜 커버리지

| | G1 위임 | G2 관측 | G3 승인 | G4 완료 | G5 정직성 |
|---|---|---|---|---|---|
| **ACP v1/v2** | ❌ 1:1, 제3자 없음 | ❌ 제3자 관측 없음 | ✅ **인밴드 동기 승인**(v2는 `{command,cwd}`까지) | 🔶 `StopReason`은 있으나 제3자에게 안 감 | ❌ idle/waiting 알림 없음 |
| **MCP 2025-11-25 `tasks`** | ❌ | 🔶 `statusMessage` | ✅ `input_required` | ✅ **`tasks/result` 블록 + `pollInterval`** | ✅ `status` 선언 + ttl |
| **MCP draft MRTR** | ❌ | ❌ | ✅ **`InputRequiredResult`** | 🔶 | ✅ `resultType` 필수 |
| **A2A v1.0** | 🔶 태스크 발신은 있으나 "턴 시작 보장"은 없음 | 🔶 `TaskStatusUpdateEvent` | ✅ **`input-required` + `auth-required`** | ✅ **push webhook** | ✅ 9-state 선언 |
| AG-UI | ❌ | 🔶 RUN_* | 🔶 `outcome:"interrupt"` | ✅ `RUN_FINISHED` | ❌ |
| AGNTCY | ❌ | ❌ not found | ❌ | ❌ | ❌ |

**결론**:

- **G1은 어느 표준에도 없다.** "메시지를 보내면 상대의 턴이 시작된다"를 보장하는 계약은
  표준에 존재하지 않는다. OpenHands의 `run: bool`이 이 조사에서 찾은 **유일한 명시적 표현**이며,
  그것은 표준이 아니라 한 제품의 API 필드다. ⇒ **G1은 우리가 직접 정의해야 한다.**
- **G2도 표준에 없다.** 모든 프로토콜이 1:1(클라이언트-에이전트)을 전제하고, **제3자
  오케스트레이터의 관측권**을 다루지 않는다. ⇒ **여기가 진짜 빈 자리다.**
- **G3·G4·G5는 표준이 이미 답을 갖고 있고, wmux는 그 중 A2A를 이미 6/9 구현했다.**

**최소 비용 최대 커버 판정**: 데스크톱 Electron · Windows 1급 · 로컬 우선이라는 조건에서
**A2A v1.0 정렬이 압도적으로 싸다.** 이미 `input-required`가 있고, dual-party 이벤트가 있고,
전송 계층을 바꿀 필요가 없다(`as-is-to-be` §5-P2 "A2A 스키마 정렬(전송은 제외)" 항목과 동일).
ACP는 **다른 문제(T2, 인바운드 표면)를 푸는 것**이므로 G1~G5의 답이 아니다 —
단 v2의 `CommandPermissionSubject`는 T3(봉쇄)의 입력 품질을 바꾸므로 여전히 최우선이다.

---

## 5. 인접 도메인 — 수십 년 검증된 해법

> 이건 새로운 문제가 아니다. 프로세스 감독·분산 작업 시스템이 40년간 푼 문제다.
> 이 절은 **"파생 추론 대신 선언"** 가설의 검증이다.

### 5.1 가설 검증: "declare, don't infer"는 맞다 — 단 세 가지 단서가 붙는다

**단서 1 — 선언이 가장 값진 지점은 "완료"가 아니라 "시작"이다.**

`systemd.service(5)` 원문:

> `systemctl start` command lines for `simple` services will **report success even if the
> service's binary cannot be invoked successfully.**
> — https://raw.githubusercontent.com/systemd/systemd/main/man/systemd.service.xml

**wmux G1과 문자 그대로 같은 실패 모드다.** `Type=notify`가 존재하는 이유는 단 하나 —
**"started"의 판정 주체를 커널의 fork/exec 경계에서 서비스 자기 코드로 옮기는 것.**
그리고 retro §2.2의 "#3이 `complete`로 보고됐는데 한 줄도 시작 안 함"이 정확히
`Type=simple`의 병리다.

**단서 2 — Celery는 반증이 아니라 경고다.**

> **Task is waiting for execution or unknown.** Any task id that's not known is implied to be
> in the pending state. — https://docs.celeryq.dev/en/stable/userguide/tasks.html

**하나의 값이 UNKNOWN과 KNOWN-IDLE을 겸직**한 결과다. wmux의 `deliveryStatus: pending`이
"미배달"과 "배달됨·미확인"을 뭉갠 것과 **원인이 동일하다.**
그리고 `task_track_started`가 기본 off인 이유도 문서에 있다 —
*"the normal behavior is to not report that level of granularity."*
⇒ **정직함이 옵트인이었던 것이 사고의 근원이다.** 우리 설계에서 정직함은 기본값이어야 한다.

**단서 3 — 선언만으로는 hung을 못 잡는다.**

systemd가 `STATUS=`와 **별개로** `WATCHDOG=1`을 두는 이유다. keep-alive를 놓치면 서비스는
*"placed in a failed state and it will be terminated with `SIGABRT`"*가 되고, 주기는
`WATCHDOG_USEC` 환경변수로 전달된다. `sd_watchdog_enabled(3)`은
*"send a keep-alive notification message … every half of the time returned here"*를 권고한다.

핵심은 **liveness 증거를 프로세스 자신의 이벤트 루프가 생산한다**는 것이다 —
deadlock된 프로세스는 PID도 살아 있고 TCP connect도 통과하지만 **루프에 재진입 못 해
ping을 못 낸다.** retro §2의 "#5가 2시간 `running`"이 바로 이 케이스다.

**`STATUS=`의 착지점**: `systemctl-show.c:735`가 `printf(" Status: \"%s…\"\n", …)`로 렌더하고,
`dbus-service.c:386`에 `SD_BUS_PROPERTY("StatusText", "s", …, SD_BUS_VTABLE_PROPERTY_EMITS_CHANGE)`
— **폴링이 아니라 push 관측이 가능하다.** "워커가 사람이 읽을 현재 활동을 선언한다"의 정본.

### 5.2 Kubernetes — `reason`(기계) / `message`(사람) 2필드 분리

`waiting.reason`은 **머신 판독 enum**(`CrashLoopBackOff`, `ImagePullBackOff`),
`waiting.message`는 사람용 문자열. terminated 쪽은
`exitCode` / `reason` / `message` / `startedAt` / `finishedAt`.
(https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)

**3-probe 분업**도 확인: startupProbe 실패 시 kill+restart이며,
**liveness/readiness는 startupProbe 성공 전까지 비활성**이다. AI 워커로 옮기면:

| probe | 에이전트 등가물 |
|---|---|
| startup | "TUI가 프롬프트를 받을 준비가 됐나" — Orca의 `terminal wait --for tui-idle` |
| readiness | "지금 새 태스크를 줘도 되나" — 유휴 여부 |
| liveness | "아직 살아 있나" — heartbeat / `PostToolUse` |

**컨테이너가 자기 사인을 스스로 선언하는 장치**도 있다 —
`terminationMessagePath`(기본 `/dev/termination-log`),
`terminationMessagePolicy ∈ {File, FallbackToLogsOnError}`,
컨테이너당 4096B / 전체 12KiB, 로그 폴백은 2048B 또는 80줄 중 작은 쪽.
**G5의 "실패 이유는 감독자가 추측하는 게 아니라 피감독자가 남긴다"의 원형이다.**
*(⚠️ 미확인: k8s Event 오브젝트 필드 상세, `ContainersReady`/`PodReadyToStartContainers`
condition — 참조한 pod-lifecycle 페이지는 `PodScheduled`/`Ready`/`Initialized`/
`Unschedulable`/`DisruptionTarget`만 열거했다. **UNVERIFIED**)*

### 5.3 Temporal (🟢 MIT) — heartbeat는 양방향이다

> **Activity Cancellations are delivered to Activities from the Temporal Service when they
> Heartbeat. Activities that don't Heartbeat can't receive a Cancellation.**
> — https://docs.temporal.io/encyclopedia/detecting-activity-failures

**liveness ping이 곧 취소 배달 채널이다.** 이 설계는 "감독자가 워커를 죽이는" 대신
"워커가 물어보러 올 때 알려준다"로 뒤집는다 — wmux처럼 워커 프로세스를 우리가 소유하지
않는(BYO 구독) 환경에 정확히 맞는 모양이다.

그리고 **`SCHEDULE_TO_START`** — *"Maximum time from when an Activity Task enters the Task
Queue until a Worker picks it up"* — 이것이 **G1의 정답 이름**이다.
`START_TO_CLOSE`와 분리돼 있어 **"큐에 앉아만 있었다"와 "실행 중 죽었다"가 구분된다.**
retro §1의 4/4 침묵은 전부 `SCHEDULE_TO_START` 초과였는데, 그 타이머가 없어서
아무 신호도 안 났다.

### 5.4 Airflow — "외부 이벤트 대기"를 1급 상태로

`self.defer()`가 `TaskDeferred`를 raise → *"the task no longer occupies a worker slot"* →
**`deferred` 상태** → triggerer 프로세스의 async `run()`이 `TriggerEvent`를 yield하면
`method_name` 콜백으로 재개.
(https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/deferring.html)

poke 모드 sensor(워커 슬롯 점유)나 reschedule 모드(반복 실행)와 **구조가 다르다.**
⇒ **막힘은 "느린 실행"이 아니라 별개의 상태다**라는 것을 스케줄러 수준에서 못 박은 사례.
A2A의 `input-required`와 같은 사상이고, wmux는 이미 그 상태를 갖고 있다(§2.6).

### 5.5 tmux (🟢 ISC) — 멀티플렉서發 구조화 이벤트 스트림의 선례

**control mode**(`tmux -CC`)는 `%begin <epoch> <cmd-number> <flags>` … `%end`
(실패 시 `%error`, **같은 timestamp+번호**)로 **응답-명령 상관관계**를 보장한다.
알림 집합: `%output`, `%extended-output`, `%exit`, `%session-changed`, `%sessions-changed`,
`%window-add`, `%window-close`, `%window-pane-changed`, `%pane-mode-changed`,
`%pause`/`%continue`(flow control), `%subscription-changed`.
(https://github.com/tmux/tmux/wiki/Control-Mode)

**구독 프리미티브도 있다** — `refresh-client -B name:type:format`으로 클라이언트가 format을
구독하면 값이 바뀔 때 push되며 *"at most once a second"*로 rate-limit된다.

**`wait-for`** — 터미널 멀티플렉서에 내장된 랑데부 채널:

> When used without options, **prevents the client from exiting until woken using
> `wait-for -S` with the same channel.** When `-L` is used, the channel is locked and any
> clients that try to lock the same channel are made to wait until the channel is unlocked
> with `wait-for -U`. — https://manpages.ubuntu.com/manpages/trusty/man1/tmux.1.html

⇒ **G4의 "폴링 대신 깨워줘"가 터미널 멀티플렉서의 표준 기능이라는 증거.**
Orca의 `check --wait`와 같은 모양이고, wmux의 `EventBus.subscribe()` 위에 그대로 얹힌다.
*(⚠️ `wait-for -S`가 대기자 없을 때 신호를 기억하는지는 **UNVERIFIED** — 우리 설계에서는
"기억한다"가 반드시 맞아야 한다. 안 그러면 완료가 대기 직전에 나면 영원히 못 깬다.)*

### 5.6 GitHub Actions — "사람 대기"가 1급 conclusion

status ∈ `queued | in_progress | completed | waiting | requested | pending`
conclusion ∈ `success | failure | neutral | cancelled | skipped | timed_out |
**action_required** | null` (+`stale`, GitHub만 설정)
(https://docs.github.com/en/rest/checks/runs)

**`action_required`가 "사람 승인 대기"를 종결 사유로 승격**시킨 것이 핵심이다. wmux에는
이 어휘가 없어서 "막힘"이 "느림"과 같은 칸에 들어간다.

**그리고 이 절에서 가장 중요한 보안 교훈** — `set-output` 폐기 공지:

> To avoid **untrusted logged data** to use `save-state` and `set-output` workflow commands
> **without the intention of the workflow author**, we have introduced a new set of
> environment files.
> — https://github.blog/changelog/2022-10-11-github-actions-deprecating-save-state-and-set-output-commands/

⇒ **stdout에 마커를 찍어 상태를 선언하는 설계는 신뢰 경계를 무너뜨린다**는 GitHub 자신의
자백이다. 아래 킬 리스트 #10의 근거.

### 5.7 라이선스 판정 — 프로토콜 모양의 복제

systemd는 LGPL-2.1+지만, **프로토콜 어휘(`READY=1`/`STATUS=`/`WATCHDOG=1`)만 자체 트랜스포트
위에 재구현하는 것은 파생물이 아니다.** `sd_notify(3)`이 "Standalone Implementations" 절에서
직접 이렇게 쓴다:

> it is also possible to **reimplement the simple readiness notification protocol without
> external dependencies** — https://raw.githubusercontent.com/systemd/systemd/main/man/sd_notify.xml

(다국어 예제까지 제공한다.) **코드 0줄 복사면 문제 없다.**
tmux는 **ISC(🟢)**라 코드 참조도 가능하다.
⚠️ **supervisord만 주의** — `LICENSES.txt`에 BSD-3에 없는 **4항(수정 시 변경 고지 의무)**이
있다. **코드를 벤더링할 때만** 해당한다.

### 5.8 G1~G5 × 인접 도메인 최적 패턴

| 갭 | 최적 검증 패턴 | wmux 등가물 | 성격 |
|---|---|---|---|
| **G1** | Temporal **`SCHEDULE_TO_START`** + systemd `Type=notify` | `submitted→working` 전이가 이미 ACK 자리다. **타이머 하나**만 없다 | 기존 자산 |
| **G2** | systemd `STATUS=` + k8s **`reason`(enum) / `message`(사람)** 2필드 | `TaskStatus.message`는 이미 있음. 닫힌 `reason` enum 추가 | 기존 자산 + 소형 |
| **G3** | Airflow **deferrable** + Temporal **signal** + GHA **`action_required`** | `input-required` 상태 존재. `ApprovalRegistry` 존재. **연결만 없음** | 기존 자산 |
| **G4** | tmux **`wait-for`** 랑데부 | `EventBus.subscribe()` 훅 존재 | 소형 신규 |
| **G5** | systemd notify(선언) + WATCHDOG(무응답) + **Celery 반면교사(UNKNOWN≠IDLE)** | A2A 계층은 이미 정답. **pane 계층이 문제** | 라벨링 |

**G5의 워치독은 Claude Code에서 사실상 공짜다** — `PostToolUse` 훅이 매 툴 호출마다
발화하고, 그것이 곧 `WATCHDOG=1`이다. 에이전트 바이너리 수정 0줄이고, wmux는 **이미 이 훅을
ingest 중이다**(`integrations/claude/hooks/hooks.json:14-24`).

⚠️ **단, 워치독의 산출물은 행동이 아니라 사유여야 한다.** systemd는 `SIGABRT`로 죽이지만
wmux는 죽이면 안 된다 — 에이전트가 20분을 정당하게 생각할 수 있고, 컨텍스트는 돈이다.
`working` 상태를 뒤집지 말고 **`stale` 관측치를 덧붙여라**(k8s `ContainerStatusUnknown`의 태도).
그리고 이것이 retro §2의 "#3 워커가 mtime 29분 정지로 죽었다고 오판할 뻔한" 사고의 예방책이다.

---

## 6. G1~G5 대조표 (종합)

각 셀은 **"그 갭을 어떻게 풀었나"**다. 안 푼 곳은 **미해결**.

### G1 — 위임(턴을 시작시킨다는 보장)

| 출처 | 해법 |
|---|---|
| **Orca** 🟢MIT | 위임 = **PTY 붙여넣기 + submit 키**(`sendTerminalAgentPrompt`). 메일함은 "깨우지 않는다"를 문서·주석에 명시 |
| **OpenHands** 🟢MIT | **`SendMessageRequest.run: bool`** — 전달과 턴 시작을 한 필드로 분리. 이 조사에서 **유일한 명시적 계약** |
| Sculptor 🟢MIT | cross-workspace agent ID(env var) → UI와 동일 엔드포인트 |
| Temporal 🟢MIT | **`SCHEDULE_TO_START` 타임아웃** — "큐에 앉아만 있었다"를 별도 실패로 |
| systemd LGPL(모양만) | `Type=notify` — 시작 판정 주체를 서비스 자신에게 |
| Claude Teams | **미해결(문서는 push, 구현은 파일 메일함 poll)** |
| ACP / MCP / A2A | **미해결** — 어느 표준에도 "턴 시작 보장" 계약이 없다 |
| Conductor · Cursor · Factory | 원격 API `POST` — 세션이 원래 서버 소유라 문제 자체가 없음 |
| emdash · container-use · cmux | **미해결**(프리미티브 없음) |

### G2 — 관측(침묵의 원인 구분)

| 출처 | 해법 |
|---|---|
| **Orca** 🟢MIT | `worker-read --dispatch` — 증명 가능한 transcript, 불가 시 **타입화된 `fallbackReason` 6종**과 함께 터미널 폴백 |
| **OpenHands** 🟢MIT | `AgentState`에 `AWAITING_USER_INPUT` / `AWAITING_USER_CONFIRMATION` / **`RATE_LIMITED`** / `ERROR` / `STUCK`가 전부 별개 |
| **Devin** (개념) | **`status` × `status_detail` 2축** — `running+waiting_for_approval` vs `running+inactivity` |
| **k8s** | `waiting.reason`(기계 enum) + `waiting.message`(사람) 2필드 |
| **systemd** | `STATUS=` 문자열 + D-Bus `EMITS_CHANGE` push |
| Sculptar/Nimbalyst 🟢MIT | `waiting_detail`/`waiting_options`, `promptType` |
| tmux 🟢ISC | control mode `%begin/%end/%error` 상관관계 + 알림 스트림 |
| ACP / A2A / AG-UI | **미해결** — 전부 1:1 전제. **제3자 오케스트레이터 관측권 계약이 없다** |
| Conductor | **미해결** — 문서가 "직접 확인하라"고 안내(자인) |

### G3 — 승인(막힌 워커 해제)

| 출처 | 해법 |
|---|---|
| **Orca** 🟢MIT | **계약으로 금지 + 대체재**: preamble이 `AskUserQuestion` 사용을 금지하고 `orchestration ask`(내구 질문 + `--resume`)를 준다 |
| **Nimbalyst** 🟢MIT | **`respond_to_prompt` MCP 툴** — 오케스트레이터가 **사람과 동일 코드 경로**로 승인 |
| **OpenHands** 🟢MIT | `respond_to_confirmation` + **LLM이 선언한 `SecurityRisk`** × `ConfirmRisky(threshold)` |
| **Factory** (개념) | **`droid.request_permission` JSON-RPC** — 승인을 프로토콜 메시지로 외부화, 감싸는 프로세스가 정책 계층 |
| **A2A v1.0** 🟢Apache | **`input-required` + `auth-required`**를 "interrupted state"로 분류. `status.message`에 질문 탑재 |
| **MCP draft** | `InputRequiredResult`(`resultType:"input_required"`) — stdio에서 서버→클라 요청 없이 표현 |
| **ACP** 🟢Apache | 인밴드 동기 `session/request_permission` — **클라이언트가 곧 승인자**라 문제를 없앰. v2는 `{command, cwd}`까지 실어줌 |
| **Airflow** | `deferred` — 대기를 1급 상태로, 워커 슬롯 반납 |
| **GHA** | conclusion **`action_required`** |
| **Claude Teams · Sculptor · cmux** | ⛔ **원칙적 거부**(wmux와 동일 진영) |
| Cursor · Conductor · Devin | **미해결**(공개 API에 없음) |

### G4 — 완료 신호

| 출처 | 해법 |
|---|---|
| **Orca** 🟢MIT | `check --wait` **서버측 long-poll**(~80줄) + `timedOut/cancelled/connectionLost/waiter_exists/consumer_fenced` 구분 |
| **Sculptor** 🟢MIT | `--follow` + **exit code 0=완료, 2=WAITING** — 셸 프리미티브로 환원 |
| **OpenHands** 🟢MIT | `WebhookSpec`(버퍼+재시도) + WebSocket 2중 push |
| **Cursor** | `statusChange` webhook |
| **tmux** 🟢ISC | **`wait-for`** 명명 채널 랑데부 |
| **MCP 2025-11-25** | `tasks/result`(터미널까지 블록) + `pollInterval` + optional `notifications/tasks/status` |
| **A2A** 🟢Apache | `pushNotificationConfig` webhook, terminal/`input-required`/`auth-required`에 발화 |
| emdash 🟢Apache | 훅 → localhost HTTP(nonce + PTY id) → IPC |
| **Devin · Conductor** | **미해결 — 폴링이 정본** |
| Factory | `droid exec`는 동기 exit code만 |

### G5 — 상태 정직성

| 출처 | 해법 |
|---|---|
| **Orca** 🟢MIT | **층 분리**: 오케스트레이션 상태는 100% 선언, UI 뱃지는 타이틀 파싱 + **다중소스 우선순위 해소기**. **`start_unknown`/`stop_unknown`/`abandoned`로 "모름"을 1급화** |
| **Sculptor** 🟢MIT | `sculpt signal busy\|idle\|waiting` 훅 선언. *"its presence is authoritative — no message-history scanning needed"* |
| **Nimbalyst** 🟢MIT | `waiting_for_input`에 **"survives restart"** — 대기를 durable 상태로 |
| **OpenHands** 🟢MIT | 선언 + **`StuckDetector`**(케이던스 아닌 action/observation 의미론적 반복) |
| **Devin** | 2축 어휘 |
| **systemd** | `READY=1`/`STATUS=`/`WATCHDOG=1` — 선언 + 무응답 탐지 분리 |
| **k8s** | `terminationMessagePath` — 컨테이너가 자기 사인을 선언. `ContainerStatusUnknown` |
| **Celery** ⚠️반면교사 | `PENDING` = *"waiting for execution **or unknown**"* — **wmux `deliveryStatus`와 같은 버그** |
| **Claude Teams** | **미해결 + 자인**: *"Task status can lag"* |
| ACP | **미해결** — idle/waiting 알림이 스펙에 없음 |

---

## 7. 채택 후보 랭킹

각 항목: ① 출처 ② **라이선스 실검증** ③ 노력 ④ 무엇을 건드리나 ⑤ **신규 구현 vs 기존 자산 노출**

### Tier 0 — 코드 0~20줄, 오늘 손실의 대부분을 제거

| # | 항목 | 출처 / 라이선스 | 노력 | 건드리는 곳 | 성격 |
|---|---|---|---|---|---|
| **R1** | **`channel_post`에 `pane_id`/`pty_id` 추가** — 멘션이 pane pin을 실을 수 있게 | wmux 자체 결함(§2.1) | **S** (스키마 2필드 + 매핑 2줄) | `src/mcp/channels.ts:142-151, 331-336` | **기존 자산 노출** |
| **R2** | **오케스트레이터 계약 문서** — "채널은 알림, 위임은 `a2a_task_send`/fan-out", "타임아웃은 실패가 아니라 체크포인트", "heartbeat는 살아있음이지 끝남이 아님" | **Orca `skill-guides/orchestration.md`** 🟢MIT | **S** (문서만) | 스킬/툴 설명 | **문서** |
| **R3** | **워커 preamble에 "관측 불가 프롬프트 금지 + 대체재"** | **Orca `preamble.ts:106-115`** 🟢MIT | **S** | fan-out 프롬프트 템플릿 | **문서** |
| **R4** | **`deliveryStatus`를 실제 write 결과로 세팅** — `undelivered`/`delivered`/`acknowledged` | Orca `types.ts:52` 🟢MIT + Celery 반면교사 | **S** | `ChannelService.ts:2106` | **기존 자산 수정** |

> **R1이 이 조사의 최대 발견이다.** retro는 G1을 "프리미티브가 다르다"로 결론냈지만,
> 실제 원인은 **MCP 스키마에 2필드가 없어서 자동 paste 경로가 코드상 도달 불가능**했던 것이다.

### Tier 1 — 배선 (기존 자산을 MCP 표면에 연결)

| # | 항목 | 출처 / 라이선스 | 노력 | 건드리는 곳 | 성격 |
|---|---|---|---|---|---|
| **R5** | **`approvals.list` / `approvals.resolve`를 메인 파이프 + MCP 툴로 승격** | **Nimbalyst `respond_to_prompt`** 🟢MIT (형태) | **M** | `daemon/index.ts:2410-2435` → RpcMethod union + `methodCapabilityMap` + MCP 툴 2개 | **기존 자산 노출** |
| **R6** | **`wmux_events_poll`에 `workspace_ids`** — 서버가 "내가 owner인 task의 ws 집합"과 교집합 | wmux 자체(§2.4) + `a2a.task` dual-party 선례 | **M** | `WMUX_EVENTS_POLL_SHAPE`, `events.rpc.ts:286` | **기존 자산 노출** |
| **R7** | **`task.mission.list` MCP 툴** — 오케스트레이터가 자기 소유 태스크와 그 워크스페이스를 조회 | wmux 자체(`WorkTaskService.ts:622-627`) | **S** | MCP 툴 1개 | **기존 자산 노출** |
| **R8** | **`agentStatus`에 `stateSource: declared\|inferred` + `lastDeclaredAt`** | **Orca 다중소스 해소기** 🟢MIT + systemd | **M** | `pane_list` 반환 + `hooks.rpc.ts:152-176` | **기존 자산 라벨링** |
| **R9** | **`a2a_task_wait(task_id, timeout_ms)` long-poll** | **Orca `waitForMessage`** 🟢MIT (~80줄) + tmux `wait-for` 🟢ISC | **M** | `EventBus.subscribe()` 위 신규 RPC + MCP 툴 | **신규(소형)** |

### Tier 2 — 스키마·상태 모델

| # | 항목 | 출처 / 라이선스 | 노력 | 건드리는 곳 | 성격 |
|---|---|---|---|---|---|
| **R10** | **`TaskState`에 `rejected` + `auth-required` 추가** (A2A 6/9 → 8/9) | **A2A v1.0** 🟢Apache-2.0 | **M** | `src/shared/types.ts:793,824` + 전이 그래프 + MCP enum | **스키마** |
| **R11** | **`TaskStatus.reason` 닫힌 enum** (`starting\|running_tests\|awaiting_approval\|rate_limited\|thinking\|crashed\|never_started`) | **k8s `waiting.reason`** + **Devin 2축** | **M** | `TaskStatus`, `a2a.task` 이벤트 | **스키마** |
| **R12** | **`*_unknown` — "모름"의 1급화** | **Orca `WorkerDispatchState`** 🟢MIT | **S~M** | dispatch/mission 상태 | **스키마** |
| **R13** | **`scheduleToStartMs` 타이머** → 미시작 시 `failed(reason:'never_started')` | **Temporal `SCHEDULE_TO_START`** 🟢MIT | **M** | `A2aTaskService` + 기존 `forced` 전이 진입점 재사용 | **신규(소형)** |
| **R14** | **`PostToolUse`를 워치독으로 재해석** → `stale` 관측치(상태를 뒤집지 않음) | **systemd `WATCHDOG=1`** (모양만) + k8s `ContainerStatusUnknown` | **M** | `HookIngest` + pane 상태 | **기존 자산 재해석** |
| **R15** | **`agentStatus`에 `permission` 값 추가** — 타이틀 기반 semi-declared | **Orca `terminal-title-status.ts:19`** 🟢MIT | **S~M** | `titleDetect.ts`(이미 OSC 0/2 파싱 중) + `AgentDetector` | **기존 자산 확장** |

### Tier 3 — 정책 결정 필요 (3모델 패널 대상)

| # | 항목 | 출처 / 라이선스 | 노력 | 건드리는 곳 | 성격 |
|---|---|---|---|---|---|
| **R16** | **커맨더 레인의 허용 집합을 `task.owner.verifiedWorkspaceId`로 재개방** — 오케스트레이터가 자기 소유 판을 읽고 막힘을 푼다 | wmux 자체(§2.2) — **M1.5에서 의도적으로 닫은 것** | **L** | `deck.rpc.ts:46-72`, `terminalRouting.ts:172-220`, `input.rpc.ts:118-122` (**3층 체인**) | **정책 재개방** |
| **R17** | **risk 등급 기반 승인 위임** — LOW만 오케스트레이터에게 | **OpenHands `SecurityRisk`+`ConfirmRisky`** 🟢MIT / **Factory `request_permission`** | **L** | `ApprovalRegistry` + `criticalPatterns` | **신규** |
| **R18** | **ACP `session/request_permission` → `ApprovalRegistry` 라우팅** (지금은 무조건 거부) | **ACP** 🟢Apache-2.0 | **L** | `AcpBrainAdapter.ts:285-289, 411` | `as-is-to-be` P0-A |

⚠️ **R16·R17·R18은 권한 경계 변경 → 객관 트리거. 3모델 패널 필수.**
⚠️ **R17은 R18보다 뒤에 와야 한다** — ACP v2의 `CommandPermissionSubject{command, cwd}`가
들어와야 risk 판정의 입력이 화면 문자열이 아닌 구조화 데이터가 된다. 그리고 `as-is-to-be`
P0-B(결정론적 명령 판정)가 선행돼야 한다. **Cline이 안전 판정을 모델에 맡겼다가
CVE-2026-52025로 우회당한 사례**가 그 근거다.

### 🔴 라이선스 금지 (재확인)

| 프로젝트 | 라이선스 | 비고 |
|---|---|---|
| **cmux** | **GPL-3.0-or-later** | `gh api`는 **NOASSERTION**을 반환한다 — **LICENSE 원문을 사람이 읽어야 드러난다.** 배포 Electron 바이너리에 전염 실질 위험. 코드 열람·복사 금지 |
| supervisord | BSD-3 **+ 4항(변경 고지 의무)** | **코드 벤더링 시에만** 해당. 프로토콜 모양 복제는 무관 |
| systemd | LGPL-2.1+ | **프로토콜 어휘만 재구현하면 파생물 아님** — `sd_notify(3)`이 "Standalone Implementations"를 직접 권한다 |
| magit · firejail · bashlex · Claude Squad · opcode · Daytona 등 | GPL/AGPL | `as-is-to-be` §6 목록 유지 |

> **`THIRD_PARTY_NOTICES` CI 가드 권고**: `NOASSERTION`은 **자동 통과 금지**로 두고 사람이
> 원문을 확인하게 하라. cmux가 정확히 그 구멍으로 통과할 수 있는 형태다.

---

## 8. wmux 고유 제약 — 여기서 작동하지 않을 해법 (킬 리스트)

제약: **Windows 1급 · Electron/Node · 리부트 생존 · 로컬 우선 · BYO 구독(에이전트 바이너리
수정 불가, 단 Claude Code 훅은 가용)**

### 8.1 명시적 킬

| # | 죽이는 것 | 이유 |
|---|---|---|
| **K1** | **sd_notify 트랜스포트 원형** (AF_UNIX `SOCK_DGRAM` + `SCM_CREDENTIALS`) | Windows AF_UNIX는 `SOCK_STREAM` 전용, ancillary data·abstract namespace 없음 (https://devblogs.microsoft.com/commandline/af_unix-comes-to-windows/). **어휘만 가져오고 트랜스포트는 기존 named pipe** |
| **K2** | **`FDSTORE`/`BARRIER`, s6 `notification-fd`** | fd 전달 의존. Windows 불가 + BYO 바이너리에 fd 상속을 강제할 수 없음 |
| **K3** | **`SIGUSR1` 등 POSIX 시그널 기반 전부** | Windows에 POSIX 시그널 없음 |
| **K4** | **runit `./check` / k8s exec·httpGet probe를 PTY 에이전트에 적용** | probe할 엔드포인트가 없다. PTY 타이핑 외 사이드채널이 없고, 타이핑은 composer를 오염시킨다 — `channelWakeWorker`의 텍스트/Enter 분리 쓰기와 quiet gate로 이미 비싸게 배운 것 |
| **K5** | **liveness 실패 시 재시작**(systemd `SIGABRT`, k8s kill+restart) | 에이전트를 재시작하면 **복구 불가능한 컨텍스트가 날아간다.** 20분 정당한 사고가 흔하다. **워치독은 보고만 하고 상태를 뒤집지 마라** |
| **K6** | **이벤트 링을 진실의 원천으로** | `EventBus`는 **in-memory 1024칸**(`src/main/events/EventBus.ts:65`, `shared/events.ts:536`)이고 `bootId`가 재시작마다 새로 발급돼 커서를 전면 무효화한다. **리부트 생존이 모트인 제품에서 완료 신호가 리부트를 못 넘긴다.** 진실은 A2A 내구 로그·채널 스토어에만 |
| **K7** | **Orca `check --wait --timeout-ms 900000`을 그대로 이식** | **`src/mcp/wmux-client.ts:8` `TIMEOUT_MS = 10000` + `RETRY_COUNT = 3`.** 모든 MCP→데몬 RPC가 10초에 끊기고 **자동 재시도된다** — 대기 호출에 재시도는 오작동이다. long-poll은 **~8초 캡 + `timedOut` 반환 + 클라이언트 재호출** 형태여야 하고, 메서드별 timeout override가 선행돼야 한다 |
| **K8** | **Temporal 아키텍처 도입** | 서버 + 영속 클러스터 필요. local-first 위반. **의미론만**(heartbeat=취소 채널, `SCHEDULE_TO_START`) 데몬에 이식 |
| **K9** | **supervisord event listener를 PTY 판에 적용** | 그 판의 stdin/stdout은 **사람이 보는 화면**이다. 단 wmux가 직접 spawn하는 워커(구조화 출력 모드)에는 맞는 모양 |
| **K10** | **`::set-output::`식 stdout 마커로 상태 선언** | GitHub 자신의 폐기 사유가 근거 — untrusted logged data가 워크플로 의도와 무관하게 명령을 실행시킨다. **파일이 시킨 문자열을 출력하는 에이전트가 자기 상태를 위조하게 된다.** wmux의 OSC 133이 안전한 건 **경계와 exit code만 나르고 의미론적 주장을 안 나르기 때문**이다. **이 선을 넘지 마라.** ⚠️ Orca의 in-band 완료 sentinel(§1.5)은 **wmux가 만든 토큰**이라 안전하지만, **에이전트가 상태를 자칭하는 마커로 확장하면 안 된다** |
| **K11** | **tmux `wait-for`/control mode를 실제 의존성으로** | wmux는 tmux를 임베드하지 않고 Windows에서 tmux는 없다. **모양만** 데몬 RPC로 |
| **K12** | **container-use / Docker 전제 도구** | Windows 1급 지원과 정면 충돌 (`as-is-to-be` §6 유지). 추가로 이번 조사 결과 **오케스트레이션 프리미티브 자체가 없어 배울 것도 없다** |
| **K13** | **Cursor식 "샌드박스로 G3 해소"를 단기 해법으로** | wmux에 OS 프리미티브 샌드박스가 **0건**이다(`as-is-to-be` §2.4). 샌드박싱은 P1-E(L)이므로 G3의 단기 답이 될 수 없다 |
| **K14** | **cmux 코드 참조** | 🔴 GPL-3.0-or-later |
| **K15** | **자체 워크플로 엔진 / EventBus를 내구 로그로 재작성** | A2A 이벤트 로그가 이미 내구성 + `restoreFromLog()`를 갖는다. 중복 |

### 8.2 제약이 만드는 설계 귀결

1. **완료 신호는 이벤트 링이 아니라 A2A/채널 내구 스토어를 타야 한다**(K6). 링은 실시간
   편의 채널이지 계약이 아니다.
2. **long-poll은 짧아야 한다**(K7). Orca의 15분 대기는 우리에게 불가능하고, 8초 대기를
   반복하는 형태여도 폴링 빈도가 극적으로 줄어 목적은 달성된다.
3. **선언 신호의 커버리지는 에이전트마다 다르다.** Claude Code는 훅 5종이 있지만
   Codex/Gemini는 없다. ⇒ **Orca의 `fallbackReason` 패턴이 필수다** — "이 워커는 선언
   신호가 없어서 추론값이다"를 타입으로 반환해야 한다. emdash의 `NotificationType`
   정규화 계층(🟢Apache-2.0)이 그 위층이다.
4. **G3의 단기 해법은 코드가 아니라 계약이다**(K13). Orca가 이미 증명했다.

---

## 9. "workspace for AI agents" 로드맵 — T6 판정

### 9.1 갭 5개를 메우면 그 포지션이 성립하는가

**부분적으로 성립한다. 그리고 생각보다 훨씬 싸다.** 이 조사의 순수익은 다음과 같다:

- **G1**은 프리미티브 부재가 아니라 **MCP 스키마 2필드 부재**였다(R1). 4/4 침묵은 결정론이었다.
- **G2**의 절반(`pendingQuestion`·`agentStatus`)은 **오늘 이미 cross-workspace로 읽힌다**(§2.2).
  나머지 절반(터미널 내용)의 메커니즘도 **커맨더 토큰으로 이미 존재하며 M1.5에서 정책으로
  닫혔을 뿐이다**(R16).
- **G3**은 승인 RPC가 **이미 데몬 파이프에 있고**(§2.3), autonomy `approvalPress` +
  verify-then-press 규율도 **오너 승인까지 끝나 있다.** 잠긴 건 문 하나다(R5).
- **G4**는 `Stop` 훅이 **이미 배선돼 있고**(§2.4), lifecycle firehose가 **RPC 계층에서 이미
  열려 있으며**(§2.4), `EventBus.subscribe()` 훅도 있다. MCP 래퍼만 닫혀 있다(R6·R9).
- **G5**는 hook 권위 `agentStatus:'complete'`와 `pendingQuestion`이 **이미 흐른다**(§2.5).
  필요한 건 **출처 라벨**이다(R8).

⇒ **"판을 지휘하는 프리미티브가 비어 있다"는 retro의 진단은 절반만 맞다. 정확히는
"프리미티브는 대부분 있고, 오케스트레이터라는 principal에게 연결되어 있지 않다."**

### 9.2 부족한 것 — 갭 5개로 안 되는 것

| 부족분 | 근거 |
|---|---|
| **워커→오케스트레이터 블로킹 질문** | wmux에는 워커→인간(`deck_ask_decision`, 커맨더 전용)과 오케스트레이터→워커(`a2a_task_send`)는 있는데 **그 반대 방향이 없다.** Orca `ask`↔`reply`, Nimbalyst `respond_to_prompt`가 그 자리다 |
| **중복 태스크 감지** | retro §5. **Orca도 안 풀었다**("Orca does not schedule workers or infer conflicts"). 업계 미해결 |
| **fan-out 자동 랭킹** | `as-is-to-be` T4. 갭 5개와 직교 |
| **선언 커버리지의 벤더 편차** | Claude만 훅 5종. Codex/Gemini는 타이틀/OSC/detector뿐 |
| **완료 신호의 리부트 생존** | K6 — 이벤트 링이 못 넘는다 |

### 9.3 T6 판정 — **추가한다. 단 단독 축으로는 모트가 아니다.**

**판정: `as-is-to-be` §4의 TO-BE에 T6를 추가한다.**

> **T6 지휘(Command)** — 워크스페이스 안의 함대가 **AI 오케스트레이터라는 principal에게
> 위임·관측·해제·완료·상태를 계약으로 제공한다.**
>
> **성립 조건**: ① 위임이 "턴을 시작시킨다"를 보장하거나 못 하면 **명시적으로 실패한다**
> ② 워커의 막힘이 **소유자에게 도달한다** ③ 오케스트레이터가 자기 소유 판의 막힘을
> **정책 범위 안에서 푼다** ④ 완료가 **폴링 없이** 소유자를 깨운다
> ⑤ 모든 상태에 **출처와 "모름"이 표기된다**

**추가하는 근거 4가지:**

1. **기존 5축 어디에도 안 들어간다.** T2(표준 표면)는 **인바운드**다 — 다른 에디터·에이전트가
   wmux 안으로 들어와 쓰는 계약. T6는 **wmux 안의 함대를 밖의 AI가 지휘하는** 반대 방향이고,
   §4.7에서 확인했듯 **ACP·MCP·A2A 어느 표준도 제3자 오케스트레이터를 모델링하지 않는다.**
   T3(봉쇄)는 에이전트 행위 억제, T4(판정)는 산출물 심사, T5(도달)는 사람의 손이다.
   **"에이전트가 principal일 때의 계약"은 빈 자리다.**
2. **오늘의 손실이 전부 이 축에서 났다.** retro §0: "잃은 시간의 대부분은 코드 문제가 아니라
   워커가 일하는 중인지 멈춰 있는지 구분할 수 없어서 발생했다."
3. **시장에서 아무도 다 갖지 못했다** — §3.13 표에서 G1~G5를 모두 푼 것은 **Nimbalyst(1,333★)
   하나**이고, 그마저 G4는 UNVERIFIED다. Orca(31K★)는 G3를 **계약으로 우회**했다.
4. **비용이 낮다.** §9.1대로 Tier 0~1의 대부분이 **기존 자산 노출**이다.

**그러나 T6 단독은 모트가 아니다.** 근거:

- OpenHands·Nimbalyst·Sculptor가 이미 상당 부분 풀었고 전부 **MIT**다. 복제 비용이 낮다.
- Orca는 스택·라이선스가 우리와 같고 ★가 100배다. **속도 경쟁은 이미 진 게임**이다
  (`as-is-to-be` §3 "속도 경쟁 회피" 유지).

**⇒ T6는 T1과 곱해질 때만 방어 가능하다.**

> **T1 × T6 = "재부팅을 넘어 살아남는 함대를, AI가 폴링 없이 지휘하고, 그 상태가
> 거짓말하지 않는다."**
>
> 경쟁자들의 오케스트레이션 상태는 전부 **프로세스 수명에 묶여 있다.** Nimbalyst가
> `waiting_for_input`에 "survives restart"를 단 것이 예외이자 **그 방향이 옳다는 독립 증거**다.
> Orca조차 SQLite로 Run을 살리지만 **PTY 자체의 리부트 생존은 주장하지 않는다.**
> wmux는 **데몬 소유 PTY가 OS 재부팅을 넘는다**(CHANGELOG 3.37.2 #646).
> 여기에 T6를 얹으면 **"밤새 재부팅돼도 아침에 오케스트레이터가 이어서 지휘한다"**가 되고,
> 그건 §3.13 표의 13개 제품 중 **아무도 주장할 수 없는 문장**이다.

**T6의 반대 위험(명시)**: K6가 그 문장을 지금은 **거짓으로 만든다** — 완료 신호가
in-memory 링에 있어 리부트를 못 넘는다. **T1×T6를 주장하려면 완료·막힘 신호를 A2A 내구
스토어로 옮기는 것이 선결 조건이다.** 이것이 T6가 만드는 유일한 L급 신규 작업이다.

### 9.4 권고 착수 순서

```
1) R1 (channel_post pane pin)  ─ S ─ 오늘의 4/4 침묵을 결정론적으로 제거
2) R2·R3 (계약 문서)           ─ S ─ 코드 0줄, Orca가 이미 증명
3) R4 (deliveryStatus 3상태)   ─ S ─ 거짓 영수증 제거
4) R5 (approvals MCP 노출)     ─ M ─ 최고 ROI. 문 하나가 잠겨 있음
5) R6·R7·R9 (owner-scoped events + mission list + task_wait) ─ M ─ 폴링 루프 소멸
6) R8·R11·R12·R15 (출처 라벨 + reason enum + unknown + permission) ─ M ─ G5 정직성
7) R13·R14 (SCHEDULE_TO_START + PostToolUse 워치독)              ─ M
8) R10 (A2A 8/9 정렬)                                             ─ M
──────── 여기까지 3모델 패널 불필요 (권한 경계 불변) ────────
9) R18 (ACP permission → ApprovalRegistry)  ─ L ─ ⚠️ 3모델 패널
10) R16 (커맨더 레인 owner 재개방)          ─ L ─ ⚠️ 3모델 패널
11) R17 (risk 등급 승인 위임)               ─ L ─ ⚠️ 3모델 패널, R18·P0-B 이후
```

**1~4단계는 합쳐 하루 이내**이고, retro가 기록한 손실의 대부분을 제거한다.

---

## 10. 미확인 항목 (UNVERIFIED)

- Nimbalyst의 완료 통지 이벤트명·파일, G4 push 형태
- Routa의 Kanban 레인 → 에이전트 기동 트리거 경로
- Devin의 휴면 세션 메시지 재개 동작, 승인 전용 엔드포인트 유무
- Factory SDK 이벤트 상세, emdash의 fallback 패턴 매칭 유무
- cmux 아키텍처 전반 (🔴 GPL이라 조사하지 않음)
- k8s Event 오브젝트 필드 상세, `ContainersReady`/`PodReadyToStartContainers` condition
- tmux `wait-for -S`가 **대기자 없을 때 신호를 기억하는지** — 우리 설계에서는 "기억한다"가
  맞아야 한다(완료가 대기 직전에 나면 영원히 못 깨는 race)
- Temporal `workflow.await`/`condition()` 상세, GHA required reviewers 최대 대기시간
- Sidekiq, Jenkins/Buildkite input step
- ACP v2 `SessionUpdate` 변형 목록 (스키마 구조가 v1과 달라 자동 추출 실패)
- Orca의 워크트리 청소/고아 정리 계약
