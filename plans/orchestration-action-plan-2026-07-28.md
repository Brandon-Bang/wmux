# 오케스트레이션 갭 — 실행 계획 (2026-07-28)

- **무엇**: 하루치 도그푸딩 회고(`orchestration-retro-2026-07-28.md`)와 경쟁·표준 조사
  (`orchestration-primitives-research.md`)를 **실행 가능한 항목**으로 압축한 문서.
- **검증 상태**: 아래 "§1 자체 검증" 항목은 이 문서를 쓰면서 **내가 직접 소스로 확인**했다.
  조사 워커가 1차 보고에서 앵커를 일부 날조했다가 자진 정정한 이력이 있어, 실행을 좌우하는
  주장은 전부 재확인했다. 확인 못 한 것은 **미확인**으로 남겼다.
- **선행 문서**: `as-is-to-be-2026-07-28.md`(전략·모트) · `workspace-scoping-survey.md`(스코핑 164지점)

---

## 0. 한 줄 판정

**갭 5개는 대부분 "없는 기능"이 아니라 "이미 있는 자산이 오케스트레이터라는 principal에게 연결되지 않은 것"이다.**

그래서 대부분의 처방이 신규 서브시스템이 아니라 **스키마 필드 추가·상수 조정·문구 수정**이다.

---

## 1. 자체 검증 결과

### ✅ 확인 — G1의 결정론적 원인

`src/mcp/channels.ts`의 `channel_post` → `mentions` 배열 스키마 필드는 정확히 셋:
`workspace_id` · `name` · `member_id`. **판을 지정하는 필드가 없다.**

`src/renderer/hooks/channelMentionFlush.ts:171-180` — `to.paneId`가 없으면 메타데이터의
`mentionPaneId`를 요구하고, 없으면 `return null`. `mentionPaneId`는 포스트 시점에 판이
고정돼야 찍히는데 MCP로는 그걸 표현할 수 없다. → **자동 배달이 코드상 도달 불가.**

오늘 워커 4명이 전부 침묵한 것은 우연이 아니라 **결정론이었다.**

### ⚠️ 프레이밍 정정 — 이건 버그가 아니다

같은 파일의 주석이 이유를 명시한다:

> A ws-level mention **BY CONSTRUCTION** (human mention, member_id omitted over MCP,
> deliberate workspace ping) stays badge-only — auto-pasting it into "the one live agent"
> is how a message meant for the human reached an agent PTY (**adversarial review F1**).

워크스페이스 단위 멘션이 자동 붙여넣기 되지 않는 것은 **적대적 리뷰가 잡아낸 실제 사고를
막기 위한 의도적 설계**다. 사람에게 보낸 메시지가 에이전트 PTY로 새어 들어간 적이 있다.

**정확한 진단**: 배달이 깨진 게 아니라, **MCP 호출자에게는 안전한 기본값만 존재하고
"이 판을 지목한다"를 표현할 어휘가 없다.** 오케스트레이터가 정당하게 한 에이전트를
겨냥하려 해도 방법이 없다.

이 구분이 처방을 바꾼다 — 안전 규칙을 **약화**시키는 게 아니라, 호출자가 **명시적으로
지목**할 수 있게 어휘를 **추가**한다. 지목 없는 멘션은 지금처럼 badge-only로 남는다.

### ✅ 확인 — long-poll 이식을 막는 상수

`src/mcp/wmux-client.ts:8-10`
```
const TIMEOUT_MS = 10000;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1000;
```

15분짜리 long-poll은 **이식 불가**다. 10초에 끊기고, 더 나쁜 것은 **대기 중에 재시도가
돈다** — long-poll에 재시도는 오작동이다(같은 대기를 3중으로 연다).

MCP 클라이언트 상수 하나가 완료-신호 해법 전체를 막고 있다.

### ✅ 확인 — 이벤트 스코프

`wmux_events_poll`은 호출 워크스페이스로 자동 스코프되고 **`a2a.task`만 dual-party**다.
즉 크로스 워크스페이스 가시성의 **선례는 이미 존재**한다. 새 개념을 발명할 필요가 없다.

### ❌ 미확인 — 앵커 오류 1건

조사 보고가 인용한 `src/daemon/channelWakeWorker.ts`는 **존재하지 않는 파일**이다.
"wake worker가 GUI 붙은 Claude 판을 제외한다"는 주장은 **근거 미확인**으로 둔다.
실행 항목에 포함하지 않는다.

---

## 2. 실행 항목

우선순위는 (근거 확실성 × 비용 대비 효과)다.

### A1 — `channel_post`에 판 지목 어휘 추가 · **S**

- **무엇**: `mentions[]`에 `pane_id`(및/또는 `pty_id`) 옵션 필드. 지정되면 라우트 시점에
  `mentionPaneId`가 찍혀 기존 배달 경로가 살아난다.
- **왜**: §1. 오늘 손실의 직접 원인이고, 이미 있는 배달 경로에 **입구만 없다**.
- **안전**: 기본 동작 무변경. 지목 없는 멘션은 badge-only 유지 → adversarial review F1 규율 보존.
- **출처**: wmux 자체. 외부 코드 불필요.

### A2 — MCP 클라이언트에 long-poll 모드 · **S~M**

- **무엇**: 대기성 호출에 한해 타임아웃 연장 + **재시도 비활성화**. 전역 상수 변경이 아니라
  메서드별 옵션이어야 한다.
- **왜**: §1. 이게 없으면 A5(완료 대기)가 원천 봉쇄된다.
- **주의**: 재시도를 켠 채 타임아웃만 늘리면 **같은 대기를 3중으로 여는** 더 나쁜 상태가 된다.

### A3 — 워커·오케스트레이터 계약 문서 · **S · 코드 0줄**

- **무엇**: ① 오케스트레이터용: "채널은 알림, 위임은 태스크 전송" ② 워커용 preamble:
  "완료 후 유휴 상태에서 다음 지시가 **어떻게** 도착하는지"를 미리 설명.
- **왜**: 오늘 워커들은 지시가 미배달인 걸 알 방법이 없었고, 나는 그걸 "일하는 중"으로 읽었다.
- **선례**: **Orca**(🟢 MIT, ★31,003, 스택 동일)가 워커 preamble에 정확히 이 문장을 넣어뒀다 —
  *"inbox polling after completion cannot receive that new TASK block and **looks hung**."*
  같은 지뢰를 밟고 주석으로 남긴 것이다.
- **비용 대비 효과가 가장 높다.** 코드를 한 줄도 안 건드리고 오늘 손실의 상당 부분이 사라진다.

### A4 — 막힘(blocked)을 태스크 소유자에게 노출 · **M**

- **무엇**: `agent.awaiting_input`은 **이미 감지된다.** 이걸 워크스페이스 스코프에 가두지
  말고 **태스크를 소유한 워크스페이스**에게 보인다. 승인 **권한이 아니라 가시성만**.
- **선례**: `a2a.task`의 dual-party 예외(§1 확인). 그리고 Claude Agent Teams 공식 문서:
  > *"A teammate cannot approve a permission prompt or supply consent on your behalf …
  > Teammate permission prompts **appear in the lead session**, so approve them there yourself."*

  권한은 안 주되 **사람이 이미 있는 곳으로 프롬프트를 가져오는** 방식. 우리 M2 규율과 정합.
- **근거 자산**: `task.owner.verifiedWorkspaceId`가 이미 서버 검증돼 기록돼 있다 →
  **신규 신뢰 프리미티브 0개.**
- ⚠️ 권한 경계 인접 → 3모델 패널.

### A5 — 완료 대기 프리미티브 · **M** (A2 선행)

- **무엇**: `wait(types, timeoutMs)` 형태의 서버측 long-poll. 오케스트레이터가 폴링 루프를
  자작하지 않게.
- **선례**: **Orca**(🟢 MIT)의 `waitForMessage` — in-memory `Map<handle, Set<waiter>>`
  **~80줄**. 새 트랜스포트도 데몬도 필요 없다. **tmux `wait-for`**(🟢 ISC)도 같은 형태.
- **선결**: A2. 그리고 아래 B1.

### A6 — 상태 어휘를 2축으로 분리 · **M**

- **무엇**: 현재 `agentStatus` 단일 축(출력 케이던스 파생)을 **수명주기 상태 + 정지 사유**
  2필드로.
- **왜**: 오늘 `agentStatus`가 양방향으로 거짓이었다 — 시작 안 한 워커를 `complete`,
  유휴 워커를 2시간 `running`. "왜 안 도는가"를 표현할 어휘가 없다.
- **선례**:
  - **Devin v3**: `status`(new/claimed/running/exit/error/suspended/resuming) +
    `status_detail`(working / **waiting_for_user** / **waiting_for_approval** / inactivity /
    usage_limit_exceeded / …) — 정확히 2축
  - **k8s**: `PodCondition`의 status + reason 2필드
  - **A2A v1.0**(🟢 Apache-2.0): `TaskState` 9값, `INPUT_REQUIRED`/`AUTH_REQUIRED`가
    terminal이 아니라 **interrupted**로 분류
  - **Nimbalyst**(🟢 MIT): `idle | running | waiting_for_input | error`
- **핵심 원칙**: 파생 추론을 없애는 게 아니라, **추론일 때 그 사실을 타입으로 반환한다.**
  Orca가 관측 폴백에 타입화된 이유(`session_not_reported` 등)를 반드시 싣는 것과 같은 규율.

---

## 3. 선결 과제

### B1 — 완료 신호가 리부트를 못 넘는다 · **L**

EventBus가 **in-memory 1024칸 링 + `bootId` 무효화**다.

**리부트 생존이 우리의 유일한 살아남은 모트인데, 그 위에서 완료 신호가 리부트를 못 넘는다.**
T1(생존)과 T6(오케스트레이션)를 결합하려면 여기가 먼저다. A5도 이것 없이는 반쪽이다.

---

## 4. T6 판정 — 추가한다, 단 단독 모트는 아니다

`as-is-to-be` §4의 TO-BE 5축에 **T6 "오케스트레이션 계약"**을 추가한다.

**추가 근거**: T2(표준 표면)는 **인바운드** — 다른 에디터·에이전트가 우리 안으로 들어오는
방향이다. T6는 **반대 방향** — 우리 안의 AI가 함대를 지휘하는 계약이다. 그리고
**ACP·MCP·A2A 어느 표준도 제3자 오케스트레이터를 모델링하지 않는다.**
A2A 스펙에서 "third party" · "observer" · "orchestrator"는 **전부 0회 등장**한다.
빈 자리인 것은 맞다.

**단독으로 모트가 아닌 이유**: OpenHands · Nimbalyst · Sculptor가 이미 MIT로 상당 부분
풀어놨다. 특히 Nimbalyst는 `respond_to_prompt`(한 에이전트가 다른 에이전트의 권한 프롬프트에
응답)까지 구현했다 — 우리는 **의도적으로 안 하는** 쪽이고, 그 판단은 Anthropic·Orca와 같다.

**방어 가능한 형태는 T1 × T6 결합뿐이다**:

> **재부팅을 넘어 살아남는 함대를, AI가 폴링 없이 지휘하고, 그 상태가 거짓말하지 않는다.**

세 조각 중 첫째만 우리가 이미 갖고 있다. 둘째는 A5, 셋째는 A6다. 그리고 셋을 잇는
선결 조건이 B1이다.

---

## 5. 하지 않을 것

| 항목 | 이유 |
|---|---|
| 에이전트가 다른 에이전트의 권한 프롬프트를 자동 승인 | Anthropic·Orca와 같은 편에 선다. wmux `approvalKeystrokes.ts`의 M2 규율(detector 신호로 행동 금지)이 옳다. Orca도 코디네이터가 게이트를 **절대** 자동 해소하지 않는다 |
| 승인 큐 레이트 리밋을 fan-out PR에 섞기 | 승인 시스템 전체 설계다. 별건 |
| 전역 RPC 타임아웃 상향 | A2 참조 — 메서드별 옵션이어야 한다. 전역 변경은 재시도와 결합해 더 나빠진다 |
| 클라우드 샌드박스로 승인 문제 회피 | Cursor의 해법(클라우드 에이전트는 승인이 아예 없음)은 로컬 우선·BYO 전제와 충돌 |
| 워크스페이스 일반 계층(중첩 워크스페이스) | IA가 이미 복잡하다는 게 전략 진단. 태스크 소유 권한(A4)이 더 좁고 근거가 이미 있다 |

---

## 6. 라이선스 주의

채택 후보는 전부 초록이다: **Orca 🟢 MIT** · **Nimbalyst 🟢 MIT** · **A2A 🟢 Apache-2.0** ·
**tmux 🟢 ISC**.

⚠️ **`gh api .../license`의 `NOASSERTION`을 통과로 취급하지 말 것.** 조사 중 어떤 프로젝트는
API가 `NOASSERTION`을 반환했으나 LICENSE 원문은 GPL-3.0이었다. 배포되는 Electron 바이너리에
GPL은 실질 위험이므로, 라이선스 가드는 **`NOASSERTION`을 실패로 처리**하고 사람이 원문을
읽도록 강제해야 한다. (별건 과제)

---

## 7. 오너 결정 필요

1. **A1·A2 즉시 착수 여부** — 둘 다 S이고 근거가 자체 검증됐다. A3(문서)까지 묶으면
   코드 변경이 작고 효과가 즉각적이다.
2. **A4 착수 시점** — 권한 경계 인접이라 3모델 패널 선행. 지금 #673이 같은 영역을 만지고
   있어 문맥이 살아 있다는 이점은 있다.
3. **B1(EventBus 내구화)** — L 규모. T1×T6 결합의 선결 조건이지만 단독으로는 사용자
   가시 효과가 작다. 언제 할지.
4. **T6를 `as-is-to-be` v1.3에 반영할지** — 반영하면 TO-BE가 6축이 된다.
