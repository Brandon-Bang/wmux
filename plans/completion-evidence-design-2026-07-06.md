# §6.M P1 완료증거 계약 (completion-evidence contract) 상세 설계 — Q1-4b

- 상태: **v1.1 (패널 합의 반영)** (2026-07-06) — 3모델 패널(Claude·Codex·GLM 5.2, 각 fresh context) 리뷰 1라운드 반영: 필수 8건(3-MODEL 4·SOLO 4) + 동반 6건 반영, 2건 기각(문서 말미 리뷰 로그). 로드맵 §6.M은 패널 이후 단일 모델 추가 절이라 상세 설계 + 패널 리뷰가 강제됨(로드맵 :414, :489) — 본 리뷰가 그 게이트다.
- 작성: 2026-07-06, Opus 4.8 워커 (W1 레인). 소스 미변경, 산출물 이 문서 1개.
- 계약 정본: `plans/roadmap-12mo-world-no1-2026-07-05.md`(§6.M P1 :418 · 비목표 :421 · §6.F :349 · Q1 수용 :446) · `plans/envelope-design-2026-07-06.md`(A2A 접점 :94·:461·:472·:493, PR 분할 §10) · `plans/gjc-team-runtime-reference-2026-07-06.md`(§4 완료증거 개념 원본, 라이선스 확인 전 개념 참조만).
- 선행 관계: 게이트의 유일 착지지는 **envelope PR4 산출물 `A2aTaskService`** — PR4 슬립 리스크와 컨틴전시는 §③에 명세. envelope 확정본은 재론하지 않고 그 위에 쌓는다.
- 스코프: **A2A 태스크(`domain:'a2a'`)의 `completed`/`failed` 전이 게이트만.** claim-lease 풀(P2)·워크플로 게이트는 비목표(§⑦).

---

## 0. 핵심 결정 요약 (각 1줄 + 근거)

| # | 결정 | 근거 요지 |
|---|---|---|
| E1 | **증거는 전이 API의 별도 1급 `evidence` 입력** — 자유서술 `message`(현행 wire는 string)에 태우지 않음 | 증거는 구조화·기계검증·게이팅 대상. message는 사람용(validateMessage 새니타이즈, useRpcBridge.ts:1781) + 전이 후 append(:1833)라 원자적 게이팅 불가 |
| E2 | **저장 위치 = `TaskStatus.evidence`(additive) + envelope `domain:'a2a'` 전이 payload.evidence** | TaskStatus(types.ts:647) co-locate → a2a_task_query 조회·P2 재사용. envelope 매핑은 확정본(:493) |
| E3 | **completed=구조화 증거(≥1 well-formed 아이템) / failed=사유(summary) 필수 — 형태 검증은 양쪽 공통, verified 요구만 completed 등급 축으로** | 실패엔 passed 증거가 없다(비대칭 해소). malformed 진단 아이템도 감사 로그 잔류 금지(X8). 로드맵 정정 R1(계약 의미 변경 — 승인 필요) |
| E4 | **게이트 단일 강제 지점 = 데몬 `A2aTaskService.transition`. 캐시(a2aSlice)는 데몬 커밋을 재검증 없이 verbatim 적용** | envelope §3.2 P3 단일 writer. 캐시가 transition/evidence를 재검증하면 데몬 force-fail 커밋을 거부해 split-brain(CL3-C6) |
| E5 | **PR 순서: PR-A(순수 함수) → PR-D′(ClaudeWorker 증거 생산+MCP param — 게이트 앞) → PR-B(게이트 활성) → PR-C(관측성)** — 재정 확정 | 게이트가 증거 생산보다 먼저 켜지면 1st-party 완료 전이가 그 창에서 전멸(v1 순서는 E7 전제 자기모순 — CL2) |
| E6 | **files 새니타이즈: 콜론 전면 거부(드라이브·ADS·스킴 일괄)·선행 구분자·`..`·C0 제어문자, 디코드/정규화 안 함(리터럴 판정)** | X7+G5 변종(`C:foo`·`\\?\`·`file://`·percent-encoding·유니코드) 전부 커버. wire 가드는 plain-object+hasOwn+normalize(X6) |
| E7 | **하위호환: 유예 없이 즉시 거부.** 1st-party 발신자(ClaudeWorker)는 게이트보다 먼저(PR-D′) **정직한**(unverified 자기보고) 증거를 생산 | "증거 없이 done 금지"가 계약의 가치. A2A 비내구라 마이그레이션 부채 0. 세탁 없는 컴플라이언스(E9) |
| E8 | **verifiedItemCount: 데몬 transition RPC 결과에 실어 반환 → 렌더러 단일 퍼널(useRpcBridge.ts:354)이 이벤트에 부착** | 단일 a2a.task 방출자 불변식(useRpcBridge.ts:346-349 "Single funnel") 보존 — 데몬 직접 방출은 이중 방출(C9+G7) |
| E9 | **verified≥1은 전이 게이트가 아니라 completed의 "검증 등급"** — 게이트는 구조를 강제, verifiedItemCount는 정직 산출·표기, P2 게이트7은 verified≥1만 신뢰 | run-success 자동 passed 승격(v1 (A)층)은 미검증 런을 verified provenance로 세탁해 P2 하류 오염(CL1, 3모델 전원 기각). §② 논증 |
| E10 | **teardown은 데몬 네이티브 force-fail 진입점**(`failTasksForWorkspaceRemoved`) — validateTransition·evidence 게이트 둘 다 의도적 우회 + 감사 마커 | 실코드: teardown은 submitted/input-required도 강제-fail하며 우회를 명시 선언(workspaceSlice.ts:217-219). 일반 전이 경유는 전이 자체가 거부되어 teardown 붕괴(CL3) |
| E11 | **같은 호출의 status+evidence+artifact는 A2aTaskService 단일 트랜잭션(1 RPC = 1 envelope)** — cross-call artifact 참조는 claim으로만(미해석) | 전이 후 별도 append(현행 useRpcBridge.ts:1880-1885)는 부분 적용 창(X3). envelope §2.6 업무 원자성 계승 |
| E12 | **DoS 캡 실강제**: items≤64·문자열 필드≤4KiB·files≤256×1KiB·직렬화 총≤64KiB — 권위 검증기와 wire 가드 양쪽 코드로 | append-only 정본 로그에 거대 증거 영구 증폭 방지(C3). 캡은 상수로 완결, 주석 금지 |

---

## ① 증거 스키마 정본

### 타입 소유권 (X9 — PR5/PR-A 분리)

- **envelope PR5 소유**: `EvidenceItem`·`CompletionEvidence` 타입(shared/types.ts) + `A2aTransitionPayload.evidence`/`verifiedItemCount` 필드(shared/eventlog.ts). "수용만, 강제 없음"(envelope :472).
- **Q1-4b PR-A 소유**: 검증기(`shared/completionEvidence.ts` — validate/normalize/isSafeRelPath) + 테스트.
- PR-A는 PR5 타입에 의존한다. 중복 기술 금지 — 타입 정의는 PR5에 1회.

### 스키마 전문 (additive, `src/shared/types.ts` A2A 블록 :603 이후)

기존 필드 의미 변경 0. `TaskState`(:624)·`VALID_TRANSITIONS`(:654)·`isTaskState`(:643)·`Message`(:614)는 불변.

```ts
// src/shared/types.ts — additive (envelope PR5)

/** 완료증거 아이템 — discriminated union (G6). status는 닫힌 enum:
 *  자유 문자열이 아니므로 오타·위장 status가 well-formed로 통과할 수 없다. */
export type EvidenceItem =
  | { kind: 'command';                  // 실행된 명령 — 검증됨 = status 'passed'
      status: 'passed' | 'failed';
      summary: string;                  // 필수·비어있지 않음
      command: string;                  // 필수 — 무엇을 실행했나
      output?: string }                 // 출력 발췌(캡 §E12)
  | { kind: 'inspection' | 'artifact';  // 점검/산출물 — 검증됨 = status 'verified'
      status: 'verified' | 'unverified';
      summary: string;                  // 필수·비어있지 않음
      location?: string;                // 대상 위치(선택)
      output?: string };

/** completed/failed 전이에 첨부되는 구조화 완료증거.
 *  전이 API의 별도 1급 입력(자유서술 message에 태우지 않음 — E1).
 *  recordedBy/recordedAt는 wire에서 드롭되고(§④ normalize) 정본 writer가
 *  authContext로 스탬프한다(위조 불가 — §⑤·envelope §7). */
export interface CompletionEvidence {
  summary: string;        // 필수·비어있지 않음(completed=전이 요약 / failed=실패 사유)
  items: EvidenceItem[];  // completed → ≥1 well-formed / failed → 선택(제공 시 형태 검증은 동일)
  files?: string[];       // 상대경로만(§④ isSafeRelPath). 캡 §E12
  recordedBy?: string;    // 서버 전용 스탬프 — wire 값은 normalize에서 드롭
  recordedAt?: string;    // 서버 전용 스탬프(ISO 8601) — wire 값은 normalize에서 드롭
}
```

`TaskStatus`에 additive 1필드:

```ts
export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp: string;
  evidence?: CompletionEvidence;  // additive — completed/failed 전이의 증거(E2)
}
```

### 전이 API에서 evidence가 실리는 위치 (결정: E1 — 별도 파라미터, 4표면 일관)

**현행 4표면의 message는 전부 wire에서 `string`이다** — 구조화 증거를 태울 수 없다:
- MCP `a2a_task_update`: `message: z.string().optional()`(mcp/index.ts:882), 별도 `artifact_data`(:884).
- ClaudeWorker: `updateTaskStatus(..., message?: string)`(ClaudeWorker.ts:159) → wire `{...,message}`(:162-167).
- 렌더러 브릿지: `params.message`(string) → `validateMessage`(useRpcBridge.ts:1781) → **전이(:1803)와 분리**되어 addTaskMessage(:1833)로 append.
- 렌더러 스토어: `statusMessage?: Message`(a2aSlice.ts:60) — 브릿지 프로덕션 경로는 이 인자를 안 넘긴다(:1803).

**evidence는 message와 분리된 별도 1급 입력**으로 4표면에 일관 추가:

| 표면 | 현행 | 추가 |
|---|---|---|
| MCP `a2a_task_update`(mcp/index.ts:874) | `message?`,`artifact_*` | `evidence?: <zod>` param → RPC `params.evidence` (계약 문서화는 §⑤ CL4) |
| 렌더러 브릿지(useRpcBridge.ts:1754) | `params.message` | `params.evidence`를 wire normalize(§④) 통과 후 전달 |
| 렌더러 스토어(a2aSlice.ts) | `statusMessage?` | 캐시 verbatim 적용 경로(§③ C6)가 evidence 포함 상태를 수용 |
| 데몬 `A2aTaskService.transition`(envelope PR4 신설) | — | `transition(taskId, to, { evidence, artifact?, authContext, idempotencyKey })` **← 게이트의 집** |

message는 그대로(사람용·history append). 증거는 기계용. 합치면 (a) validateMessage와 충돌 (b) 게이트가 자유문자열 파싱 (c) "기계검증 가능"(gjc-ref:97) 위반. `WmuxTaskMetadata`(types.ts:687) wmux 확장 선례와 동형.

### envelope 전이 payload와의 매핑 (확정본 위에 — envelope :493)

```ts
// src/shared/eventlog.ts (envelope PR5 소유) — domain:'a2a' 전이 payload
export interface A2aTransitionPayload {
  kind: 'transition';
  taskId: string;
  from: TaskState;
  to: TaskState;
  evidence?: CompletionEvidence;   // PR5 스키마, 게이트는 Q1-4b(envelope :472)
  verifiedItemCount?: number;      // 감사·등급(§②·§⑤, gjc-ref:92)
  artifact?: { name?: string; parts: Part[] };  // E11: 같은 호출 artifact 동반 커밋(단일 envelope)
  forced?: 'workspace_removed';    // E10: force-fail 감사 마커(일반 전이엔 부재)
  // 업무 의존(P2 depends_on)은 payload 레벨 — envelope causalRefs와 합치지 않음(envelope :94)
}
```

`'task'` 도메인 슬롯은 Q2 워크트리/P2 풀 예약 — 손대지 않는다(envelope :493).

---

## ② 검증 불변식 — 게이트 = 구조, verified = 등급 (CL1 재설계)

### v1 (A)층 기각의 수용 (CL1 — 3모델 전원, conf 10)

v1은 ClaudeWorker의 `is_error:false`(exit 0 동형)를 `{kind:'command', status:'passed'}` 아이템으로 자동 승격해 "≥1 검증됨" 게이트를 통과시켰다. 패널 판정: 이 폴백은 **게이트를 "exit 0이면 done"으로 약화**시키고, §⑦에서 P2 게이트7이 verifiedItemCount≥1을 "검증된 dep"로 신뢰하므로 **미검증 런이 verified provenance로 세탁되어 의존성 하류를 오염**시킨다. 수용한다 — v1의 자체 footgun 8("run-success 폴백의 약한 검증")이 바로 이 결함의 자인이었다.

### 방향 결정: (a) 구조 게이트 + verified 등급 (기각: (b) verified≥1 유지 + 하베스트 필수)

**(b)를 기각하는 이유 — CL1 제약 (ii)(iii)을 동시에 만족할 수 없다**:
- 검증 가능한 명령이 원리적으로 없는 정당한 완료가 존재한다(예: "이 파일 요약해줘" — 성공했지만 passed 커맨드가 없다). (b)의 "하베스트 부재 시 전이 규칙"은 ① 합성 verified 아이템 발급 = 세탁 재발(제약 ii 위반) ② completed 거부 = 정당한 완료의 기아·failed 오보고(제약 iii 위반) ③ input-required 강등 = 헤드리스 실행자에 사람 개입 강제(iii 위반, 운영 드래그) — 세 갈래 전부 막힌다.
- (b)는 P1 게이트를 미검증 외부 스키마(stream-json tool 이벤트, 열린 질문 1)에 종속시킨다 — CLI 포맷 변경이 게이트 사고가 된다.
- 근본: **전이 게이트는 주장의 참을 검증할 수 없다** — 외부 에이전트는 `{kind:'command',status:'passed',command:'npm test'}`를 실행 없이 자유 날조 가능하다. verified≥1을 전이 게이트로 유지해도 얻는 것은 구조적 정직성 연극이지 검증이 아니다. 참의 축은 provenance(recordedBy·trustTier)와 소비 측 신뢰 정책(P2 게이트7, FleetView 뱃지)의 몫이다.

**(a) 채택 — 3층 분리**:
1. **전이 게이트(P1, 강제)**: completed = `summary` + `items[]` ≥1 well-formed + 새니타이즈 + 캡. failed = `summary`(사유) + 제공된 items의 형태 검증(X8). **verified≥1은 전이 요건이 아니다.**
2. **검증 등급(P1, 정직 표기)**: `verifiedItemCount`를 데몬 게이트가 산출해 envelope payload·a2a.task 이벤트에 스탬프. 0 = "완료 주장은 구조화됐으나 검증 아이템 없음"(정직한 약한 완료). ClaudeWorker run-success는 `inspection/unverified`로 정직 표기(§⑥) — **count 0, 세탁 불가(제약 ii 충족)**.
3. **신뢰 소비(P2, Q2)**: 게이트7은 `verifiedItemCount ≥ 1`인 completed만 의존성 통과로 신뢰(§⑦ — 이제 게이트가 아니라 등급이 술어이므로 P2에 load-bearing).

**제약 검산**: (i) 수용 :446 불변 — evidence 부재 completed는 여전히 거부(T-gate-missing). (iii) ClaudeWorker 정상 런은 구조 게이트를 항상 통과(정직 증거 상시 생산) — 기아·fail-visible 루프 없음. (iv) 로드맵 :418 "≥1 검증됨" 문면과의 델타 → 정정 제안 R1(계약 의미 변경, 승인 필요)로 명시.

### failed 비대칭 (E3, v1 유지 + X8 보강)

- gjc의 검증판정은 **completed 전이 전용**(gjc-ref:75,90) — failed에 verified를 요구하지 않는다. 동일하게 간다.
- **completed**: summary + items ≥1 well-formed. **failed**: summary(=실패 사유) 필수, items 선택 — 단 **제공된 items의 형태 검증(kind/status/summary/command)은 completed와 동일하게 수행**(X8: v1은 failed에서 형태 루프 전에 return해 malformed 진단 아이템이 감사 로그에 영구 잔류했다).
- **canceled**: 증거 무관 — 별도 경로(`cancelTask` a2aSlice.ts:204 / `a2a.task.cancel`)이고 중단이지 결과 주장이 아니다(gjc-ref:104 동형).

### 코드 수준 판정식 (PR-A)

```ts
// src/shared/completionEvidence.ts (신설 — 검증기만, 타입은 PR5 소유 X9)
import type { CompletionEvidence, EvidenceItem } from './types';

// E12: DoS 캡 — 전부 코드 강제(권위 검증기 + wire normalize 양쪽)
export const EVIDENCE_MAX_ITEMS = 64;
export const EVIDENCE_MAX_STR_BYTES = 4 * 1024;      // summary/command/location/output 각각
export const EVIDENCE_MAX_FILES = 256;
export const EVIDENCE_MAX_FILE_PATH_BYTES = 1024;
export const EVIDENCE_MAX_TOTAL_BYTES = 64 * 1024;   // JSON.stringify(evidence) 총량

/** "검증됨" = (command && passed) | (inspection|artifact && verified). 등급 산출 전용 — 전이 게이트 아님(E9). */
export function isVerifiedItem(it: EvidenceItem): boolean {
  if (it.kind === 'command') return it.status === 'passed';
  return it.status === 'verified';  // union이 kind를 닫아둠(G6)
}

function isWellFormedItem(it: unknown): it is EvidenceItem {
  if (it === null || typeof it !== 'object') return false;
  const o = it as Record<string, unknown>;
  if (typeof o.summary !== 'string' || o.summary.trim() === '') return false;
  if (o.kind === 'command') {
    return (o.status === 'passed' || o.status === 'failed')
      && typeof o.command === 'string' && o.command.trim() !== '';
  }
  if (o.kind === 'inspection' || o.kind === 'artifact') {
    return o.status === 'verified' || o.status === 'unverified';
  }
  return false;  // 알 수 없는 kind/status = 형태 불량(fail-closed)
}

function withinCaps(ev: CompletionEvidence): boolean {
  const b = (s: unknown) => typeof s === 'string' ? Buffer.byteLength(s, 'utf8') : 0;
  if ((ev.items ?? []).length > EVIDENCE_MAX_ITEMS) return false;
  if (b(ev.summary) > EVIDENCE_MAX_STR_BYTES) return false;
  for (const it of ev.items ?? []) {
    const io = it as { summary?: string; output?: string; command?: string; location?: string };
    if (b(io.summary) > EVIDENCE_MAX_STR_BYTES || b(io.output) > EVIDENCE_MAX_STR_BYTES) return false;
    if (b(io.command) > EVIDENCE_MAX_STR_BYTES || b(io.location) > EVIDENCE_MAX_STR_BYTES) return false;
  }
  if ((ev.files ?? []).length > EVIDENCE_MAX_FILES) return false;
  return Buffer.byteLength(JSON.stringify(ev), 'utf8') <= EVIDENCE_MAX_TOTAL_BYTES;
}

export type EvidenceVerdict =
  | { ok: true; verifiedItemCount: number }
  | { ok: false; code: string };

/** 완료증거 게이트. to는 completed|failed만(canceled·force-fail은 호출 안 함 — §③ E10). */
export function validateCompletionEvidence(
  to: 'completed' | 'failed',
  ev: CompletionEvidence | undefined,
): EvidenceVerdict {
  if (!ev) {
    return { ok: false, code: to === 'completed' ? 'completion_evidence_missing' : 'failure_reason_missing' };
  }
  if (typeof ev.summary !== 'string' || ev.summary.trim() === '') {
    return { ok: false, code: to === 'completed' ? 'completion_evidence_empty_summary' : 'failure_reason_missing' };
  }
  if (!withinCaps(ev)) return { ok: false, code: 'completion_evidence_too_large' };          // E12
  for (const f of ev.files ?? []) {
    if (!isSafeRelPath(f)) return { ok: false, code: 'completion_evidence_bad_file_path' };  // §④
  }
  // X8: 형태 검증은 completed·failed 공통 — malformed 진단 아이템의 감사 로그 잔류 차단
  const items = ev.items ?? [];
  for (const it of items) {
    if (!isWellFormedItem(it)) return { ok: false, code: 'completion_evidence_invalid_item' };
  }
  if (to === 'completed' && items.length === 0) {
    return { ok: false, code: 'completion_evidence_no_items' };
  }
  // E9: verified≥1은 전이 요건이 아니라 등급 — 정직 산출해 반환(0 허용)
  return { ok: true, verifiedItemCount: items.filter(isVerifiedItem).length };
}
```

`completion_evidence_no_verified_item`은 **전이 거부 코드에서 제거**된다(v1 대비) — 그 의미는 ① `verifiedItemCount=0`의 정직 표기(이벤트·payload·FleetView 뱃지)와 ② P2 게이트7의 의존성 거부 사유(`task_dependency_unverified` 계열, Q2 명명)로 이동한다.

---

## ③ 게이트 강제 지점 + 시퀀싱 (단일 강제 지점 · 우회 0 · CL2/CL3)

### 게이트의 집 = 데몬 `A2aTaskService.transition` (결정: E4)

오늘의 전이 정본은 렌더러 `a2aSlice.updateTaskStatus`(a2aSlice.ts:153, validateTransition 강제 :178)이고 4표면이 전부 이를 통과한다. envelope PR4가 정본을 데몬 `A2aTaskService`로 이관하고(VALID_TRANSITIONS 서버강제 envelope :434,:461), a2aSlice를 캐시로 강등하며(D11), ClaudeWorker 전이를 데몬 직결로 재배선한다(C12, envelope :277). **게이트는 처음부터 A2aTaskService.transition에만 착지한다.**

**캐시 verbatim 계약 (CL3-C6)**: 캐시 a2aSlice는 데몬 커밋을 **재검증 없이 verbatim 적용**한다 — evidence 게이트뿐 아니라 **structural validateTransition도 재실행하지 않는다**. 근거: 데몬 force-fail(E10)은 submitted→failed 등 그래프 밖 전이를 정당하게 커밋하는데, 캐시가 validateTransition을 재실행하면 그 커밋을 거부해 split-brain이 난다. 구현: 캐시-적용 전용 메서드(`applyDaemonTaskUpdate` — 검증 없음)를 신설하고, 검증 로직을 가진 `updateTaskStatus`는 정본 이관과 함께 writer 역할에서 은퇴한다(컨틴전시 발동 시엔 유지 — 아래).

### 우회 0 증명 — 진입 경로 추적 (5경로)

| 진입 | 오늘 | Q1-4 후(데몬 정본) | 게이트 도달? |
|---|---|---|---|
| MCP 외부 에이전트 | `a2a_task_update`(mcp/index.ts:874) → main passthrough(a2a.rpc.ts:243) → 브릿지 → store(:1803) | passthrough를 데몬 직결로(envelope :276) → `A2aTaskService.transition` | ✅ |
| ClaudeWorker(스폰 실행자) | `sendToRenderer('a2a.task.update')`(ClaudeWorker.ts:162) → 브릿지 → store | C12 재배선: 데몬 append 경유(envelope :443) | ✅ + 증거 생산은 PR-D′ 선행(E5) |
| 렌더러 브릿지 | `store.updateTaskStatus`(useRpcBridge.ts:1803) | 데몬 RPC 호출 → 결과 캐시 verbatim 적용 | ✅ (게이트는 데몬) |
| **워크스페이스 teardown** | **workspaceSlice.ts:212-238 직접 mutate — validateTransition 우회 명시 선언(:217-219)** | **데몬 네이티브 force-fail 진입점(아래)** | ✅ (의도적 우회를 1급 API로) |
| 데몬 A2aTaskService | (미존재) | 정본 writer 자체 | ✅ (정의상) |

### teardown force-fail — 데몬 네이티브 진입점 (CL3, 결정: E10)

**v1의 결함**: v1 §③은 teardown을 "정본 writer 경유 + 합성 사유로 게이트 통과"로 처리했다. 실코드는 이를 무너뜨린다 — teardown은 **submitted/input-required 태스크도 강제-fail**하며(workspaceSlice.ts:212-215 non-terminal 전체 스윕), 주석이 우회를 명시 선언한다(:217-219 "Intentional teardown FORCE-fail: bypasses validateTransition (which forbids submitted/input-required → failed)"). `VALID_TRANSITIONS`(types.ts:655-657)는 `submitted→['working','canceled']`·`'input-required'→['working','canceled']`로 failed를 금지하므로, 합성 사유를 붙여도 **전이 자체가 거부**된다 — v1 설계대로면 teardown이 붕괴한다.

**수정 — force-fail을 1급 데몬 API로**:

```ts
// A2aTaskService (데몬) — envelope PR4의 per-task mutex(envelope :275) 위
/** 워크스페이스 제거 teardown 전용 강제-fail. validateTransition·evidence 게이트를
 *  둘 다 의도적으로 우회한다(수신자 소멸 = 어떤 non-terminal도 전진 불가).
 *  일반 전이 API로는 절대 도달 불가 — 데몬 내부/전용 RPC. */
failTasksForWorkspaceRemoved(workspaceId: string, reason: string): Promise<Array<{taskId, from, to}>>
```

- **대상**: `to.workspaceId === workspaceId`인 non-terminal 전체(현행 스윕 시맨틱 :213-215 보존).
- **각 태스크마다**: `withTaskLock(taskId)` 안에서 ① status=failed + 합성 evidence `{summary: reason, items: []}`(게이트 미경유 — failed 형태 계약과는 자연 정합) ② recordedBy = 시스템 principal(열린 질문 3) ③ `domain:'a2a'` envelope append — payload에 **`forced:'workspace_removed'` 감사 마커**(일반 전이와 로그에서 구별). 태스크당 1 append(envelope 1 RPC=1 envelope 계약 유지 — 스윕은 N개 독립 커밋, 코얼레싱(envelope §2.5)이 fsync를 배치).
- **호출 순서·락**: 렌더러 workspace 제거 → 데몬 RPC 1회(데몬이 per-task 락으로 스윕, 전역 락 없음) → 커밋 목록 반환 + a2a.task 이벤트(kind:'updated', state:'failed') → 캐시 verbatim 적용 → 렌더러 workspace 상태 제거 계속. 스윕과 경합한 늦은 전이는 terminal 거부(정상). **멱등**: 재호출은 terminal을 건너뛰므로 at-least-once 재시도 안전(데몬 일시 불달 시 재연결 후 재발사).
- 일반 전이 API(`transition`)는 submitted→failed를 **여전히 거부**한다 — force-fail은 teardown 전용 진입점이지 그래프 완화가 아니다.

### PR 시퀀싱 (CL2 — 재정 확정, 재론 없음)

v1의 PR-A→PR-B(게이트)→(C,D) 순서는 E7의 "1st-party가 게이트와 동시 컴플라이언트" 전제를 배반했다 — 게이트가 증거 생산(구 PR-D)보다 먼저 켜져, 그 창에서 ClaudeWorker·도그푸드의 모든 완료 전이가 전멸한다. **확정 순서**:

1. **PR-A — 검증기 코어**(순수 함수, 미배선)
2. **PR-D′ — 증거 생산 + 계약**(ClaudeWorker 정직 증거 + MCP evidence param + 브릿지/캐시 수용 배선. **게이트 없음** — additive-inert, envelope PR5 자세와 동형)
3. **PR-B — 게이트 활성**(A2aTaskService 배선 + T-gate-missing + force-fail 진입점. **수용 조건: 모든 1st-party 발신자 + MCP 계약이 선행 컴플라이언트** — PR-D′ 머지 + 도그푸드 호출자 인벤토리 통과를 명시 게이트로)
4. **PR-C — 관측성**

### PR4 슬립 리스크 + 컨틴전시 (신설)

**리스크**: Q1-4b 게이트의 유일 착지지 `A2aTaskService`는 envelope PR4 산출물이다 — 아직 존재하지 않는다. PR4(A2A 내구화 재배선, C12 포함)가 슬립하면 Q1 분기 게이트 ":446 완료증거 거부 테스트"가 착지 불가.

**컨틴전시 (발주자-트리거)**: **트리거 조건 = PR4가 Q1 내 미착지 전망 시**(판단은 발주자). 발동 시 게이트를 **a2aSlice.updateTaskStatus에 임시 착지** — a2aSlice.ts:178이 이미 validateTransition을 강제하는 **오늘의 단일 chokepoint**이고 4표면 전부 이를 통과하므로(위 표) 임시 착지로도 우회 0이 성립한다. 비용·이후: ① 게이트 이중 구현(렌더러→데몬 이관 시 제거) ② teardown은 현행 렌더러 우회(:217)를 그대로 유지(E10 진입점은 데몬 이관과 함께) ③ 캐시 verbatim 전환(C6)도 이관 시점으로 연기. 기본 경로는 데몬-only 단일 착지 — 컨틴전시는 스케줄 보험이지 병행 트랙이 아니다.

---

## ④ files 경로 새니타이즈 + wire 가드

### isSafeRelPath v1.1 (X7+G5 변종 반영)

```ts
// src/shared/completionEvidence.ts (PR-A)

/** files[] 경로 새니타이즈. 저장소-상대 경로만 허용, 파일시스템 접근 없는 순수 문자열
 *  판정(gjc team-runtime.ts:1527 동형). 정책: **디코드도 정규화도 하지 않는다** —
 *  입력을 리터럴 코드유닛으로 판정·저장하며, 소비자도 사용 전 URL-디코드·유니코드
 *  정규화를 해서는 안 된다(그 순간 이 가드의 판정이 무효가 된다 — 계약).
 *  '..'은 ASCII라 유니코드 정규화로 위장 불가; percent-encoded('%2e%2e%2f')는
 *  디코드 안 하므로 무해한 리터럴 세그먼트명이다. */
export function isSafeRelPath(p: unknown): boolean {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (Buffer.byteLength(p, 'utf8') > EVIDENCE_MAX_FILE_PATH_BYTES) return false;
  for (let i = 0; i < p.length; i++) {
    const c = p.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;   // C0 제어문자(null 포함)·DEL
  }
  if (p.includes(':')) return false;             // 한 규칙으로 일괄 거부: 드라이브 절대('C:\x'),
                                                 // drive-relative('C:foo'), NTFS ADS('a.txt:ads'),
                                                 // URL 스킴('file://...'). 이식 경로에 콜론은 불필요
                                                 // (Windows 파일명 원천 금지 문자)
  if (/^[/\\]/.test(p)) return false;            // POSIX 절대 '/x', UNC '\\host', NT 네임스페이스 '\\?\' 전부 선행 구분자
  const segs = p.split(/[/\\]/);                 // 양 OS 구분자 모두로 분할
  if (segs.some((s) => s === '..')) return false;
  return true;
}
```

X7+G5 변종 커버리지: drive-relative `C:foo` → 콜론 규칙 / `\\?\` NT 네임스페이스 → 선행 `\` 규칙 / `file://` 스킴 → 콜론 규칙 / percent-encoded traversal → 무디코드 정책(리터럴, 소비자 디코드 금지 계약) / 유니코드 정규화 → 무정규화 정책(`..`은 ASCII — 정규화로 생성 불가) / null·제어문자 → C0 규칙.

### wire 가드 — normalize 방식 (X6 강화, isTaskState :643 위협 모델 계승)

v1의 `Object.keys` own-키 검사만으로는 **상속 필드·비-plain object**(class 인스턴스, Proxy, 오염된 프로토타입 체인)가 통과했다. v1.1: **plain object만 허용 + `Object.hasOwn` 검사 + 통과 시 안전한 새 객체로 normalize해서 반환**(원본 객체를 절대 하류로 흘리지 않음 — 가드 이후 원본의 getter/프로토타입이 작동할 여지 제거).

```ts
// src/shared/completionEvidence.ts (PR-A)

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;  // JSON.parse 산물 + null-proto만
}

/** untrusted-wire 완료증거 가드+정규화. isTaskState(types.ts:643, LanLink C10)의 위협
 *  모델(hostile wire 값이 lookup 키·스토어 레코드가 되기 전 차단)을 계승·강화.
 *  실패 시 null(→ completion_evidence_malformed). 성공 시 **알려진 필드만 복사한
 *  새 객체** — 미지 키는 드롭되고(프로토타입 오염·밀수 필드 원천 차단),
 *  recordedBy/recordedAt도 여기서 드롭된다(서버 전용 스탬프 — §⑤). */
export function normalizeCompletionEvidenceWire(v: unknown): CompletionEvidence | null {
  if (!isPlainObject(v)) return null;
  if (!Object.hasOwn(v, 'summary') || typeof v.summary !== 'string') return null;

  const items: EvidenceItem[] = [];
  if (Object.hasOwn(v, 'items')) {
    if (!Array.isArray(v.items) || v.items.length > EVIDENCE_MAX_ITEMS) return null;
    for (const raw of v.items) {
      if (!isPlainObject(raw)) return null;
      if (raw.kind === 'command') {
        if (raw.status !== 'passed' && raw.status !== 'failed') return null;
        if (!Object.hasOwn(raw, 'command') || typeof raw.command !== 'string') return null;
        if (typeof raw.summary !== 'string') return null;
        items.push({ kind: 'command', status: raw.status, summary: raw.summary, command: raw.command,
                     ...(typeof raw.output === 'string' ? { output: raw.output } : {}) });
      } else if (raw.kind === 'inspection' || raw.kind === 'artifact') {
        if (raw.status !== 'verified' && raw.status !== 'unverified') return null;
        if (typeof raw.summary !== 'string') return null;
        items.push({ kind: raw.kind, status: raw.status, summary: raw.summary,
                     ...(typeof raw.location === 'string' ? { location: raw.location } : {}),
                     ...(typeof raw.output === 'string' ? { output: raw.output } : {}) });
      } else return null;
    }
  }
  let files: string[] | undefined;
  if (Object.hasOwn(v, 'files')) {
    if (!Array.isArray(v.files) || v.files.length > EVIDENCE_MAX_FILES) return null;
    if (v.files.some((f) => typeof f !== 'string')) return null;
    files = [...(v.files as string[])];
  }
  const out: CompletionEvidence = { summary: v.summary, items, ...(files ? { files } : {}) };
  return Buffer.byteLength(JSON.stringify(out), 'utf8') <= EVIDENCE_MAX_TOTAL_BYTES ? out : null;
}
```

- **권위 검증**: 정본 writer(`A2aTaskService.transition`)의 `validateCompletionEvidence`(§②) — wire 값을 신뢰하지 않고 재검증(envelope §7 서버핀 자세).
- **방어심층 wire normalize**: MCP/RPC 진입 경계(브릿지, 미래 데몬 RPC 디코드). null → `completion_evidence_malformed`.
- 캡(E12)은 양쪽 모두 강제 — wire에서 걸러도 권위 검증기가 독립 재확인(내부 생산 경로 방어).

---

## ⑤ 에러 모델 · 관측성

### 거부 사유 코드 (gjc 문자열 사유 동형 — 기계 파싱 안정 코드 + 사람용 힌트 분리)

| 코드 | 발생 | 전이 |
|---|---|---|
| `completion_evidence_missing` | evidence 부재 | completed |
| `completion_evidence_empty_summary` | summary 없음/공백 | completed |
| `completion_evidence_no_items` | items 부재/빈 배열 | completed |
| `completion_evidence_invalid_item` | 아이템 형태 불량(미지 kind/status, command 누락 등) | completed·**failed**(X8) |
| `completion_evidence_too_large` | 캡 초과(items/문자열/files/총량 — E12) | completed·failed |
| `completion_evidence_bad_file_path` | files 새니타이즈 실패 | completed·failed |
| `failure_reason_missing` | summary(사유) 없음 | failed |
| `completion_evidence_malformed` | wire normalize 실패(비plain/타입혼동/오염) | 진입 경계 |

v1의 `completion_evidence_no_verified_item`은 **전이 코드에서 은퇴**(§② E9) — verifiedItemCount=0 표기와 P2 게이트7 거부 사유로 이동. 반환 형태: `{ ok:false, code:'completion_evidence_no_items', error:'completed requires structured evidence: ≥1 well-formed item ...' }`.

### 거부가 호출자에게 돌아가는 경로 (표면별)

- **MCP**: RPC 에러 → 툴 결과 에러(`a2a.task.update: <code>: <hint>`). 에이전트가 코드를 읽고 evidence 붙여 재시도.
- **렌더러 브릿지**: `{ error: 'a2a.task.update: <code>: <hint>' }`(현행 :1804 동형). 전이 미적용(스토어 mutation 전 게이트).
- **ClaudeWorker**: PR-D′가 게이트보다 먼저 정직 증거를 상시 생산하므로 구조 거부는 자기모순(발생 불가) — 방어심층으로만: 데몬 거부 시 1회 재시도 후 `failed`(사유 `completion_evidence_producer_error`)로 **fail-visible**(working 고착 금지, ClaudeWorker.ts:168 catch 확장).
- **데몬**: 파이프 RPC 구조화 에러 → main이 호출자에 포워딩.

### MCP 계약 모순 해소 (CL4)

**문제**: evidence를 `z.optional()`로 추가하면 도구 스키마는 "선택"으로 광고하는데 런타임은 completed에서 필수 — introspect한 에이전트가 생략하고 거부당한다.

**해소**:
1. **zod는 optional 유지**(working/input-required/failed-사유-only에서 실제로 선택이므로 스키마상 필수화가 오히려 거짓), **description으로 계약 고정**: `a2a_task_update` description(mcp/index.ts:876)과 `evidence` param describe에 명시 — "`status:'completed'`는 evidence **필수**(summary + ≥1 아이템: command|inspection|artifact). `status:'failed'`는 evidence.summary(실패 사유) 필수. 거부는 `completion_evidence_*` 사유코드로 반환되며 evidence를 붙여 재시도하라. verified 아이템(command+passed / inspection·artifact+verified)이 0이면 완료는 수용되되 unverified 등급으로 표기된다."
2. **artifact와 evidence의 관계 (결정: 병존, 완료판정 무관)**: `artifact_name`/`artifact_data`(mcp/index.ts:883-884)는 **A2A-spec 산출물 채널**(deliverable payload — Google A2A 표준 표면)로 존치, evidence는 **wmux 완료계약 채널**(검증 주장 메타데이터 — wmux 확장). **게이트는 evidence만 판정한다** — artifact 유무는 완료판정에 관여하지 않는다. `kind:'artifact'` 증거 아이템이 산출물을 `location`으로 참조할 수 있으나 Q1 게이트는 참조를 해석하지 않는다(구조만 — 원자성은 E11이 담당). 대체(evidence가 artifact를 흡수)를 기각하는 이유: spec 표면에 게이트 시맨틱을 얹으면 외부 A2A 클라이언트가 모르는 계약이 spec 채널에 스며든다.
3. **기존 호출자 인벤토리**: 도그푸드 스크립트·스킬·내부 MCP 호출자 중 `a2a_task_update`로 completed/failed를 보내는 곳 전수 조사·갱신을 **PR-B 수용 테스트에 포함**(§⑧ — "1st-party 선행 컴플라이언트" 게이트의 실측).

### artifact 참조 증거의 원자성 (X3 — 결정: 같은-호출 단일 트랜잭션)

**문제**: 현행 artifact는 전이 **후** 별도 append(useRpcBridge.ts:1880-1885)라, `kind:'artifact'` 증거가 참조한 산출물의 저장 실패/누락을 게이트가 못 막는다(전이는 커밋됐는데 산출물은 없는 반쪽 상태).

**결정**: **같은 a2a.task.update 호출에 동반된 status+evidence+artifact는 `A2aTaskService.transition` 단일 트랜잭션으로 커밋** — 한 task-lock 임계구역, **1 RPC = 1 envelope**(전이 payload가 artifact를 동반 운반 — §① `A2aTransitionPayload.artifact`, envelope §2.6 업무 원자성 계승). 부분 적용(상태만 커밋, artifact 유실)이 구조적으로 불가능해진다. **cross-call 참조**(이전 호출로 올린 artifact를 location으로 지목)는 claim으로만 허용하고 게이트가 해석(resolve)하지 않는다 — 기저장-참조만 허용하는 대안은 MCP의 현행 자연 흐름(완료+artifact 동시 전송, mcp/index.ts:898-903)을 부수고 게이트를 stateful(산출물 스토어 조회)로 만들므로 기각.

### verifiedItemCount 배선 (C9+G7 — 생산자→방출자 경로 확정)

생산자는 데몬 게이트(§②), 방출자는 렌더러 단일 퍼널 — 프로세스 경계를 넘는 경로를 확정한다:

1. **데몬 → 호출자**: `A2aTaskService.transition` RPC **결과에 `verifiedItemCount` 포함**(`{ok:true, taskId, verifiedItemCount}`), envelope payload에도 스탬프(§①).
2. **렌더러 방출**: a2a.task 이벤트의 유일 방출자는 렌더러 단일 퍼널(`emitA2aTaskEvent` useRpcBridge.ts:354; "Single funnel — the ONLY a2a.task emitter" :346-349)이다. 브릿지가 데몬 전이 결과의 카운트를 `emitA2aTaskEvent` → `publishA2aTask`(publisher.ts:73)로 전달. **데몬 직접 방출은 기각** — 단일 퍼널 불변식 위반(이중 방출). Q1-4 데몬 이벤팅 재설계 시 퍼널 이동과 함께 재론 가능(그때도 "방출자 1곳" 불변식은 유지).
3. **스키마**: `A2aTaskEvent`(shared/events.ts:313)에 `verifiedItemCount?: number` additive(messagePreview :332 동급) + publish 신뢰 경계 allow-list(registerHandlers.ts)에 additive 등재(미등재 시 서버가 걸러냄 — events.ts:328 주석의 서버측 shape 강제 참조).
4. **조회**: evidence는 `TaskStatus.evidence`에 저장되므로 `a2a_task_query` 응답의 task 객체에 그대로 실린다 — 소비자는 카운트를 이벤트에서 받거나 evidence에서 직접 셀 수 있다.
5. **문서**: `wmux_events_poll`(mcp/index.ts:724) a2a.task 설명에 "completed/failed 전이는 `verifiedItemCount`(검증 아이템 수, 0=unverified 완료) 동반" 1문장 additive. FleetView는 `completed (unverified)` 뱃지 표시 가능(PR-C 선택).

---

## ⑥ 하위호환 + ClaudeWorker 증거 생산

### 유예 vs 즉시 거부 (결정: E7 — 즉시 거부, 유예 없음)

1. **계약의 가치가 거부 자체다.** "증거 없이 done 금지"(:418)는 P3 영수증("ACK 없이 delivered 금지")과 동형. 유예 창은 "증거 없는 완료"를 공문화한다.
2. **마이그레이션 부채 0.** A2A는 비내구(30분 GC, a2aSlice.ts:8) — 영속된 구 태스크·구 증거 포맷이 없다. 게이트는 신규 전이에만 적용.
3. **1st-party는 게이트보다 먼저 컴플라이언트**(CL2 순서가 이를 구조로 보장 — PR-D′가 PR-B 선행). 즉시 거부의 유일 피해자는 "증거 없이 done을 주장하는 발신자"뿐.
4. **폭발 반경 최소 시점.** 외부 레일(R4)은 Q2 — 지금 발신자는 ClaudeWorker + 소수 도그푸드뿐.

거부는 구조화 사유코드(§⑤)로 액션가능 — 이것이 유예보다 나은 마이그레이션 경로다.

### ClaudeWorker 증거 생산 — 정직 계층 + 검증 계층 (CL1 재설계 반영)

**질문(must-answer)**: 스폰된 Claude 세션의 무엇이 증거가 되나?

**실코드 가용 신호**(ClaudeWorker.ts): 파싱 중 = `system/init`→session_id(:132), `result`→`result` 텍스트·`is_error`·`total_cost_usd`(:134-137, is_error가 현행 completed/failed 분기 :141). 미파싱 = `assistant`/`user` 이벤트의 tool_use/tool_result(스트림에 존재하나 :130-149가 안 읽음).

**(A′) 정직 계층 — 항상 생산, 절대 세탁 안 함 (v1 (A) 대체)**. run 결과를 **unverified 자기보고**로 표기 — verified로 승격하지 않는다:

- `is_error:false` → completed:
  ```ts
  { summary: resultText.trim() || 'agent run completed (empty result text)',   // C7: 빈 result 자기거부 방지
    items: [{ kind: 'inspection', status: 'unverified',
              summary: 'claude CLI run exited success (self-reported; no independent verification)',
              location: 'claude -p (stream-json)',
              output: `session=${sessionId ?? '?'} cost=$${costUsd?.toFixed(4) ?? '?'}` }] }
  ```
  → 구조 게이트(≥1 well-formed) 통과, **verifiedItemCount=0** — "완료됐으나 미검증"을 정직 표기. P2 게이트7 세탁 불가(CL1 제약 ii). 기아 없음(제약 iii).
- `is_error:true` → failed: `{ summary: 'Error: ' + (resultText.trim() || 'agent run failed'), items: [{kind:'inspection', status:'unverified', summary:'claude CLI run reported error'}] }` — X8 형태 검증 통과.
- capacity/spawn-error/exit-code(:44,:106,:114) → failed, summary=현행 사유 문자열(비어있지 않음).

**(B) 검증 계층 — verified 등급의 유일한 1st-party 공급원 (스파이크 후, PR-D′ 후속)**. `result` 전의 `assistant`/`user` 이벤트에서 tool 하베스트:
- `Bash` tool_use + 비-에러 tool_result → `{kind:'command', status:'passed', command:<실제 실행 명령>, summary:<출력 첫줄>}` — **실행 사실을 우리 파서가 CLI 스트림에서 직접 관찰**한 아이템이라 (A′)의 자기보고보다 강하다(semi-trusted 실행자 위에서 우리가 관찰한 신호).
- `Write`/`Edit` 계열 tool_use → `files[]` 수집(새니타이즈 §④ 통과분만).
- 하베스트가 실검증 명령(npm test 등)을 잡으면 completed가 **verified 등급**(count≥1)으로 올라간다. 못 잡으면 (A′) 그대로 — unverified 완료로 정직하게 남는다. **하베스트 부재가 전이를 막지 않는다**(등급 모델의 요점).

> **미검증 표기**: stream-json의 tool_use/tool_result **정확한 필드 구조**는 본 저장소 코드로 확인 불가(ClaudeWorker가 result/is_error/session_id만 소비 :132-137). (B)는 1일 스파이크로 확정(열린 질문 1). (A′)는 이미 파싱하는 필드만 사용 — 즉시 거부의 전제는 (A′)만으로 성립.

**수용 잔여**: (A′)의 unverified 완료가 다수일 수 있다 — 그것이 정확히 의도다. "검증 없는 완료"의 존재를 숨기는 대신 등급으로 드러내고, 신뢰 결정(의존성 개방·사람 확인)은 소비자가 verified 등급 위에서 내린다. 강한 독립 검증(delivery/verification 워커 분리)은 P2 역할 게이트(§⑦)의 몫.

---

## ⑦ §6.M P2 방향 요약 + 비목표 재확인

### P2 (claim-lease 풀) — 방향 요약만 (상세 설계는 Q2 유보)

P2(로드맵 :419)는 "리더 게시 pending 풀 → 역할별 워커가 의존성 순서로 자가 claim". gjc 순서화 자격게이트(gjc-ref:30) 적응: `status(pending) → owner → assignee → required_role/allowed_roles → blocked_by → depends_on → lease`. lease는 데몬 소유 `withTaskLock` 원자(gjc O_EXCL 댄스 불요, gjc-ref:69), 회수는 TTL 만료 OR 실라이브니스 소멸 중 먼저(gjc-ref:106). **펜싱 토큰(§6.F) ≠ lease** — 다른 축, 한 토큰 금지(로드맵 :422; envelope의 causalRefs/depends_on 분리 :94와 동형 원리).

### P1 등급이 P2 게이트7의 술어다 (E9 이후 — load-bearing 확인)

게이트7은 dep가 "completed 상태"가 아니라 "**증거검증된** completed"여야 통과(gjc-ref:39,45; 로드맵 :422). E9 재설계 후 이 연결이 더 정확해진다: **전이 게이트는 verified를 보장하지 않으므로, 게이트7의 술어는 `verifiedItemCount ≥ 1`을 직접 소비**한다 — P1이 산출·영속한 등급(TaskStatus.evidence + envelope payload)이 P2의 신뢰 입력. unverified 완료(count 0)는 의존성을 열지 못한다(거부 사유 `task_dependency_unverified` 계열, Q2 명명). run-success 세탁이 불가능하므로(CL1) 이 술어는 오염되지 않는다. depends_on은 payload 레벨 additive(P1이 슬롯을 점유하지 않음 — envelope :94).

### 비목표 재천명 (로드맵 :421)

- **워크플로 게이트 런타임 안 함.** gjc `interview→plan→goal` 강제는 호스팅된 에이전트의 몫 — wmux는 중립 기판(§3.1).
- **task-pool(P1~P3)은 조정 계약이지 워크플로 강제가 아니다.** 완료증거는 결과의 **정직성**(구조+등급 표기)을 강제할 뿐 작업 **방법**을 강제하지 않는다 — E9 등급 모델은 이 경계를 오히려 강화한다(게이트가 "어떻게 검증하라"까지 명령하지 않고, 검증 여부를 정직하게 드러내게만 한다). 기판 정체성의 방어선(로드맵 §9 CL4).

---

## ⑧ 테스트 계획 + 구현 좌표 + PR 분할

### 파일별 변경 목록 (file:line)

**신설**:
- `src/shared/completionEvidence.ts` — `validateCompletionEvidence`·`isVerifiedItem`·`isSafeRelPath`·`normalizeCompletionEvidenceWire`·캡 상수(E12). 순수 함수. (타입은 PR5 소유 — X9)

**수정 (스키마 — envelope PR5 소유분)**:
- `src/shared/types.ts` — `EvidenceItem`(union)·`CompletionEvidence` additive(:603 이후), `TaskStatus`(:647) `evidence?`. 기존 불변.
- `src/shared/eventlog.ts` — `A2aTransitionPayload`(evidence/verifiedItemCount/artifact/forced — §①).
- `src/shared/events.ts` — `A2aTaskEvent`(:313) `verifiedItemCount?` additive.

**수정 (Q1-4b 소유분)**:
- `src/daemon/a2a/A2aTaskService.ts`(PR4 신설) — `transition` 게이트 + recordedBy/At 스탬프 + verifiedItemCount 산출·RPC 결과 반환 + **같은-호출 artifact 단일 트랜잭션(E11)** + **`failTasksForWorkspaceRemoved`(E10)**.
- `src/main/a2a/ClaudeWorker.ts` — (A′) 정직 증거 빌더(:134-149 processLine, :155 updateTaskStatus 시그니처) + C7 기본 summary + fail-visible(:168) + (B) 스파이크 후.
- `src/mcp/index.ts` — `a2a_task_update`(:874) evidence param + CL4 계약 description; `wmux_events_poll`(:724) 1문장.
- `src/renderer/hooks/useRpcBridge.ts` — `a2a.task.update`(:1754) evidence normalize·전달; :1803 데몬 RPC 전환(Q1-4); 퍼널(:354)에 verifiedItemCount 전달; artifact 별도 append(:1880-1885)를 같은-호출 트랜잭션으로 이관(E11).
- `src/renderer/stores/slices/a2aSlice.ts` — 캐시 verbatim 적용 메서드 신설(C6, 검증 없음); `updateTaskStatus`(:153)는 정본 이관과 함께 writer 은퇴(컨틴전시 시 유지).
- `src/renderer/stores/slices/workspaceSlice.ts` — teardown(:212-238)을 데몬 `failTasksForWorkspaceRemoved` RPC 경유로(E10); 직접 mutate·publishA2aTask(:264) 제거(캐시 verbatim+퍼널로 대체).
- `src/renderer/events/publisher.ts` — `publishA2aTask`(:73) verifiedItemCount param.
- `registerHandlers.ts`(publish 신뢰 경계) — allow-list에 verifiedItemCount additive.

### 테스트 케이스 목록

**수용 기준(:446) — 필수**:
- **T-gate-missing**: evidence 없이 completed → `completion_evidence_missing` 거부.

**게이트 불변식 (E9 반영)**:
- completed + ≥1 well-formed(verified 포함) → 통과, verifiedItemCount=N.
- **completed + well-formed이나 verified 0(예: inspection/unverified만) → 통과 + verifiedItemCount=0 정직 표기(이벤트·payload)** ← v1의 "거부" 케이스를 대체.
- completed + 빈 summary/빈 items/command 아이템에 command 누락/미지 kind·status → 각 사유코드 거부.
- **failed 비대칭+X8**: failed + 사유만(items 없음) → 통과. failed + malformed 아이템 → `completion_evidence_invalid_item` 거부(감사 로그 잔류 차단). failed + summary 없음 → `failure_reason_missing`.
- 캡(E12): items 65개/문자열 4KiB+1/files 257개/총량 64KiB+1 → `completion_evidence_too_large` (권위·wire 양쪽).
- 터미널 무부활: completed→working 거부(VALID_TRANSITIONS :658 불변).

**세탁 불가(CL1 제약 ii)**:
- ClaudeWorker (A′) 증거 → verifiedItemCount=0 어서션(inspection/unverified가 verified로 세지지 않음). (B) Bash passed 하베스트 → count≥1(스파이크 후).

**새니타이즈(§④ X7+G5)**:
- 절대(`/etc/x`·`C:\x`·`\\host\x`·`\\?\C:\x`) / drive-relative `C:foo` / ADS `a.txt:s` / `file://x` / `..` / `%2e%2e%2f`(리터럴로 **통과** — 무디코드 정책 어서션) / null·C0 / 과길이 → 각 판정. `src/a.ts`·`docs/멀티바이트.md` → 통과.

**wire 가드(X6)**:
- class 인스턴스/Proxy/프로토타입 상속 필드 → null. `__proto__` own-키 → null. 통과 산출물이 **새 객체**이고 미지 키·recordedBy가 드롭됨 어서션.

**teardown(CL3)**:
- **submitted→failed·input-required→failed·working→failed 3종 전부 force-fail 성공**(forced:'workspace_removed' 마커 + 합성 사유) — working만으론 불충분.
- 일반 transition API로 submitted→failed는 여전히 거부(force-fail이 그래프를 완화하지 않음).
- force-fail 재호출 멱등(terminal 스킵). 캐시가 force-fail 커밋을 verbatim 적용(재검증 없음 — C6).

**원자성(E11)**:
- status+evidence+artifact 동반 호출 → 단일 envelope 커밋, append 실패 시 셋 다 미적용(부분 적용 없음).

**4표면 + 인벤토리(CL4)**:
- MCP evidence 없이 completed → 사유코드 에러 → evidence 재시도 통과 / 브릿지 normalize 경유 / ClaudeWorker (A′) 통과 + fail-visible / 데몬 정본 게이트(envelope :461 T-A2A 위 활성). **기존 도그푸드·스킬 호출자 인벤토리 전수 갱신 확인**(PR-B 수용 조건).

**관측성(C9)**:
- 데몬 transition 결과의 verifiedItemCount → 단일 퍼널 → a2a.task 이벤트 도달 + allow-list 통과. a2a_task_query 응답에 evidence 실림.

### PR 단계 분할 (CL2 확정 순서 — 버전 불변, 각 PR 독립 그린)

전제: envelope **PR4**(A2aTaskService·C12 재배선) + **PR5**(타입·payload 스키마 — X9 소유 경계).

1. **PR-A — 검증기 코어**: `completionEvidence.ts` + 단위테스트(게이트 불변식·세탁 불가·새니타이즈·wire·캡). 미배선. **그린.**
2. **PR-D′ — 증거 생산 + 계약 (게이트 앞)**: ClaudeWorker (A′) 정직 증거 + C7 + MCP evidence param·CL4 description + 브릿지 normalize·전달 배선. **게이트 없음**(additive-inert). (B)는 스파이크 후 후속 커밋. **그린.**
3. **PR-B — 게이트 활성**: `A2aTaskService.transition` 게이트 + E11 트랜잭션 + E10 force-fail + teardown 재배선 + 캐시 verbatim(C6). **T-gate-missing 여기.** **수용 조건: PR-D′ 머지 + 1st-party/도그푸드 호출자 인벤토리 컴플라이언트 확인.** **그린.**
4. **PR-C — 관측성**: A2aTaskEvent·publishA2aTask·allow-list·wmux_events_poll 문서 + FleetView unverified 뱃지(선택). **그린.**

**PR4 슬립 컨틴전시**는 §③(발주자-트리거, a2aSlice.ts:178 임시 착지). `src/shared`/PROTOCOL 변경은 오케스트레이터 리뷰 필수(로드맵 §5, additive-only).

---

## 함정 종합 (footgun)

1. **evidence를 message에 태우면 게이트 원자성 붕괴**(E1) — message는 전이 후 append(useRpcBridge.ts:1833). → 별도 1급 입력.
2. **failed에 verified 요구는 비논리, 그러나 형태 검증 생략도 결함**(E3+X8) — malformed 진단 아이템이 감사 로그에 영구 잔류. → 형태 검증은 공통, verified만 등급 축.
3. **run-success의 verified 승격 = 세탁**(CL1/E9) — P2 게이트7 하류 오염. → unverified 자기보고로 정직 표기, verified는 하베스트(실관찰)만.
4. **게이트를 증거 생산보다 먼저 켜면 1st-party 전멸**(CL2/E5) — PR-D′가 PR-B 선행, PR-B 수용 조건에 명문화.
5. **teardown을 일반 전이로 보내면 teardown이 붕괴**(CL3/E10) — validateTransition이 submitted/input-required→failed를 금지(types.ts:655-657; 실코드 우회 선언 workspaceSlice.ts:217-219). → 데몬 네이티브 force-fail 진입점 + forced 감사 마커.
6. **캐시가 재검증하면 force-fail 커밋을 거부해 split-brain**(C6) — 캐시는 verbatim 적용, 검증은 정본 writer 전용.
7. **artifact 별도 append는 부분 적용 창**(X3/E11) — 같은-호출은 단일 트랜잭션(1 RPC=1 envelope).
8. **recordedBy 클라 위조** — wire normalize가 드롭 + 서버가 authContext로 스탬프(envelope §7 동형).
9. **경로 변종**(X7+G5) — drive-relative·ADS·스킴은 콜론 일괄 거부, NT 네임스페이스는 선행 구분자, percent-encoding·유니코드는 무디코드·무정규화 리터럴 계약(소비자 디코드 금지).
10. **캡 없는 증거는 append-only 로그 증폭 폭탄**(C3/E12) — 상수+코드 강제, 양쪽(권위·wire).
11. **빈 resultText → 빈 summary 자기거부**(C7) — 비어있지 않은 기본값.

---

## 로드맵 정정 제안

- **R1 — 계약 의미 변경 (발주자 승인 필요)**: §6.M P1 :418 "`completed`/`failed` 전이에 ... `items[]` 중 ≥1이 검증됨"을 다음으로 개정 제안 — "**completed 전이: 구조화 증거 필수(summary + ≥1 well-formed 아이템). `failed` 전이: summary(실패 사유) 필수, 제공된 아이템의 형태 검증은 동일 적용. ≥1 검증됨(verified)은 전이 게이트가 아니라 completed의 검증 등급으로 산출·표기되며, §6.M P2 게이트7이 의존성 통과 술어로 소비한다.**" 이는 typo 정정이 아니라 **게이트 술어의 의미 변경**이다(§② CL1 논증: verified≥1 전이 게이트는 1st-party 세탁 또는 정당한 완료의 기아를 강제한다) — 승인 전 구현 착수 금지.
- **R2 — 표기 정정 (typo 계열, envelope :494 재확인)**: :418 `done` → `completed`(TaskState 정본 types.ts:624).
- **R3 — 확인 (정정 아님)**: 완료증거는 `domain:'a2a'` 전이 payload에 붙고 `'task'` 슬롯은 Q2 예약(envelope :493 확정본 준수).

---

## 열린 질문 (3)

1. **(B) 하베스트 스키마 스파이크**: stream-json tool_use/tool_result 필드 구조 미검증(ClaudeWorker는 result/is_error/session_id만 소비 :132-137). E9 이후 하베스트는 **verified 등급의 유일한 1st-party 공급원**이라 중요도가 올랐다 — PR-D′의 (A′) 그린 후 1일 스파이크로 확정. 스파이크 실패 시에도 (A′)만으로 계약은 성립(unverified 등급).
2. **P2 게이트7의 verified 술어 강화 여부**: `verifiedItemCount≥1`로 충분한가, 아니면 **실행자 자신이 아닌 principal이 기록한**(recordedBy 상이 — 독립 검증) verified 아이템을 요구하나. 자기검증 세탁의 다음 층위 — Q2 P2 설계에서 trustTier(envelope §7)와 함께 확정. P1 스키마는 recordedBy를 이미 영속하므로 어느 쪽도 배제하지 않는다.
3. **데몬-발신 전이의 시스템 authContext**: force-fail(E10)의 recordedBy는 호출자가 아니라 데몬 자신인데, envelope §7 스탬핑 규약은 호출자-유래(서버핀 verifiedWorkspaceId)만 정의한다. 시스템 principal 표기(예: `daemon:teardown`)와 trustTier 배정을 Q1-4(§6.F 실행자 화해와 같은 경계)에서 동시 확정.

---

## 리뷰 로그

### 1라운드 — 3모델 패널 (2026-07-06)

3모델 패널(Claude + Codex + GLM 5.2, 각 fresh context) plan 모드 리뷰. 합의 분포: **3-MODEL 4 · 2-MODEL 2 · SOLO 8 · 기각 2** — 반영 14건.

| # | 합의 | 발견 요지 | 반영 위치 |
|---|---|---|---|
| CL1 | 3-MODEL conf10 | run-success 폴백(exit0→command+passed)이 게이트를 "exit 0=done"으로 약화 + P2 게이트7의 verified 신뢰를 세탁 오염 | E9, §②(방향 (a) 채택 논증), §⑥ (A′) 정직 계층, §⑦ 게이트7 술어, R1 |
| CL2 | 3-MODEL conf10 (재정 확정) | PR-B(게이트)가 PR-D(증거 생산)보다 선행 — E7 전제 자기모순, 1st-party 완료 전멸 창 | E5, §③ 시퀀싱(A→D′→B→C)+PR4 슬립 리스크·컨틴전시, §⑧ |
| CL3 | 3-MODEL conf10 | teardown은 submitted/input-required도 강제-fail(workspaceSlice.ts:212-238, 우회 명시 :217-219)인데 VALID_TRANSITIONS(types.ts:655-657)가 그 전이를 금지 — v1 "합성 사유로 게이트 통과"는 teardown 붕괴 | E10, §③ force-fail 진입점·호출 순서·락, C6 캐시 verbatim(E4), §⑧ 3종 테스트 |
| CL4 | 3-MODEL conf10 | zod optional 광고 vs 런타임 필수 모순 — introspect 에이전트가 생략·거부당함; artifact 채널과의 관계 미정의 | §⑤ CL4 절(description 계약·병존 결정·인벤토리), §⑧ PR-B 수용 조건 |
| X6 | SOLO(Codex) conf8 | Object.keys own-키만으론 상속 필드·비plain object 통과 | §④ isPlainObject+hasOwn+normalize(새 객체 반환) |
| X8 | SOLO(Codex) conf8 | failed가 형태 검증 전 return — malformed 진단 아이템 감사 로그 잔류 | §② 공통 형태 검증(verified만 면제), 사유코드 표, 테스트 |
| X3 | SOLO(Codex) conf8 | artifact 전이-후 별도 append — kind:'artifact' 증거 참조 산출물의 부분 적용 창 | E11, §⑤(같은-호출 단일 트랜잭션 결정), §① payload.artifact |
| C3 | SOLO(Claude) conf6 | DoS 캡이 주석에만 존재, 어느 검증기도 미강제 — append-only 로그 증폭 | E12, §② withinCaps+상수, §④ wire 캡, 테스트 |
| C7 | SOLO(Claude) | 빈 resultText → summary '' 자기거부 | §⑥ (A′) 기본값, footgun 11 |
| X7+G5 | 2-MODEL conf8 | isSafeRelPath 변종(drive-relative·percent-encoding·`\\?\`·`file://`·유니코드 정규화) | E6, §④ 콜론 일괄 거부+무디코드·무정규화 계약, 테스트 |
| X9 | SOLO(Codex) | CompletionEvidence 타입 소유권이 PR5/PR-A 중복 기술 | §① 소유권 절(PR5=타입+payload, PR-A=검증기+테스트) |
| G6 | SOLO(GLM) | EvidenceItem을 discriminated union으로(닫힌 status enum) | §① union 스키마, §② isWellFormedItem 강화 |
| C9+G7 | 2-MODEL | verifiedItemCount 생산자(데몬)→방출자(렌더러) 프로세스 경계 배선 미명세 | E8, §⑤(RPC 결과 경유 단일 퍼널 확정 + query 조회 1줄) |
| C8 | SOLO(Claude) | R1을 typo 정정처럼 표기 — 계약 의미 변경(승인 필요)과 성격 구분 안 됨 | 정정 제안 절(R1=의미 변경·승인 필요 / R2=typo 분리) |

### 기각 (2건 — 사유)

- **G8 "ClaudeWorker evidence 빌드-전이 race"**: 사변적 — `processLine`(:122-150)은 라인 단위 동기 처리라 증거 빌드→`updateTaskStatus` 전달이 같은 동기 구간에서 완결된다. 세션 상태(session_id·cost)도 그 시점에 이미 확정. race 표면이 없다.
- **G10 "domain 공통 게이트 일반화"(channel/approval 등 타 도메인 증거 게이트)**: Q2 재론 — §⑦ 비목표 경계 유지. P1은 `domain:'a2a'` 전이 한정(스코프 규율, envelope :493). 일반화는 소비자가 실재할 때(과조기 추상화 금지).

---

## 산출물 경로

`plans/completion-evidence-design-2026-07-06.md` (이 문서)
