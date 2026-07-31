# J0 — Task 정본 준비: 얇은 스키마 + 미션 채널 최소 + §6.M 소유권 계약 (2026-07-09)

- 상태: **v1.1 — 3모델 플랜 리뷰 반영판**(Codex 9·Claude 6 실코드 검증·GLM 9 — §8 리뷰 로그). v1 대비: authz 실코드 정정·고아 채널 reconcile 재설계·히스토리 보존 주장 정직화·wire 계약(화이트리스트·멱등키·신원 스탬프) 명문화·부트 순서 고정·구현 표면 완결.
- 계약: `plans/strategy-reset-2026-07-09.md` §4 NB1 J0 · `plans/roadmap-12mo-world-no1-2026-07-05.md` §6.J(모델)·§6.L(envelope)·§6.M(lease)·Q1-5(R3)
- 목적: J1(fan-out)·J2(diff)가 딛고 설 **Task 정본**을 envelope 로그 위 projection으로 세우고, R3 미션 채널 블로커(실측 0건)를 최소 구현으로 해소하며, §6.M claim-lease와의 소유권 충돌(로드맵 리뷰 P9)을 계약으로 고정한다.
- 비목표: fan-out UI·worktree 스폰(J1) / diff 뷰(J2) / claim-lease 구현(§6.M P2, Q2) / FleetView 미션 뷰(파동 2 IA와 동기) / 채널 스키마 변경
- **성공기준(관측 가능 — 리뷰 반영)**: E2E 왕복 테스트 그린 — `mission.start → 채널 post → mission.close → 데몬 재시작 → projection 복원(closed)·archive 멱등 재시도 no-op`. 이것이 "R3 블로커 해소"의 판정식이다.

---

## 1. 결정 D1 — 도메인 분리: `WorkTask`는 `domain:'task'`, A2A Task를 오버로드하지 않는다

기존 `Task`(shared/types.ts:750)는 A2A 프로토콜 태스크다(history/artifacts/VALID_TRANSITIONS — 에이전트 간 작업 위임 단위). §6.J의 태스크는 **worktree 미션 단위**(branch·worktreePath·paneGroupId·missionChannelId)로 계약이 다르다. 억지 통합은 두 수명주기(A2A 30분 GC vs 미션 며칠 생존)와 두 전이 그래프를 한 스키마에 우겨넣는다.

- 신설 타입 `WorkTask`(이름 충돌 회피 — `Task`는 A2A 점유), envelope `domain:'task'`(shared/eventlog.ts:31에 **이미 예약된 슬롯** — 활성화지 발명이 아님).
- 정본 = 데몬 append-only 로그. 신설 `WorkTaskService`는 `A2aTaskService`(daemon/a2a)의 검증된 패턴을 따른다: **projection-first**(append→true 후에만 apply), per-task 뮤텍스, `(op, idempotencyKey)` LRU 멱등, 부트 replay.
- **부트 순서 고정(리뷰 반영 — Codex)**: `replay → reconcile(§3) → projection GC`. GC가 reconcile보다 먼저 돌면 "closed 태스크 + active 채널" 복구 대상이 projection에서 사라진다. ~~추가 안전핀: archive 미확인 closed 태스크는 GC 면제~~ **(코드 리뷰 2라운드 R3'에서 대체)**: 면제는 두지 않는다 — 매 부트 replay가 로그에서 전 태스크를 복원한 뒤 reconcile이 archive를 재시도하므로 GC가 복구 경로를 끊지 못하고, 반대로 active-채널 면제는 owner-leave 수용 잔여(§3)에서 closed 태스크를 projection에 영구 잔류시켜 뷰 바운드가 무산된다.
- **closed projection GC 정책(리뷰 반영 — GLM)**: closedAt + 7일 후 projection 퇴출(상수 `WORKTASK_CLOSED_GC_MS`). 로그 절단이 아니라 인메모리 뷰 바운드다(§6.L 컴팩션 몫 불변).
- **로그 전용(레거시 이중 경로 없음)**: envelope PR1~5 머지로 로그 모드가 정상 상태고, 신규 도메인이라 마이그레이션할 레거시 데이터가 없다. 로그 미가용 시 미션 RPC는 명시 에러(fail-closed).

## 2. 결정 D2 — J0 스키마 (얇게, additive 확장 전제)

```ts
// shared — additive-only 규약은 eventlog.ts PROTOCOL 헤더와 동일 적용
interface WorkTaskRef { principalId: string; verifiedWorkspaceId: string } // 데몬 스탬프(§6.L authContext와 동형)
interface WorkTask {
  id: string;                 // 'wtask-' + UUID — mission.start 진입 시 서버가 선발급(§3 topic 선각인에 필요)
  title: string;              // 사람이 읽는 미션 한 줄 (캡: 채널 topic 캡 상수 재사용)
  status: 'open' | 'closed';  // J0 전이 그래프는 open→closed 단 하나
  missionChannelId: string;   // R3 바인딩 — 채널 쪽이 아니라 태스크 쪽이 링크를 소유
  createdAt: number; closedAt?: number;
  createdBy: WorkTaskRef;     // 감사 메타(불변)
  owner: WorkTaskRef;         // authz 앵커 — J0 born-owned: 생성 시 서버가 createdBy로 강제 투입(리뷰 반영 — Codex: owner 필수화로 close 주체 단일화)
  // ── J1+ 물질화 필드 (J0에선 스키마만, 항상 옵셔널) ──
  branch?: string; worktreePath?: string; paneGroupId?: string;
  // ── J2 ──
  prUrl?: string;
  // ── §6.M 예약 (P2에서 활성화, J0 미구현 — §5 계약 참조) ──
  lease?: { expiresAt: number; claimantRef: string };
}
```

- **전이 그래프 최소주의**: J0은 `open → closed` 하나. §6.M P2의 pending/claimed는 **상태 추가가 아니라 owner의 의미 확장**이다 — J0 태스크는 전부 born-owned(owner 항상 존재), P2 풀 태스크만 owner 부재로 태어난다(pending = open ∧ owner 부재). 이 해석을 지금 계약으로 박아 P2가 스키마를 fork하지 못하게 한다.
- **payload union 3종(리뷰 반영 — Codex: J1 갱신 경로 선예약)**: `task.create`(서버 구성 WorkTask 시드) · `task.close`(id·closedAt·`evidence?` 예약 슬롯) · **`task.update`(id + J1+ 필드 패치 — J0에선 union에 타입만 예약, 핸들러는 J1 몫)**. 로그 계층은 미해석(§6.L 경계 준수).
- **wire 입력 화이트리스트(리뷰 반영 — 2-MODEL 자가모순 해소)**: mission.start의 caller 입력은 `{title, invite?, idempotencyKey?}` **만**. id·createdBy·owner·lease·상태는 전부 서버가 구성한다 — caller가 WorkTask 형태를 통째로 보내는 wire는 존재하지 않는다. lease·owner 직접 쓰기는 P2 활성화 후에도 wire에서 거부(D5.3과 정합).
- 불변식(서버 강제): **동일 worktreePath에 open WorkTask 최대 1개**. 비교 전 정규화 필수(리뷰 반영 — Codex): `realpath` 해석·플랫폼 대소문자 정책·trailing slash 제거 후 canonical 경로로 비교. 검사 직렬화는 per-task 뮤텍스가 아니라 **서비스 전역 write 뮤텍스**(리뷰 반영 — GLM: 서로 다른 태스크의 동시 create는 per-task 락으로 미보호). **J0 실효 명시(리뷰 반영 — Claude)**: J0에선 worktreePath가 항상 미설정이라 이 불변식은 계약 선언 + 정규화 유틸까지만이고, 활성 테스트는 J1 몫.
- DoS 캡: 워크스페이스당 open 태스크 상한(채널 상수 재사용 관례). 초과 시 명시 에러.

## 3. 결정 D3 — R3 미션 채널 최소: 채널은 그대로, 바인딩은 태스크가 소유

**채널 스키마 무변경.** 미션 채널은 kind 필드가 붙은 특수 채널이 아니라 **WorkTask가 missionChannelId로 가리키는 평범한 private 채널**이다. 단 하나의 마킹: **채널 `topic`에 `wmux:mission:{taskId}` 선각인**(topic은 기존 필드 — 스키마 변경 아님). 이것이 고아 reconcile의 앵커다(아래).

### 수명주기

- **`mission.start`** (데몬 RPC → WorkTaskService.create):
  0. taskId 서버 선발급(UUID).
  1. `ChannelService.create`(name: `mission-{slug}-{shortId}`, topic: `wmux:mission:{taskId}`, visibility: `private`, members: 생성자 + 선택 초대 목록) — 채널 상수(이름 캡·멤버 캡) 그대로 적용, 충돌은 shortId가 흡수.
  2. `task.create` envelope append(missionChannelId 포함) → projection 시드.
  - **실패 보상(리뷰 반영 — 3-MODEL)**: 2가 크래시 아닌 실패(append false)로 끝나면 **즉시 보상 archive**(1에서 만든 채널). empty-channel reaper는 고아를 못 줍는다 — 생성자가 멤버로 잔류해 memberCount>0이므로(ChannelStateWriter reaper는 memberCount==0 && TTL 조건). reaper 의존은 v1의 오류였다.
  - **크래시 창(1↔2 사이 프로세스 사망)**: 부트 reconcile이 줍는다 — **채널 방향 reconcile**: topic이 `wmux:mission:{taskId}` 패턴인데 해당 taskId가 projection에 없는 채널 → 고아 판정 → archive. 순서는 여전히 채널 먼저(역순이면 채널 없는 태스크가 생겨 J1이 딛을 바닥이 꺼진다).
- **`mission.close`** (데몬 RPC → WorkTaskService.close):
  1. `task.close` envelope append → projection 적용(status: closed).
  2. `ChannelService.archive` **서버 내부 호출** — 아카이브지 삭제가 아니다: 이후 post는 `CHANNEL_ARCHIVED`.
  - 1↔2 사이 크래시 = closed 태스크 + active 채널 → **태스크 방향 reconcile**: replay 후 closed인데 채널이 active면 archive 재시도(멱등 — 이미 archived/부재면 no-op).
  - 재close(리뷰 반영 — GLM): 이미 closed면 **멱등 no-op ack**(에러 아님).

### 히스토리 보존 — 정직한 계약 (v1 주장 철회, 리뷰 반영 — Claude 실코드)

v1의 "아카이브로 히스토리 영구 보존(KTD-G·P7)"은 **과대 주장이었다**: reaper는 status 무관하게 `memberCount==0 && TTL`이면 archived 채널도 메시지째 projection에서 prune한다(ChannelStateWriter.ts:428-441). 정정된 계약:

- **감사 정본은 append-only 로그다**(`domain:'channel'` envelope — 로그 절단은 §6.L 컴팩션 몫). projection prune은 뷰 정리지 정본 소실이 아니다.
- 아카이브된 미션 채널의 **projection 히스토리는 멤버 잔류 조건부** — 전원 leave + TTL이면 기존 채널 정책 그대로 prune된다. 미션 감사가 UI에서 상시 필요해지는 시점(J2 diff 코멘트 앵커)에 로그 기반 미션 아카이브 브라우저로 해소(로드맵 Q4-3과 정합) — reaper 예외 신설(채널 코드 변경)은 하지 않는다.

### authz — "humans-only archive" 원칙과의 정합 (핵심 판단, 실코드 정정판)

**실코드 정정(리뷰 반영 — Claude)**: `ChannelService.archive`의 게이트는 createdBy 앵커가 아니라 **"현재 멤버 OR CEO"**(ChannelService.ts:859-863 — createdBy는 감사 메타일 뿐 authz 입력이 아님, kick 미러). 이를 전제로 재구성:

- **mission.close의 authz는 WorkTaskService가 건다**: 서버 핀 `verifiedWorkspaceId == task.owner.verifiedWorkspaceId` OR CEO(`ceoWorkspaceId` 동일 메커니즘 — GLM 지적 반영해 실체 인용). 채널 게이트가 아니라 **태스크 게이트가 1차 방어선**이다.
- 게이트 통과 후 archive는 **데몬 내부 경로**로 호출(caller 신원이 아니라 task.owner 신원으로) — owner는 채널 생성 시 멤버로 들어가므로 멤버 게이트를 통과한다.
- **수용 잔여(명시)**: owner가 미션 채널을 leave한 뒤 close하면 내부 archive가 `NOT_AUTHORIZED`로 실패할 수 있다 — close 자체는 성립(로그 커밋됨), 채널은 active 잔존 → 전원 leave 시 reaper 몫. 이 창은 "자기 미션 채널에서 나가버린 소유자"라는 자해 시나리오라 코드로 막지 않고 계약으로 기록한다.
- humans-only 원칙 유지 논거(불변): ① 블래스트 반경 = 자기 미션 채널 1개 ② `a2a.channel.*` 라우터에 범용 archive 여전히 미등록 ③ 미션 채널은 태생이 태스크 스코프라 프로그램적 수명주기가 계약 그 자체.

### 외부 변이 내성 — 양방향 불변식 (리뷰 반영 — Codex+GLM)

미션 채널은 평범한 채널이므로 기존 leave/invite/(renderer)archive가 태스크와 무관하게 상태를 바꿀 수 있다. 계약: **바인딩은 단방향 참조이고, close는 채널 상태에 무조건 내성**이다 —

- 외부 invite/leave: 무해(멤버십은 채널 소관, 태스크 불변).
- 사람이 렌더러에서 미션 채널을 먼저 archive: open 태스크는 유효 유지, 이후 close의 archive 단계는 no-op(이미 archived).
- 채널이 reaper로 소실: close의 archive 단계는 `CHANNEL_NOT_FOUND`를 no-op으로 삼킨다(에러 아님). 태스크 무결성은 채널 실존에 의존하지 않는다.

### 신원 스탬프 경로 (리뷰 반영 — Codex+GLM)

`task.mission.*` RPC는 기존 `a2a.channel.*` 변이 RPC와 **동일 규율**을 탄다: 트랜스포트 계층이 `senderPtyId`에서 `verifiedWorkspaceId`를 서버측 해석(caller 자칭 workspaceId는 절대 신뢰 안 함 — CreateChannelParams D5 주석과 동형), 해석 불가 세션은 **start부터 fail-closed 거부**. envelope authContext는 이 스탬프로 데몬이 구성한다.

### MCP 표면 (Q1-5 문면 이행)

- `channel_mission_start(title, invite?, idempotency_key?)` → mission.start. 반환: `{taskId, channelId}`. **멱등(리뷰 반영 — Codex)**: 같은 키 재시도는 append 없이 저장된 `{taskId, channelId}` 재반환 — 응답 유실 재시도가 중복 채널+중복 태스크를 못 만든다.
- `channel_mission_close(task_id, idempotency_key?)` → mission.close (위 authz, 재close no-op).
- `channel_list`·`channel_read` 등 기존 도구는 미션 채널을 평범한 채널로 그대로 소비(무변경).
- 미션 목록 조회는 J0에선 파이프 RPC(`task.mission.list`)만 — MCP 노출은 J1에서 fan-out과 함께 판단(도구 표면 최소주의).

## 4. 결정 D4 — 구현 표면·W1 위임 범위 (리뷰 반영 — Codex: 배선 전량 명시)

| 계층 | 신설/변경 | 내용 |
|---|---|---|
| shared | 신설 | `WorkTask`·payload union 3종·상수 캡·경로 정규화 유틸 (additive-only 헤더 규약 복제) |
| shared | 변경(소) | `RpcMethod` union에 `task.mission.start/close/list` 추가 + **capability map·permission grammar·FIRST_PARTY_METHODS 갱신**(누락 시 tsc/enforce 모드가 막는다) |
| daemon | 신설 | `WorkTaskService`(projection-first·전역 write 뮤텍스(§2)·멱등 LRU·replay→reconcile→GC 순서·양방향 reconcile) |
| daemon | 변경(소) | 파이프 라우터 등록 + index 배선 + senderPtyId→verifiedWorkspaceId 스탬프 경로(기존 채널 변이 핸들러 미러) |
| mcp | 신설 | `channel_mission_start/close` 2도구(얇은 RPC 호출자, 멱등키 전달) |
| renderer | **무변경** | 미션 뷰는 파동 2(IA)·J1 몫 |
| tests | 신설 | **성공기준 E2E 왕복**(§0) + replay 복원·멱등(start 재시도·재close)·authz(타 워크스페이스 거부·CEO 허용·fail-closed 신원)·보상 archive·양방향 reconcile(고아 채널·closed+active)·외부 변이 내성(선archive·채널 소실)·MCP 등록 존재/부재(archive 부재 관례 테스트 미러) |

검증 게이트: 신규 서비스 테스트 그린 + `test:parallel` 무영향 + `tsc` 클린. 제품 UI 변경 0.

## 5. §6.M 소유권 계약 고정 (P9 해소 — 구현 없음, 계약만)

J3 통합 결정 전까지 두 세계가 충돌하지 않도록 지금 고정하는 계약:

1. **탄생 소유(born-owned)**: 사람이 시작하는 §6.J 태스크(J0~J3 전부)는 생성 즉시 `owner = createdBy`(서버 투입, wire 불가). **pending 풀에 절대 들어가지 않는다** — claim 대상이 아니다. close authz 앵커는 owner다(§3).
2. **탄생 대기(born-pending)**: §6.M P2 풀 태스크는 `owner` 부재로 태어나고, claim 자격게이트(로드맵 §6.M 순서 계약)가 owner+lease를 원자적으로 쓴다. claim된 풀 태스크가 worktree로 물질화되면 **같은 WorkTask 스키마의 J1 필드를 채우는 것**이지 새 스키마가 아니다.
3. **lease는 데몬 단독 소유**: 어떤 caller도 lease 필드를 직접 쓰지 못한다(P2 활성화 시에도 wire에서 거부 — §2 화이트리스트가 물리적 강제). J0은 필드명만 예약해 스키마 분기를 봉쇄.
4. **단일 작성자**: WorkTask의 유일한 작성 경로는 WorkTaskService — 렌더러·MCP는 전부 RPC 경유. A2aTaskService와 같은 원리.
5. **완료증거 경계**: J0 close는 사람 액션이라 증거 게이트 없음. §6.M P2 자율 완료가 붙는 시점에 **A2A와 동일한 CompletionEvidence 게이트를 재사용**한다(재발명 금지) — close payload에 `evidence?` 옵셔널 슬롯만 예약.
6. **물리 배타 앵커**: 소유권의 최종 심판은 canonical worktreePath 유일성 불변식(§2) — 논리 owner가 꼬여도 같은 체크아웃에 두 태스크가 서지 못한다.

## 6. 리스크·함정

| 리스크 | 대응 |
|---|---|
| 미션 채널 남발(에이전트가 start 스팸) | 워크스페이스당 open 태스크 캡 + 채널 생성은 기존 채널 캡 상속. 초과 시 명시 에러 |
| 고아 private 채널(크래시 창) | 보상 archive(실패 시 즉시) + 채널 방향 부트 reconcile(topic 앵커) — reaper 의존 제거(v1 오류 정정) |
| topic 앵커 위조(사용자가 수동으로 `wmux:mission:*` topic 채널 생성) | reconcile은 "projection에 없는 taskId"만 archive — 위조 topic 채널은 태스크가 없으므로 archive됨. 자해 한정(자기 워크스페이스 private 채널)·기록만 |
| `domain:'task'` replay 비용(부트) | closed GC(7일)로 projection 바운드. 로그 절단은 §6.L 컴팩션 몫(불변) |
| A2A Task와 명명 혼동 | 타입 `WorkTask`·RPC `task.mission.*` 접두로 분리. 문서·코드 주석에 교차 참조 |
| J1이 스키마를 뒤집는 발견(페인 그룹 모델 등) | J1 필드는 전부 옵셔널 + `task.update` payload 선예약 — 뒤집기가 아니라 채우기. paneGroupId의 실체(그룹 vs 페인 배열)는 J1 설계 몫으로 명시 위임 |

## 7. 후속 순서

1. ~~본 문서 3모델 플랜 리뷰~~ **완료(2026-07-09)** — §8.
2. W1 구현 위임(§4 표면 — LEDGER 갱신 후).
3. J1 설계(오케스트레이터 직접): WorktreeManager 일반화 범위(현 156줄 — add/remove/list/merge만 있고 §6.J 함정 목록의 전용 루트·dirty 보존·락 경합 큐잉이 전부 미구현), 페인 그룹 템플릿, fan-out UI.

## 8. 리뷰 로그 — 3모델 패널 1라운드 (2026-07-09)

Codex 9건 + Claude 6건(실코드 검증 — archive 멤버 게이트·reaper prune 조건·reaper의 archived 무예외를 file:line으로 확정) + GLM 9건. 주요 반영:

| # | 합의 | 요지 | 반영 |
|---|---|---|---|
| R1 | 3-MODEL | 고아 채널을 reaper가 못 줍는다(생성자 멤버 잔류 → memberCount>0) | 보상 archive + topic 앵커 채널 방향 reconcile(§3) |
| R2 | 2-MODEL | task.create 전체 시드 ↔ wire 거부 자가모순 | wire 화이트리스트(§2) |
| R3 | 2-MODEL | MCP 멱등키 부재·재close 미정의 | idempotency_key + 재close no-op(§3) |
| R4 | 2-MODEL | verifiedWorkspaceId 산출 경로 무정의 | senderPtyId 서버 스탬프·fail-closed(§3) |
| R5 | 2-MODEL | 외부 leave/archive/소실과 태스크 수명주기 충돌 | 단방향 참조 + close 무조건 내성(§3) |
| R6 | 2-MODEL | 성공기준 측정 불가 | E2E 왕복 판정식(§0) |
| R7 | Claude(실코드) | archive authz는 멤버 게이트 — createdBy 앵커 주장 거짓 | 태스크 게이트 1차 방어선 재구성 + owner leave 수용 잔여(§3) |
| R8 | Claude(실코드) | reaper가 archived도 prune — 영구 보존 주장 붕괴 | 정본=로그 재프레임·projection 보존은 조건부 명시(§3) |
| R9 | Codex | GC가 reconcile 대상 소실 | 부트 순서 고정 + GC 면제 조건(§1) |
| R10 | Codex | worktreePath 문자열 비교 우회 / Claude: J0 실효 0 | canonical 정규화 + 전역 write 뮤텍스 + J0 실효 명시(§2) |
| R11 | Codex | RpcMethod·capability·FIRST_PARTY 배선 누락 | §4 표면 완결 |
| R12 | Codex | J1 갱신 payload 부재 | task.update 선예약(§2) |
| R13 | GLM | closed GC 정책 부재 | 7일 상수(§1) |
| R14 | GLM | CEO 예외 실체 불명 | ceoWorkspaceId 메커니즘 인용(§3) |
