# 6g② — 오퍼레이터 join 설계 (2026-07-05)

> 에이전트가 만든 private 채널에 **사람이 스스로 들어가는** 신뢰 경로. 채널 개선 플랜(channels-remediation-plan-2026-07-05.md §6g②)의 이월 항목.
> 상태: **v1.1** — 3모델 플랜 리뷰(Codex/GLM 5.2/Claude Opus) 반영. §7 리뷰 로그. **구현은 Opus 시대**(2026-07-07 이후), 이 문서가 스펙.

## 0. 문제

P5 이후 사람의 채널 정체성은 앱 전역 단일 좌석 `(ws-human, local-ui, human:me)`다. 두 안전장치의 교집합이 공백을 만든다:

1. **ws-human 초대 금지** (P5 가드 — main 파이프 라우터 identityRefs 스캔 a2a.channel.rpc.ts:169 **및** 데몬-사이드 create():605/invite():1103 대칭 거부): 어떤 에이전트 경로도 ws-human을 초대 타겟·create 초기 멤버로 쓸 수 없다. 근거 = **유령 행 벡터** — 같은 머신의 에이전트 정체성은 위조 가능(#113)하므로, 에이전트가 사람 좌석 행을 심으면 팬텀 배지/unread/recipientSnapshot 오염을 사람 동의 없이 만들 수 있다.
2. **private 자가가입 금지** (#288 fail-closed 가시성 게이트, ChannelService.join():794): private 채널은 비멤버에게 존재 자체가 숨겨지고, join은 visible해야만 가능하다.

∴ 에이전트들이 private 채널을 만들어 협업하면, **그 머신의 주인인 사람이 GUI로 들어갈 방법이 없다.** 해법은 초대 재허용이 아니라(1의 근거 그대로) 사람 쪽에서 당기는 **오퍼레이터 join**이다.

## 1. 신뢰 모델 — 3층을 정직하게 (v1.1 전면 개정)

v1은 "트랜스포트 경계 = humans-only"로 단순화했다가 리뷰에서 깨졌다(Claude 단일 근인 + Codex #1). 정확한 그림은 3층이다:

| 층 | 경계 | 무엇을 막나 | 무엇을 못 막나 |
|---|---|---|---|
| L1. 렌더러 전용 IPC (`channels:mutate-local`) | Electron 프로세스 경계 | main 파이프 라우터를 타는 모든 에이전트/MCP/CLI | 데몬 제어 소켓 직결 |
| L2. 데몬-사이드 가드 (create/invite의 ws-human 거부 등) | 데몬 코드 | **직결 호출자 포함** 모든 경로에서 해당 조합 | 가드가 존재할 수 있는 연산만 |
| L3. `#113` 천장 | (없음) | — | **같은 OS 유저의 악성 코드는 아무것도 못 막는다**: auth token 읽기(0600은 타 유저 방어), 데몬 소켓 직결(channelCallerIdentity.ts:38-49가 ws-human pre-stamp 잔여를 명문화), 그리고 무엇보다 **`~/.wmux/channels.json`을 메시지 전문 포함 그대로 읽기** |

L3이 함의하는 것: **#288도, ws-human 가드도, 악성 same-user 코드에 대한 보안 경계가 아니다.** 그것들은 (a) 선량한 에이전트의 도구가 fail-closed로 동작하게 하는 API 관례이고 (b) 우발적 교차 오염 방지다. 진짜 기밀성 경계는 OS 유저 단위다(디스크 파일이 이미 그렇다).

이 문서의 모든 "humans-only"는 따라서 **"L1 강제 + L2 가능한 만큼 + L3 잔여 명시 수용"**을 뜻한다 — kick/archive/post-as-Me가 이미 취한 것과 동일한 자세(그 연산들도 직결 잔여가 문서화·수용돼 있다).

**전제조건 (Codex #6 + Claude 축③)**: 이 설계의 정당화는 **데몬이 사람과 동일 호스트의 로컬 단일 인스턴스일 때만** 성립한다. 원격/LanLink/멀티 데몬으로 operator 표면을 재사용하는 순간 "GUI 설탕"이 아니라 신규 권한이 된다 — §2.3 비목표로 금지.

## 2. 스펙

### 2.1 `a2a.channel.operatorJoin` (신규)

```
params: { channelId: string, verifiedWorkspaceId: string }   // 그 외 일절 없음
효과 1: members[channelId]에 사람 좌석 행 push:
        { workspaceId: HUMAN_WORKSPACE_ID, memberId: HUMAN_MEMBER_ID,
          principalId: HUMAN_SELF_PRINCIPAL_ID,          // shared/principals.ts (좌표 정정, Codex #8)
          joinedAt: now, historyFromSeq: 0, lastReadSeq: nextSeq-1 }
효과 2: 서버-발행 시스템 메시지 1건을 채널에 영속 append (§2.1.1 — v1.1에서 필수로 승격)
```

핵심 결정들:

- **좌석 하드코딩 — 파라미터 표면에서 완전 제거.** 스펙 강화(Codex #2): `OperatorJoinParams` **타입 자체**가 `{channelId, verifiedWorkspaceId}` 두 필드다. 본문은 행을 **상수로만** 구성하며, 원시 params 객체에 `member`/`includeHistory` 등이 실려 와도 **읽지 않는다**(구현은 join()과 별도 본문 — 공용 헬퍼 추출은 가능하되 caller-파라미터를 소비하는 형태 금지. "join() 재사용"이라는 v1 표현이 바로 P5류 주입의 예리한 모서리였다). 쓰레기 파라미터 주입 무시를 테스트로 고정.
- **#288 게이트를 의식적으로 우회**하되 우회는 그것뿐: 존재 확인 → archived 게이트 → duplicate 게이트는 join()과 동일. **에러 코드 명시**(GLM ⑤): 없는 id → `CHANNEL_NOT_FOUND`(주인 상대 존재 은폐 불필요), archived → `CHANNEL_ARCHIVED`, 이미 멤버 → `DUPLICATE_MEMBER`(GUI가 no-op으로 처리; silent-success로 바꾸지 않는다 — join()과 의미론 일치).
- **히스토리 = 전체**(historyFromSeq: 0), **unread = 0**(lastReadSeq: nextSeq-1) — join() 기본값과 동일, 특례 없음. leave 후 재-operatorJoin은 일반 join과 같은 "새 좌석" 의미론(unread 리셋)이다 — 상태 이월 없음(GLM ①).
- **authz**: verifiedWorkspaceId는 좌석이 하드코딩이라 authz 입력이 아니다 — "no anonymous mutation" 자세 확인용 존재 검증만(kick :1871 관례). 이것이 직결 잔여에서 무엇을 의미하는지는 §2.1.2에 정직하게 적는다.

#### 2.1.1 서버-발행 시스템 메시지 (v1 필수 — 리뷰가 뒤집은 결정)

v1 초안은 "시스템 메시지는 P6로 연기"였다. 리뷰가 뒤집었다(Claude 축①·④ + Codex #4): roster 팬아웃은 **최선노력·비내구**다(emitCatalog는 실패를 삼키고, EventBus는 유한 링, leave가 행을 지우면 흔적 0). "정직한 입장"을 팬아웃에만 실으면 join→열람→leave 사이클이 무흔적이고, 직결 위조 join(§2.1.2)은 팬아웃을 **거짓 신호로 무기화**한다(에이전트들이 "사람이 봤다"고 오신).

따라서 operatorJoin 성공 시 데몬이 **채널 히스토리에 시스템 메시지 1건을 영속 append**한다 (seq 소비, 일반 메시지와 동일 영속 경로, `type: 'system'` + 고정 키 — 형식 상세는 구현 시). 가치:
- **내구 감사 흔적**: leave 후에도, 팬아웃을 놓친 멤버도, 다음 히스토리 읽기에서 본다.
- **위조 탐지의 사람 쪽 증거**: #113 잔여로 위조된 operatorJoin도 이 메시지를 남긴다 — 데몬은 진짜/위조를 구분 못 하지만(L3), **사람이 GUI에서 "내가 join한 적 없는데?"를 발견**할 수 있는 유일한 장치가 된다. 침묵 위조보다 강제 자백이 낫다.
- leave 시의 시스템 메시지는 P6 수명주기와 함께(v1은 join만 — 입장이 권한 획득 시점이라 비대칭이 정당).

#### 2.1.2 직결 잔여 명시 (L3 — kick 선례와 동일한 수용 문서화)

데몬 소켓 직결 호출자(같은 OS 유저)는 operatorJoin을 아무 verifiedWorkspaceId로 호출해 **사람 좌석을 임의 채널에 심을 수 있다**(Claude 축① 시나리오). 수용 근거:
- 이 호출자는 L3 천장 아래에 있다: 이미 `channels.json`을 디스크에서 메시지 전문 포함 읽을 수 있고, 멤버 workspaceId를 pre-stamp해 getMessages를 직접 부를 수도 있다(channelCallerIdentity 잔여 명문화). **operatorJoin이 새로 주는 읽기 능력은 없다.**
- 새로 생기는 것은 "위조된 사람 입장 신호"인데, §2.1.1의 시스템 메시지가 이를 **사람에게 가시화**한다(유일하게 가능한 방어 형태).
- create/invite의 데몬-사이드 ws-human 가드는 유지된다 — 그 가드의 목적(에이전트 도구의 fail-closed + 우발 오염 방지)은 operatorJoin과 충돌하지 않는다: 선량한 에이전트의 SDK/MCP에는 operatorJoin이 아예 없다(L1).

### 2.2 `a2a.channel.operatorList` (신규, 읽기 전용)

발견 어포던스. private 채널은 list()에서 비멤버에게 안 보이므로, GUI가 "들어갈 수 있는 방"을 보여줄 방법이 필요하다.

```
params: { verifiedWorkspaceId: string }
반환:   전 채널(공개+private, active+archived)의 메타데이터만:
        { id, name, visibility, status, memberCount, createdAt }[]
```

- **메시지 미리보기 없음, 멤버 상세 없음.** 내용을 읽으려면 join해야 하고, join은 시스템 메시지를 남긴다(§2.1.1).
- `name` 포함 유지 (GLM ②·Codex #5의 마스킹/제외 제안 기각): 이름 없는 목록은 뭘 join할지 식별 불가 → 맹목 join 유발로 오히려 해롭다. 우발 노출 우려는 **GUI 의도 게이트**로 해소(§3): 오퍼레이터 섹션은 접힘이 기본이고, 펼치는 행위가 디스크를 여는 것과 동급의 의도적 행위다.
- archived 포함 유지 + status 뱃지(리뷰 양 패널 합의): 감사 가시성. join은 CHANNEL_ARCHIVED로 거부된다.
- 직결 잔여에서 이 메서드는 "전 private 채널 name·memberCount 열거 오라클"이 된다(Claude 축②). 수용 근거는 §2.1.2와 동일: 같은 호출자는 이미 디스크에서 동일 정보+메시지 전문을 읽는다. **API가 디스크보다 강하지 않다.**

### 2.3 변하지 않는 것 (명시적 비목표 — v1.1 확장)

- **초대 재허용 없음**: main 라우터 identityRefs 가드와 데몬 create()/invite()의 ws-human 대칭 거부는 1비트도 안 바뀐다.
- **에이전트용 operator 경로 없음**: operatorJoin/operatorList는 `CHANNEL_MUTATING_METHODS` allowlist(channelLocal.handler.ts:45-84 블록)와 데몬 핸들러에만 존재. main 파이프 라우터·MCP 도구·`FIRST_PARTY_METHODS`·CLI 어디에도 추가 금지 (Codex #7: methodCapabilityMap에 RpcMethod 완전성 목적으로 등재하더라도 first-party 그랜트에서 제외 — 기존 humans-only 메서드 관례).
- **#288 게이트 본체 불변**: join()/get()/getMessages()/list()의 가시성 규칙 그대로. operatorJoin은 별도 메서드지 join()의 플래그가 아니다(플래그였다면 파이프 join에 주입 표면 — P5 교훈).
- **operatorLeave 불필요 — 표현 정정**(Codex #3 + Claude 축⑤): v1의 "leave()는 이미 humans-only 경로로 동작"은 부정확했다. 정확히는: **leave()는 main 라우터에도 등록된 에이전트-도달 메서드**이며, self-pin(verifiedWorkspaceId=자기 ws) 때문에 에이전트가 사람 좌석을 못 지울 뿐이다. 사람의 자기-leave는 GUI가 mutate-local로 verifiedWorkspaceId='ws-human'을 스탬프해 동작한다(ChannelView.tsx:678 실증). 직결 잔여로 사람 좌석 leave 위조가 가능함(축⑤)도 L3 천장의 일부로 수용 — 신설 아님, 기존 잔여.
- **원격 재사용 금지** (신규, Codex #6): operatorJoin/operatorList를 LanLink·원격 데몬·멀티 인스턴스 발견에 재사용하는 것은 이 설계의 정당화(§1 전제조건) 밖이며 별도 설계 없이 금지.

## 3. GUI 어포던스 (구현 시 상세화, 방향 고정)

- ChannelsPanel 채널 목록 하단 "모든 채널 보기" — **접힘 기본**인 오퍼레이터 섹션. 이 접힘이 장식이 아니라 **의도 게이트**다: 펼치기 전에는 private 채널명이 화면에 존재하지 않는다(우발 노출·화면 공유 배려, GLM ②).
- 항목: 비멤버 private 채널(잠금 아이콘) + archived(뱃지, 클릭 시 join 불가 안내).
- join 확인 다이얼로그: "이 채널은 에이전트들이 만든 비공개 채널입니다. 참여하면 채널에 기록이 남고 멤버 전원에게 표시됩니다." — 두 번째 문장은 §2.1.1의 계약을 그대로 진술하는 것이며 삭제 금지. 단 이 다이얼로그는 L1 장치다(직결 위조를 막는 건 §2.1.1이지 이 다이얼로그가 아니다 — v1의 "계약" 표현을 정확하게).
- i18n: en/ko 신규 키 ~5개(시스템 메시지 표시 문자열 포함).

## 4. 구현 좌표 (Opus 시대 작업용)

| 파일 | 변경 |
|---|---|
| `src/daemon/channels/ChannelService.ts` | `operatorJoin()` (별도 본문: 상수 좌석 행 push + 시스템 메시지 append + rollback + emitCatalog; caller 파라미터 소비 금지) + `operatorList()` (메타데이터 프로젝션) |
| `src/daemon/index.ts` | 핸들러 2개 — kick(:1871)/purgeMembership(:1887) 블록 옆, 동일 주석 관례 + **§2.1.2 잔여 주석 필수** |
| `src/main/ipc/handlers/channelLocal.handler.ts` | `CHANNEL_MUTATING_METHODS`(:45-84 Set 리터럴)에 2개 추가. operatorList는 읽기지만 humans-only 트랜스포트가 필요하므로 같은 allowlist — 주석으로 해소 |
| `src/renderer/hooks/useRpcBridge.ts` | mutateLocal union에 2개 추가 |
| `src/renderer/components/Channels/ChannelsPanel.tsx` + i18n | §3 어포던스 |
| `src/shared/channels.ts` | 시스템 메시지 타입/키 상수 (메시지 스키마 additive) |
| `src/main/pipe/handlers/a2a.channel.rpc.ts` / `src/main/mcp/firstParty.ts` / `src/mcp/channels.ts` | **무변경** — 테스트로 부재를 고정 |

테스트 계획 (v1.1 보강):
- ChannelService: private 비가시 채널 성공 / archived→CHANNEL_ARCHIVED / dup→DUPLICATE_MEMBER / 행 shape = P5 병합 행과 동일 / **params에 member·includeHistory 쓰레기 주입 시 무시**(Codex #2) / 시스템 메시지 append + seq 소비 + persist 실패 시 좌석·메시지 원자 롤백 / emitCatalog 팬아웃
- 경계 고정(Codex #7): main 파이프 라우터 미등록 단언 + `FIRST_PARTY_METHODS` 제외 단언 + MCP 도구 목록 부재 단언 + channelLocal allowlist 통과/비-allowlist 거부
- operatorList: 메시지/멤버 상세 미포함 프로젝션 + archived 포함 + 정렬 결정성
- verifiedWorkspaceId 부재 거부(양 메서드)

## 5. 리스크 및 반론 선처리 (v1.1 갱신)

- **"직결 에이전트가 사람 좌석을 위조로 심고 전문을 읽는다"** (Claude 축①) → 참이다. 그러나 그 호출자는 이미 디스크에서 같은 것을 읽는다(L3). operatorJoin의 신규 증분은 읽기가 아니라 "위조 입장 신호"이고, §2.1.1이 그것을 사람에게 가시화한다. 이 잔여는 kick·post-as-Me와 동일 클래스로 명시 수용.
- **"operatorList가 name 열거 오라클"** (Claude 축② + Codex #5) → 직결 관점에선 디스크와 등가(수용·문서화), GUI 관점에선 접힘-기본 의도 게이트(§3).
- **"honest presence가 비내구"** (Codex #4 + GLM ④) → v1.1에서 시스템 메시지로 내구화. 팬아웃은 즉시성 최선노력, 진실은 영속 멤버십 행 + 시스템 메시지.
- **"P5 create members[] 같은 연쇄 우회?"** → v1.1의 답: 파라미터 표면 제거(타입 수준) + 본문의 caller-필드 불소비 + 주입 무시 테스트. 그리고 "다른 입구"(직결)는 막는 척하지 않고 잔여로 명시한다 — P5 교훈의 진짜 형태는 "입구를 다 센다"이다.
- **결론지은 열린 질문**: archived 표시 = 보이되 뱃지 (3패널 합의) / 시스템 메시지 = **v1 필수로 승격** (Claude·Codex가 v1 초안의 연기 권고를 뒤집음; GLM의 연기 의견은 위조-세탁 시나리오 미고려로 기각).

## 6. (v1→v1.1 델타 요약)

§1 전면 개정(3층 신뢰 모델 + 동일 호스트 전제조건) / §2.1.1 시스템 메시지 필수 승격 / §2.1.2·§2.2 직결 잔여 명시 수용 / §2.3 leave 표현 정정 + 원격 재사용 금지 추가 / §2.1 에러 코드·재진입 의미론 명시 / §4 파라미터-불소비 스펙 + 경계 테스트 보강 / 좌표 정정(HUMAN_SELF_PRINCIPAL_ID→principals.ts, allowlist→:45-84).

## 7. 리뷰 로그 (3모델 패널, 2026-07-05)

- **Claude Opus** (적대, 좌표 전수 검증): 단일 근인 적중 — "안전 경계=main 라우터 미등록"의 과장, 직결 잔여에서 operatorJoin이 create/invite의 데몬-사이드 가드를 구조적으로 못 갖는 문제, 팬아웃 정직성의 무기화, leave humans-only 오기. **전부 채택** — §1 재구성과 §2.1.1 필수화의 직접 원인.
- **Codex** (8건 전부 실좌표): #1 직결 잔여(=Claude 근인) / #2 파라미터 경계 스펙 강화 / #3 leave 정정 / #4 honest presence 비내구 / #5 operatorList 노출 / #6 동일 호스트 전제 / #7 경계 테스트 보강 / #8 좌표 정정. **8/8 채택.**
- **GLM 5.2** (7건): name 마스킹·forceReset 파라미터 제안은 기각(어포던스 무력화·최소 파라미터 위배), 에러 코드 명시·kick/idempotency 문서화·열린 질문 견해는 채택. 시스템 메시지 연기 의견은 기각(위조-세탁 미고려).
- 3패널 공통 수렴: 직결 잔여 정직 문서화 / honest presence 내구화 / 동일 호스트 전제 명시.
