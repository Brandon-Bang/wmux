# §6.L 공통 이벤트 Envelope + append-only 로그 상세 설계 (Q1-1b)

- 상태: **v1.2 확정** (2026-07-06) — 3라운드 리뷰 종결: 패널 15건 → 델타 8건 → 마이크로 패스 0건(Codex 8/8 OK). **Q1-2(채널 P3)·Q1-4(A2A 내구화) 구현의 입력.**
- 작성: 2026-07-06, Opus 4.8 워커 (W1 레인). v1.1: 3모델 패널 필수 15건 반영. **v1.2: 델타 재리뷰(Codex+Claude 독립) 8건 반영** — PARTIAL·신규 발견이 전부 코얼레싱(v1.1 C9)×마이그레이션(A3/B4) 상호작용 지대에 수렴(문서 말미 리뷰 로그).
- 계약 정본: `plans/roadmap-12mo-world-no1-2026-07-05.md` §3.2(P1~P3)·§6.L·§6.F·§6.M·§6.E·§6.H·§6.K
- 선행 관계: 이 설계는 Q1-2(채널 P3)·Q1-3(P4/P6)·Q1-4(A2A 내구화)·Q1-4b(완료증거)의 **선행 기반**. envelope 스키마 확정 전에는 그 위 서비스 재배선을 착수하지 않는다(§6.L "envelope → 서비스 재배선" 순서 강제).
- 스코프: **채널 + A2A 재배선만.** approval/recording/asp/task(워크트리)는 미래 소비자 — domain enum 슬롯 + opaque payload가 수용하는 것까지만 보이고 재배선하지 않는다.
- 소스 미변경. 산출물은 이 문서 1개.

---

## 0. 핵심 결정 요약 (각 1줄 + 근거)

| # | 결정 | 근거 요지 |
|---|---|---|
| D1 | **로그가 정본, `channels.json`은 스냅샷 캐시로 강등(삭제 아님)** | §3.2 P2 "정본=append-only 로그" 준수하되, 기존 crash-safe 스냅샷 경로를 부트 가속기 + 마이그레이션 브리지로 재사용해 리스크 최소화 |
| D2 | **레거시 상태 = lamport 0의 projection 베이스라인** (히스토리를 envelope로 재합성하지 않음) + **genesis 스냅샷 불변 보존(D14)** | 마이그레이션이 O(1) 상태복사. 로그는 마이그레이션 후의 **신규** 이벤트만 기록. 마이그레이션-전 상태의 복구 가능성은 genesis가 보장(§6.2) — 경계 계약은 §6.3 |
| D3 | **물리 포맷 = 세그먼트드 NDJSON**, `~/.wmux/events/<seg>.ndjson`, 4MB 롤 | NDJSON은 기존 `JSON.parse`+prototype reviver(`core.ts:99-104`) 재사용·육안 검사 가능·불량 레코드 절단이 자명. 4MB 롤은 §6.E "세그먼트 4MB 롤" 정합 |
| D4 | **append는 tmp+rename 안 씀 — 세그먼트 fd에 직접 append** | 커밋(fsync 배리어) 이하 프리픽스는 물리 불변 → 복구 대상은 최후 배리어 이후 영역뿐(§2.6). tmp+rename(`core.ts:238-254`)은 전체파일 스냅샷용, append엔 부적합 |
| D5 | **fsync = 커밋경로 필수 + Q1부터 코얼레싱(그룹커밋)**; Q1 로그는 커밋 단일 티어 | 현행은 fsync 전무(`core.ts`는 write+rename만) — 로그가 정본이 된 이상 커밋 내구성 필수. per-append 단독 fsync는 멀티에이전트 버스트에서 p99 구조적 미달 → in-flight fsync 중 도착분을 다음 fsync 1회에 배치(§2.5). relaxed 티어는 미래 소비자용 별도 스트림으로 격리(§2.7) |
| D6 | **lamport hwm = 마지막 사용값(max), append는 pre-increment(`++hwm`)** — 부트 시 로그 스캔으로 max 복원 (별도 카운터 파일 없음) | §6.L 함정 "디스크 라운드트립 필수". 로그 자체가 단일 정본 — 스캔이 곧 라운드트립. 첫 신규값 = max+1 (오프바이원 없음, §3). 사이드카 카운터는 로그와 불일치 클래스를 만듦 |
| D7 | **`origin = {machineId, daemonEpoch, seq}`로 스켈레톤 additive 확장** | §6.H 삼중 `(originMachineId, originSeq, lamport)`의 `seq`를 Q1에 심어 Q4가 "발명"이 아닌 "활성화"가 되게 함. **승인 확정(§열린질문 뒤 판정 기록)** |
| D8 | **daemonEpoch = `CHANNELS_EPOCH`(`channels.ts:308`), 순서 비관여 provenance 스탬프** | 로드맵 §6.L 함정 지시 준수. 순서 단조는 lamport+origin.seq가 보장, daemonEpoch는 스키마 세대 출처표기 전용 (이름-역할 불일치는 §놀라운점에서 명시) |
| D9 | **eventId = `randomUUID()` v4** | 조정 없는 전역 유일. 이미 의존성(`ChannelService.ts:21`). 순서는 lamport, 레코드 정체성은 eventId, 업무 멱등은 idempotencyKey로 3분리 |
| D10 | **wallClock = 표시/감사 전용, 순서 절대 비관여** | 기존 채널이 "타임스탬프는 순서에 안 씀"을 이미 확정(`channels.ts:120-123`, 뮤텍스 창 내 동일 ms 공유) — 그 근거를 envelope에 승격 |
| D11 | **A2A는 처음부터 envelope 위에 — `A2aTaskService`(데몬) 신설, 렌더러 `a2aSlice`는 캐시 강등** | §6.F. 현행 A2A는 렌더러 인메모리 30분 GC(`a2aSlice.ts:8-9,289`)로 채널과 비대칭. 정본을 데몬 로그로 이동. **실행자(ClaudeWorker) 전이 경로도 데몬 직결로 재배선**(§10). executor-lifecycle은 Q1 **스키마 수용만**(기록은 §6.F — 델타 ⑧, §5) |
| D12 | **principals.json은 로그 도메인이 **아님** — 스냅샷 레지스트리 유지** (독립 계약 절 §6.5) | principal은 렌더러 재등록으로 복원되는 **현재상태 레지스트리**(`principals.ts:11-15`), 이벤트 히스토리가 아님. 로드맵 §6.L 문면 편차 — **승인 확정(판정 기록)** |
| D13 | **`durableAtomicWrite` 프리미티브 신설** — manifest·스냅샷·genesis·reseed·컴팩션 전제조건은 전부 이것 위에만 | 기존 `atomicWriteJSON`(`core.ts:200-260`)은 fsync 전무 → 전원손실 시 manifest rename 비내구 → 재마이그레이션 → fsync된 마이그레이션-후 이벤트 고아화. tmp write→tmp fsync→rename→부모 dir fsync (§2.3) |
| D14 | **genesis 스냅샷(`snapshot/genesis-channel.json`) 불변 영구 보존, 컴팩션 절대 제외** — reseed 스냅샷(§6.4c)도 동급 불변 | D2 하에서 레거시 상태는 로그에 없음 → 일반 스냅샷 전손 시 로그 replay만으론 마이그레이션-전 데이터 복구 불가. genesis(+reseed)가 폴백 체인의 바닥(§5·§6.2) |
| D15 | **부트 복구 = `events/` 디렉토리 스캔 + 전방 검증·최초 불량 줄 절단. manifest는 힌트일 뿐** | 롤 직후 크래시(빈 활성 세그먼트)를 first-boot로 오인하면 lamport/seq 리셋 = §6.L 함정 위반. 스캔 기반이면 orphan 세그먼트도 자연 채택(§3). manifest-부재 3분기는 §6.1(델타 ③) |
| D16 | **`append(): Promise<boolean>` — 실패 단위는 배치: `ftruncate(batchStartOffset)` 1회 + 배치 전원 false** | 현행 롤백 계약이 boolean(`ChannelService.ts:1441` `if(!this.saveOrFail())`, writer 내부 catch→false `ChannelStateWriter.ts:103-118`)이므로 동형 유지. append별 독립 ftruncate는 코얼레싱과 모순(순서의존 null 매장 — 델타 ①, §2.4) |
| D17 | **복구 시맨틱 = at-least-once. valid unsynced tail은 커밋으로 승격될 수 있다** (durable commit watermark 기각 — 오케스트레이터 재정) | per-batch watermark는 fsync가 하나 더 붙어 코얼레싱 이득 소멸. 승격 안전성은 idempotencyKey(§4)·ack-전용 커서 전진(`channels.ts:89-92`)·1 RPC=1 envelope이 보장(델타 ②, §2.6) |

---

## 1. Envelope 필드별 확정

현행 코드에 lamport/eventId/wallClock/idempotencyKey 상당물은 **존재하지 않는다**(전 소스 grep 무매치) — envelope는 그린필드다. 스키마는 §6.L 스켈레톤을 코드 좌표로 확정하고, §6.H를 위해 `origin.seq` 1필드만 additive 확장한다(D7, 승인 확정).

```ts
// src/shared/eventlog.ts (신설)
export interface EventEnvelope {
  eventId: string;              // D9: randomUUID() v4
  origin: {
    machineId: string;          // §8: 설치 생애 영구 불변 UUID (교체 금지)
    daemonEpoch: number;        // D8: = CHANNELS_EPOCH (provenance, 순서 비관여)
    seq: number;                // D7: 이 머신 로그의 append 인덱스(영속 단조)
    // keyId?: string           // §8: Q4 additive 예약 — 페어링 키 지문(machineId를 대체하지 않음)
  };
  lamport: number;              // D6: 데몬 전역 논리시계, 표시 순서의 정본
  wallClock: number;            // D10: Date.now() @ append, 표시/감사 전용
  idempotencyKey?: string;      // §4: 업무 멱등키(있을 때만)
  causalRefs?: string[];        // eventId[], provenance(가늠쇠), Q1 비게이팅
  authContext: {
    principalId: string;        // §7: 스탬핑, display/routing (authz 아님)
    verifiedWorkspaceId: string;// §7: 서버 핀(authz 앵커)
    trustTier: TrustTier;       // §7: §6.K 4등급
  };
  domain: EventDomain;          // 'channel'|'a2a'|'task'|'approval'|'recording'|'asp'
  payload: unknown;             // 도메인 opaque(스코프 밖 도메인은 미해석 통과)
}
export type EventDomain =
  | 'channel' | 'a2a' | 'task' | 'approval' | 'recording' | 'asp';
```

### 필드별 발급 규칙·불변식·발급 주체

발급 주체는 **전부 데몬 단독**이다. 데몬은 채널 상태의 유일 writer이고(`ChannelService.ts:2` "The ONLY writer"), §3.2 P3(라이브 경로 단일 writer)의 로그 계층 구현이다. 렌더러·Main·MCP는 절대 append하지 않는다 — RPC로 projection을 소비할 뿐이다.

| 필드 | 타입 | 발급 규칙 | 불변식 |
|---|---|---|---|
| `eventId` | string(uuidv4) | append 시점 데몬이 `randomUUID()` | 전역 유일. 재시도/롤백으로 재사용 금지(롤백은 미append이므로 자연 충족) |
| `origin.machineId` | string | 부트 시 확정(§8, `events/machine-id` — 생성 시점은 §6.1-2, 델타 ⑥) | **설치 생애 영구 불변**(Q4에도 교체 금지, §8) |
| `origin.daemonEpoch` | number | `CHANNELS_EPOCH` 상수(`channels.ts:308`) | 스키마 마이그레이션 세대에만 변경. **순서 비관여** |
| `origin.seq` | number | append마다 `++hwmSeq` (hwm=마지막 사용값) | 머신 내 단조·무결. 부트 재개(§3). `(machineId, seq)` 전역 유일 |
| `lamport` | number | append마다 `++hwmLamport` (hwm=마지막 사용값; Q4: 원격수신 시 `hwm = max(hwm, recv)` 후 ++) | 데몬 내 단조. 표시 순서 정본. 재사용/역행 금지 |
| `wallClock` | number(ms) | `Date.now()` @ append | **순서 비관여**(D10). 표시·감사·리댁션 스팬용 |
| `idempotencyKey` | string? | 업무 멱등 필요 도메인만(§4) | 있으면 (domain, stream) 내 유일 커밋 보장. **at-least-once 승격의 재시도 흡수 앵커**(D17, §2.6) |
| `causalRefs` | string[]? | 직접 원인 이벤트의 eventId | Q1 비게이팅 provenance. 배달/전이 의존성 아님(→ payload가 담당). **마이그레이션-전 메시지는 참조 불가**(eventId 부재, §6.3 경계 계약) |
| `authContext.*` | — | 데몬 경계에서 스탬프(§7) | verifiedWorkspaceId는 서버 핀(위조 불가), principalId/trustTier는 라우팅·표시 |
| `domain` | enum | 서비스가 지정 | 스코프 밖 값은 미해석 통과(로그는 도메인 무지) |
| `payload` | unknown | 도메인 소유 | 로그 계층은 절대 해석 안 함(레이어 경계) |

### eventId 형식 — 충돌 없는 생성 (결정: D9)

`randomUUID()` v4. 이미 `ChannelService.ts:21`에서 import 중이라 신규 의존성 0. UUID는 데몬 간 조정 없이 전역 유일하므로 Q4 멀티머신에서 병합해도 충돌 없다. **eventId ≠ idempotencyKey**: eventId는 "이 로그 레코드"의 정체성(중복 append 탐지·causalRefs 대상), idempotencyKey는 "이 업무 요청"의 정체성(재시도 흡수). 둘을 합치면 재시도가 원본과 같은 eventId를 갖게 되어 로그에 물리적으로 2번 나타났는데 "같은 레코드"라고 주장하는 모순이 생긴다 — 분리 유지.

### wallClock의 지위 (결정: D10 — 표시용, 순서 비관여. 맞다)

**순서에 절대 관여시키지 않는다.** 근거는 추정이 아니라 기존 코드가 이미 내린 결론이다: `channels.ts:120-123`은 "seq is the canonical ordering — timestamps are not used for ordering because multiple posts within a single mutex window can share millisecond timestamps"라고 명시한다. 즉 단일 뮤텍스 창 안 다수 post가 같은 ms를 갖는 실측 이유로 채널은 이미 wallClock을 순서에서 배제했다. envelope는 이 규칙을 승격한다: 순서 = lamport, tiebreak = `origin.seq`(동일 머신) → `(machineId)`(멀티머신, §8). wallClock은 사람이 읽는 "언제"와 §6.E 리댁션 시간 스팬에 쓴다. (v1.1의 다운그레이드 mtime 가드 용례는 델타 ④로 폐기 — §6.4c 워터마크로 대체.)

### causalRefs 사용 규칙 (결정)

**Q1에서 causalRefs는 옵셔널 provenance이며 배달·게이팅에 쓰지 않는다.** 채우는 예: ack 이벤트가 "여기까지 소비" 대상 post의 eventId를 참조, task 전이가 직전 전이 eventId를 참조. 용도는 감사·리플레이 그래프 재구성(§6.E)뿐이다. **업무 의존성**(§6.M P2 `depends_on`, §6.F 완료증거 순서)은 **payload 레벨 필드**로 분리한다 — causalRefs(envelope provenance)와 depends_on(업무 의존)을 한 축으로 합치지 않는 것이 §6.M 함정("펜싱과 lease는 다른 축")과 동형 원리다. Q1에 causal-배달 엔진을 짓지 않는다(과조기 추상화 금지).

---

## 2. 로그 물리 포맷

### 2.1 파일 레이아웃 (결정: D3 — 단일 논리 스트림, 물리 세그먼트드, 도메인은 파일이 아니라 필드)

**도메인별 파일 금지.** lamport는 데몬 전역 단일 시계이고 §6.H 병합·§6.E 리플레이는 하나의 순서선을 요구한다. 도메인별로 파일을 쪼개면 그 순서선이 파편화되어 "채널#5가 task#3보다 먼저인가"를 파일 간 병합으로 재구성해야 한다. 대신:

```
~/.wmux{dataSuffix}/events/        # getWmuxDir() 기준 (config.ts:10-12; dataSuffix() constants.ts:228-230)
  manifest.json                    # {formatVersion, machineId, activeSegment, snapshotLamport, genesisRef, reseedRefs[]}
                                   #   — 부트 힌트(§3, 정본 아님). machineId 참조 → 순서 불변식은 §6.1-2(델타 ⑥)
  machine-id                       # §8: origin.machineId (로그와 동일 fate, 생성은 §6.1-2)
  00000001.ndjson                  # 커밋 세그먼트: 한 줄 = 한 EventEnvelope(JSON)
  00000002.ndjson                  # 4MB 초과 시 롤
  ...
  # <seg>.relaxed.ndjson           # §2.7: 미래 relaxed 소비자용 예약(Q1 미생성)
  quarantine/                      # §6.1-(c): 비정상 세그먼트 격리(보존, 삭제 아님)
  snapshot/
    genesis-channel.json           # D14: 마이그레이션 시점 불변 보존(컴팩션 절대 제외)
    reseed-{n}.json                # §6.4c: 다운그레이드 재-시드 스냅샷(genesis급 불변, 컴팩션 제외)
    channel.json                   # projection 스냅샷(부트 가속, §5)
    a2a.json
```

경로는 `getWmuxDir()`(`config.ts:10-12`)를 재사용하므로 `dataSuffix()`(`constants.ts:228-230`, dev=`-dev`) 인스턴스 격리를 자동 상속한다 — dev/packaged가 같은 로그를 두고 충돌하지 않는다.

### 2.2 인코딩 (결정: D3 — NDJSON, length-prefixed 아님)

한 줄 = `JSON.stringify(envelope)` + `\n`. 근거:
- 기존 `jsonReviver` prototype-pollution 가드(`core.ts:99-104`)를 줄 단위 파싱에 그대로 재사용.
- 육안 검사 가능 — 저장소 관례가 pretty-JSON(`core.ts:90` `JSON_INDENT=2`)일 만큼 "디스크 상태는 읽을 수 있어야 한다"를 중시. (로그는 줄당 1레코드라 pretty 아님, `\n`이 레코드 구분자이므로 payload 내부는 compact.)
- length-prefixed 프레이밍이 부분쓰기엔 더 견고하나 육안검사 상실 + 전용 리더 필요. NDJSON은 불량 레코드 판별이 "줄 파싱 실패"로 자명 — 복구 규칙은 §2.6(전방 스캔·최초 불량 절단).

### 2.3 durableAtomicWrite 프리미티브 (신설 — 결정: D13)

**문제(패널 3-MODEL CRIT — v1의 내부 모순)**: v1은 manifest를 "마지막 커밋 지점"(§6), 스냅샷 fsync 확정을 컴팩션 전제(§9)로 삼으면서, 그 쓰기를 fsync 전무한 `atomicWriteJSON`(`core.ts:200-260` — async/sync 모두 write+rename만, fsync 무호출; §놀라운점에서 v1이 스스로 식별한 갭)에 얹었다. 전원손실 시 manifest rename이 비내구 → 다음 부트가 레거시를 재감지·재마이그레이션 → 이미 fsync된 마이그레이션-후 로그 이벤트가 **고아화**된다.

**해법**: 기존 `AtomicWriteOptions`(`core.ts:42-62`)에 additive `durable?: boolean` 옵션을 추가한 `durableAtomicWrite` 경로 신설(rotation·validate·quarantine 기계 재사용, 스키마 additive-only 관례와 동형). 시퀀스:

1. tmp 파일 write (`core.ts:231` 기존 단계)
2. **tmp fd `fsyncSync`** (rename 전에 내용이 디스크에)
3. rename tmp → target (`core.ts:254` 기존 단계)
4. **부모 디렉토리 fd open + `fsyncSync`** (디렉토리 엔트리(rename 자체)의 내구화)

**적용 대상(전부 이것 위에만)**: manifest write(§3·§6.1) · projection 스냅샷 write(§5) · genesis 스냅샷(§6.2) · reseed 스냅샷(§6.4c) · machine-id(§6.1-2) · 컴팩션 전제조건의 "스냅샷 fsync 확정"(§9) · 다운그레이드 shutdown flush(§6.4b).

**win32 잔여(명시)**: Node에서 Windows는 디렉토리 핸들 fsync를 지원하지 않는다(디렉토리 open 불가) — 4단계는 win32에서 스킵하고 1~3단계(파일 자체 FlushFileBuffers)까지만 보장한다. NTFS 메타데이터 저널링이 rename 내구를 부분 보완하지만 POSIX 동급 보장은 아니다 — 수용 잔여로 계약에 명시(전 플랫폼 공통 코드가 조용히 다른 보장을 주는 것보다 명시가 낫다). 잔여가 실화되는 최악 케이스도 "manifest가 구버전(마이그레이션 직후엔 부재)으로 롤백"이며, §3의 스캔-기반 부트와 §6.1의 manifest-부재 3분기(델타 ③)가 이를 흡수한다.

### 2.4 append 방법 — 배치 모델 (결정: D4 + D16, 델타 ① 재작성)

활성 세그먼트를 `fs.openSync(seg, 'a')`로 열고 유지. **tmp+rename을 쓰지 않는다** — tmp+rename(`core.ts:238-254`)은 전체파일 교체(스냅샷)용이고, append-only 로그의 복구 단위는 §2.6의 배리어-이후 영역 절단이다. 매 post마다 전체 상태를 재직렬화하던 `saveImmediate`(`ChannelStateWriter.ts:103-118`, `saveOrFail` `ChannelService.ts:1885`)를 O(1) append로 대체 — `channels.ts:394-400`이 경고한 "post당 O(total history) 재직렬화 DoS"를 원천 해소.

**단위는 배치다 — 단일 append는 크기 1 배치의 특수형** (v1.1의 "append별 자기 offset ftruncate"는 §2.5 코얼레싱과 모순이었다: 배치 fsync 1회 실패 시 N개 append가 각자 offset으로 독립 ftruncate하면 실행 순서에 따라 — 최소 offset이 마지막에 오지 않으면 — 뒤의 ftruncate가 파일을 도로 늘려 로그 **중간에 null이 매장**되고, §2.6 전방스캔이 그 null을 최초 불량으로 절단해 그 뒤에 이미 커밋(fsync-resolve)된 레코드까지 유실한다 — 델타 ① 2-MODEL CRIT).

배치 1라운드의 정확한 절차:

1. **batchStartOffset 기록**: 라운드 시작 시(= 직전 성공 fsync 배리어 직후) 파일 길이 1회.
2. **write**: 배치에 속한 각 레코드를 순차 write — **short-write 루프**(`fs.writeSync(fd, buf, written)`을 `written === buf.length`까지; 단일 호출이 전량 쓰기를 보장하지 않는다). 개별 write 에러(ENOSPC/EIO)도 4단계 실패 경로로.
3. **fsync 1회**: 배치 전체를 커버하는 배리어. 성공 시 배치 내 모든 append Promise를 true로 resolve.
4. **실패 경로(배치 단일 롤백)**: write 에러 또는 fsync throw 시 — `ftruncateSync(fd, batchStartOffset)` **한 번**으로 배치 전체(+그 뒤에 이미 write된 다음 라운드 대기분까지, 물리적으로 함께)를 제거하고, **그 시점까지 파일에 쓰인 모든 미커밋 append의 Promise를 전원 false**로 반환한다. 대기 큐에서 아직 write되지 않은 항목도 같은 라운드 실패로 처리(로그를 재개 가능 상태로 리셋한 뒤 신규 append부터 재수용). 부분 잔존이 구조적으로 불가능하다 — 단일 ftruncate 지점이 "마지막 성공 배리어 오프셋"이기 때문.
5. **에러모델(D16)**: `append(): Promise<boolean>` — 내부에서 catch하고 배치 롤백 후 false. throw하지 않는다. 근거: 현행 커밋 계약이 boolean이다 — `if (!this.saveOrFail())`(`ChannelService.ts:1441,1661` 등)이 롤백 블록을 조건 실행하고, writer가 내부 catch→false(`ChannelStateWriter.ts:114-117`)를 반환한다. append가 throw하면 기존 롤백 블록을 건너뛴다(§5 재배선 문면도 이에 맞춤).

ghost 방지는 이 배치 롤백의 따름정리다: "write 성공 + fsync throw"로 남은 유효 `\n`종단 줄들은 4단계의 단일 ftruncate가 물리 제거하므로, projection이 롤백된 이벤트가 로그 내부에 매장돼 부트 replay로 부활하는 경로가 없다(잔여는 §2.6 at-least-once).

### 2.5 fsync 정책 (결정: D5 — 커밋 필수 + Q1부터 코얼레싱, 실패 단위 = 배치)

현행 코드는 fsync가 **전무**하다(`core.ts:200-260,361-413` — write+rename만). 스냅샷엔 허용되는 포스처지만(다음 저장이 재flush) 정본 로그엔 부족하다(전원손실 시 acked 이벤트 유실). 결정:

- **커밋경로**(채널 post·ack 커서 이동·멤버십 변경·A2A task 전이): append는 fsync 배리어 아래에서만 resolve. acked 이벤트는 전원손실을 생존.
- **코얼레싱(그룹커밋) — Q1 포함으로 확정(패널 C9, 오케스트레이터 재정)**: 전역 append 직렬화 + per-append 단독 fsync는 멀티에이전트 동시 커밋 버스트(예: N개 페인의 동시 ack)에서 p99 예산을 구조적으로 미달한다. 구현: in-flight fsync가 도는 동안 도착한 append들은 큐에 쌓고(write는 즉시 수행 가능), fsync 완료 시 큐 전체를 **다음 fsync 1회**로 배치한다. 각 append의 Promise는 **자기 레코드를 커버하는 fsync가 완료된 시점**에 resolve — "resolve = 내구화됨" 계약은 per-append와 동일하게 유지된다. 버스트 N건의 fsync 횟수는 O(N)→O(2)로 수렴.
- **성공·실패의 단위가 모두 배치다(델타 ①)**: 한 배리어가 커버하는 레코드들은 함께 true가 되거나(§2.4-3), 함께 false+단일 ftruncate로 제거된다(§2.4-4). 실패 라운드에 이미 write돼 있던 다음-배치 대기분도 물리적으로 함께 잘리므로 동일 라운드 false — Promise 상태와 디스크 상태가 항상 일치한다.
- 세그먼트 최초 생성 시 **디렉토리 fsync** 1회(디렉토리 엔트리 내구화; win32 잔여는 §2.3와 동일).
- **Q1 로그는 커밋 단일 티어다**: v1이 relaxed(fsync 생략) 후보로 꼽았던 principal lastSeen은 D12로 로그 밖이고, 비신뢰 ASP 표시힌트·executor 하트비트(§5, 델타 ⑧)는 스코프 밖 미래 소비자다 — 즉 Q1에 로그로 들어가는 모든 레코드는 fsync 배리어 커버를 받는다. relaxed 티어의 미래 형태는 §2.7.

### 2.6 손상 복구 — 전방 스캔·최초 불량 줄 절단 + at-least-once 계약 (결정: D15+D17, 델타 ② 정직화)

**왜 말미-전용 절단으로 부족한가**: 코얼레싱(§2.5)에서는 하나의 fsync 배리어가 여러 레코드를 커버한다. 크래시가 배리어 **전**에 오면 그 배치 영역의 페이지들은 OS writeback이 **비순서**로 일부만 내구화했을 수 있다 — 즉 중간 줄이 찢기고 그 뒤 줄은 멀쩡한, 말미가 아닌 **내부** 손상이 가능하다. 반대로 마지막 성공 fsync 배리어 **이하**의 프리픽스는 완전·연속 유효가 보장된다(같은 fd의 fsync는 선행 write 전부를 내구화).

**복구 규칙**: 부트 시 활성(최고번호) 세그먼트를 **앞에서부터** 줄 단위로 파싱(reviver 적용)하며 검증하고, **최초 불량 줄(파싱 실패 또는 비`\n`종단 말미)을 만나면 그 오프셋에서 `ftruncateSync`** — 그 뒤에 파싱 가능한 줄이 남아 있어도 전부 버린다. 절단 대상이 미커밋 영역뿐임은 프리픽스 보장이 증명한다(불량 줄은 마지막 성공 배리어 이후에만 존재 가능). 비용: 활성 세그먼트 ≤4MB 전방 파싱은 §3의 hwm 재구성 스캔과 **동일 패스**라 추가 비용 0.

**복구 시맨틱 = at-least-once — valid unsynced tail은 커밋으로 승격될 수 있다(D17, 델타 ② 정직화)**: v1.1의 "최초 불량 이후는 전부 미커밋=미관측이라 폐기 안전"은 절단 방향만 말했고, 반대 방향을 숨겼다 — 크래시가 write 후·fsync 전에 왔는데 OS가 그 페이지들을 이미 내구화했다면, **유효한 NDJSON 줄로 완결된 미커밋 레코드**가 남고 전방스캔은 그것을 불량으로 잡을 수 없어 부트 replay가 resolve되지 않았던 이벤트를 적용한다. durable commit watermark(배리어마다 커밋 오프셋 영속)로 이를 막는 안은 **기각**(오케스트레이터 재정) — per-batch로 fsync가 하나 더 붙어 코얼레싱 이득이 소멸한다. 대신 계약을 정직화한다:

- **안전 논증 (a) — 재시도 중복은 idempotencyKey가 흡수**: append=false(또는 무응답)를 본 호출자의 재시도는 §4 멱등 인덱스에 걸려, 승격된 원본과 중복 커밋되지 않는다(멱등 인덱스는 replay로 재구성되므로 승격된 레코드도 인덱스에 들어간다).
- **안전 논증 (b) — 사후 출현이 하위 시멘틱을 깨지 않음**: 호출자가 포기한 경우 이벤트가 재부트 후 "사후 출현"할 수 있으나, 채널 소비 상태(per-member `lastReadSeq`)는 **ack 경로로만 전진**한다(advance-only·clamp, `channels.ts:89-92`; ack 커서 로직 `ChannelService.ts:1612-1622`) — 출현한 post는 그냥 unread 1건일 뿐, 커서·ack·existence-hiding 어느 것도 오염되지 않는다.
- **안전 논증 (c) — projection 롤백 → 재부트 부활 케이스(명시)**: fsync 실패로 projection을 롤백(§5)했는데 크래시·ftruncate-실패 등으로 그 줄이 살아남으면, 재부트 replay가 그 이벤트를 되살린다 — 이것이 at-least-once의 얼굴이며 결함이 아니라 계약이다. (a)(b)가 이 케이스의 무해성을 보장한다.
- **부분 승격 금지 — 단위별 보장 계층**: ① 레코드(줄) 원자성: NDJSON 파싱이 보장 — 반쪽 줄은 절단된다. ② 업무 원자성: **1 RPC = 1 envelope**(post 1건 = append 1건, §5)이므로 "한 업무의 반쪽"이 승격되는 일은 구조적으로 없다. ③ 배치 원자성: fsync-실패(프로세스 생존) 경로는 §2.4-4의 **단일 ftruncate(batchStartOffset)** 가 물리적으로 보장 — 배치 일부만 디스크에 잔존하는 상태 자체가 만들어지지 않는다. 프로세스 kill(전원 유지)에서도 페이지캐시가 생존하므로 write 완료 배치는 전체 승격 또는 (write 미완이면) 절단이다. **잔여**: 전원손실의 비순서 writeback에서는 배치의 프리픽스만 유효하게 남아 승격될 수 있다 — 이는 배치가 내구성 스케줄링 단위일 뿐 업무 트랜잭션이 아니므로(레코드들은 서로 무관한 독립 커밋) ①② 아래에서 안전하다. §10 T-크래시가 "fsync 직전 kill → 절단 or 승격 둘 다 허용, 부분(배치 일부) 승격 금지"를 고정한다.

### 2.7 relaxed 티어 — 미래 소비자용 별도 스트림 (결정 + 트레이드오프 논증)

미래 relaxed 소비자가 로그에 얹힐 때는 커밋 스트림과 **별도 파일**(`<seg>.relaxed.ndjson`)로 격리한다. **지정된 첫 소비자(예정): §6.F 실행자 하트비트**(주기적·손실허용 신호 — 델타 ⑧, §5) 및 비신뢰 ASP 표시힌트(§6.K). 대안 비교:

- **(a) 커밋 스트림 공유 + 부트 전줄 검증/격리**: fsync 안 된 relaxed 줄이 커밋 배치 사이에 끼면, §2.6의 "최초 불량에서 절단" 규칙이 불량 relaxed 줄 **뒤의** 레코드까지 폐기하게 만들거나, 규칙을 "불량 줄 스킵+계속"으로 약화시켜 커밋 프리픽스 보장 논증을 복잡화한다. 또한 relaxed는 고빈도 후보(하트비트 주기 신호, ASP 페인당 4/s rate cap × N페인 — 로드맵 §6.K)라 커밋 세그먼트의 롤·컴팩션·replay 전부를 노이즈로 오염시킨다.
- **(b) 별도 스트림(채택)**: 커밋 스트림의 "손상 ⊆ 최후 배리어 이후" 불변식과 §2.6 절단 규칙이 그대로 보존된다. relaxed 스트림은 부트 시 파싱-가능한-줄만 채택·불량 줄 개별 스킵(손실 허용이 relaxed의 정의). 표시 순서는 lamport로 병합(이미 전역 시계 보유). 비용은 롤 에폭당 파일 1개 추가 — Q1엔 생성 자체가 없다.

**Q1 구현 범위**: 커밋 스트림만. relaxed 스트림은 경로 규약과 이 절의 계약만 예약(파일 미생성).

### 2.8 롤 정책

활성 세그먼트 크기 > 4MB이면 다음 append 전에 새 세그먼트(`{n+1}.ndjson`)를 생성하고 manifest.activeSegment를 `durableAtomicWrite`로 갱신. 레코드는 세그먼트 경계를 넘지 않는다(한 줄은 한 세그먼트 안에서 완결). 배치도 세그먼트 경계를 넘지 않는다(롤은 배치 경계에서만 — batchStartOffset이 항상 단일 파일 내 좌표이도록). **롤 직후 크래시(빈 신규 세그먼트 잔존, manifest 갱신 전/후 무관)는 §3의 스캔-기반 부트가 흡수한다** — manifest가 뭐라 하든 부트는 디렉토리 실체를 스캔하므로, orphan 세그먼트(생성됐으나 manifest 미갱신)는 자연 채택되고 빈 활성 세그먼트가 first-boot로 오인되지 않는다. 4MB는 §6.E "세그먼트 4MB 롤"과 정합, §6.E "세션당 캡 256MB LRU"는 §9 컴팩션이 담당.

---

## 3. lamport 시계

### 발급 지점 (어느 코드 경로)

`AppendOnlyLog.append(envelope)` 내부의 짧은 임계구역. 데몬 전역 카운터 `hwmLamport`, `hwmSeq`는 **마지막 사용값(max)** 을 보관하고, append 원자단위 안에서 `++hwm`(pre-increment)로 다음 값을 발급한다 — 부트 복원값이 max일 때 첫 신규값이 정확히 max+1이 된다(v1 오프바이원 수정, 패널 C10). 기존 `withChannelLock`(`ChannelService.ts:1829-1848`, per-channelId 프로미스 체인)은 **projection 일관성**(collect→apply→persist)을 위해 유지하되, "persist" 단계가 `saveOrFail(전체상태)`(`ChannelService.ts:1885`)에서 `await log.append(envelope)`로 바뀐다. lamport 발급은 append 메서드 내부 뮤텍스가 직렬화하므로 별도 전역 락을 서비스가 들 필요 없다 — 채널 락(projection)과 로그 락(순서)이 계층 분리된다.

정확히: post 경로(`ChannelService.ts:1387` `const seq = channel.nextSeq++`)는 **채널-로컬 seq를 유지**한다(§5 projection이 채널 seq를 계속 소유). envelope.lamport는 그 위에 얹히는 **전역** 순서다. 즉 채널 메시지 1건은 `payload.seq`(채널 로컬, 기존 계약)와 envelope.lamport(전역)를 **둘 다** 갖는다 — 채널 커서/ack(`lastReadSeq`, `channels.ts:102`)는 payload.seq 위에서 불변, 전역 감사/멀티머신은 lamport 위에서 동작.

**커서 계층화 — 로드맵 §6.L 문면 이탈 + 승인 기록(델타 ⑦)**: 로드맵 §6.L은 "per-member 커서·ack·clientMsgId 멱등은 전부 envelope 필드(lamport/idempotencyKey)의 특수화로 흡수"라고 쓴다. 본 설계는 멱등은 실제로 흡수하되(§4), **커서·ack은 흡수가 아니라 계층화**한다(채널-로컬 seq 유지 + lamport는 전역 감사층). 이것은 문면 이탈이며, 오케스트레이터 재정으로 **승인 확정**됐다 — 근거: 로드맵 §6.H 자신이 "커서·ack은 origin별 독립 유지(**전역 커서 발명 금지** — 전역 seq를 시도하면 오프라인 머신 하나가 전체를 막는다)"를 명시하므로, 커서를 lamport(전역 시계)의 특수화로 문자적으로 흡수하면 §6.H와 정면 모순이다. 계층화가 §6.L의 의도(재발명 종식)와 §6.H의 제약(전역 커서 금지)을 동시에 만족하는 유일한 배선이다. 로드맵 문면 정정 제안은 §놀라운점.

### 부트 재구성 (결정: D6+D15 — 디렉토리 스캔, manifest는 힌트)

**별도 카운터 파일 없음. manifest도 정본이 아니다.** 부트 절차:

1. `events/` 디렉토리에서 세그먼트 파일(`\d{8}\.ndjson`)을 나열, 번호순 정렬. (manifest 부재 시의 분기는 §6.1 — 델타 ③.)
2. **first-boot 판별 = 세그먼트 파일이 0개일 때만.** (마이그레이션 직후 = 빈 세그먼트 1개 존재 → first-boot 아님 → 4단계의 스냅샷 클램프가 시작값을 준다.)
3. **최고번호의 비어있지-않은 세그먼트**를 §2.6 전방 스캔으로 검증·절단하며 그 안의 `max(lamport)`, `max(origin.seq)`를 재구성해 `hwm`으로 복원. lamport는 단조라 최신 비어있지-않은 세그먼트가 최고값을 담는다(전체 스캔 불필요). 최고번호 세그먼트가 **비어 있으면**(롤 직후 크래시) 그 직전 비어있지-않은 세그먼트로 내려가 재구성한다 — v1의 "빈 tail→hwm 초기화" 규칙은 롤 직후 크래시에서 lamport/seq를 리셋(역행+재사용, §6.L 함정 위반)시키므로 폐기(패널 A3).
4. **하한 클램프**: `hwm = max(hwm, snapshotLamport)` — 스냅샷(durable, §2.3)이 참조하는 lamport보다 낮게 복원되는 일이 없도록. (세그먼트가 전부 컴팩션-절단됐고 스냅샷만 남은 경계 케이스 커버.)
5. manifest.activeSegment는 **힌트**로만 참고 — 실체와 다르면(orphan 세그먼트 등) 스캔 결과로 재작성(`durableAtomicWrite`).

이것이 §6.L 함정 "재시작 시 마지막 영속 값+1에서 재개(디스크 라운드트립 필수, 인메모리 리셋 금지)"의 충족 형태다: 스캔이 라운드트립이고, hwm=max 복원 + pre-increment가 "+1 재개"다. 사이드카 카운터(`lamport.meta`)를 두지 않는 이유: 로그와 카운터가 불일치하는 클래스(카운터만 flush되고 로그는 안 됨, 또는 그 역)를 원천 차단 — 단일 정본 원칙. 진짜 first-boot(세그먼트 0개, 마이그레이션이 genesis 베이스라인 lamport=0을 마킹)면 hwm=0에서 시작, 첫 append가 lamport=1.

### daemonEpoch = CHANNELS_EPOCH 재사용의 정확한 형태 (결정: D8)

`origin.daemonEpoch = CHANNELS_EPOCH`(`channels.ts:308`, 현재 값 1). **순서에 관여시키지 않는다** — provenance(어느 스키마 세대가 이 레코드를 썼나) 스탬프 전용이다. 순서 단조는 lamport+origin.seq가 이미 보장한다(D6). 형태:
- 매 envelope에 현재 `CHANNELS_EPOCH` 상수값을 그대로 스탬프.
- `CHANNELS_EPOCH`는 채널 스키마 마이그레이션이 렌더러 정정의 선행조건일 때만 bump(`channels.ts:301-307`) — 즉 부트마다 변하지 않는다.
- **(machineId, origin.seq)가 부트 경계를 넘어 전역 유일**하므로(origin.seq는 영속 단조·비리셋, D6/D7; machineId 생애는 §8) daemonEpoch가 부트 incarnation을 구별할 필요가 없다. 이것이 로드맵의 "daemonEpoch=CHANNELS_EPOCH"와 §6.H의 유일성 요구를 동시에 만족시키는 배선이다.

> **함정(§6.L 3-3 lamport 영속 재개 관련):** "인메모리 리셋 금지"를 지키려면 lamport hwm이 **로그 append 원자단위 안에서만** 증가해야 한다. append가 실패(`append()`→false, §2.4)하면 배치의 hwm들은 이미 소비됐는데 레코드는 디스크에 없다(배치 롤백이 제거) → 다음 성공 append가 그 lamport들을 건너뛴다(gap). gap 자체는 순서(단조)를 깨지 않으므로 **허용**하되, "재사용은 금지"가 불변식이다. 구현: 배치 실패 시 hwm을 **되돌리지 않는다**(gap 감수, 재사용 금지). 채널 post의 롤백(`ChannelService.ts:1441-1462`)은 projection(nextSeq/messages)만 되돌리고 lamport hwm은 안 건드린다. (at-least-once 승격(§2.6)과의 정합: 승격된 레코드의 lamport는 스캔이 hwm에 반영하므로 재사용 불가 불변식이 유지된다.)

---

## 4. idempotency 흡수

### 채널 clientMsgId LRU → envelope idempotencyKey 통일 경로

현행 채널 멱등의 정확한 형태:
- 인메모리: `Map<channelId, Map<compositeKey, {seq, lastUsedAt}>>` (`ChannelService.ts:329`), LRU cap `CHANNEL_IDEMPOTENCY_CAP=1000`/채널 (`channels.ts:392`, evict `ChannelService.ts:1432,1851-1858`).
- compositeKey = `JSON.stringify([workspaceId, clientMsgId])` (`ChannelService.ts:1924`) — sender-scoped(A11: 예측가능 clientMsgId의 교차-sender 충돌 차단).
- 영속: `Record<channelId, Record<compositeKey, seq>>` (`channels.ts:247`), 부트 hydration `ChannelService.ts:412-425`.
- tail-evict 연동: 히스토리가 `CHANNEL_MESSAGES_MAX=5000` 초과로 잘리면 잘린 seq를 가리키는 멱등 엔트리도 드롭(`ChannelService.ts:1514-1533`).

통일:
- `envelope.idempotencyKey`가 이 compositeKey를 **일반화**한다. 채널: `idempotencyKey = JSON.stringify([workspaceId, clientMsgId])` 그대로. A2A: task 생성/전이의 clientMsgId(§6.F, §6.D 승인 멱등 `(approvalId,deviceId,nonce)`도 이 필드로 흡수 — 로드맵 §6.D "§6.L envelope idempotencyKey로 흡수" 명시).
- **멱등 인덱스는 로그의 projection**이다: append 전에 `(domain, streamId, idempotencyKey)` LRU를 조회, hit이면 append 없이 원본 결과 반환(현행 post의 replay 반환 `ChannelService.ts:1220 부근`과 동형). streamId = 채널은 channelId, A2A는 taskId(또는 receiverWs).
- 인덱스 재구성: 부트 시 (스냅샷에 임베드된 멱등맵) + (로그 tail replay)로 복원, cap 1000/stream. 현행 hydration(`ChannelService.ts:412-425`)과 동일 위치·동일 바운드. **at-least-once 연결(D17)**: §2.6의 승격 레코드도 replay를 거쳐 인덱스에 들어가므로, 실패를 본 호출자의 재시도가 승격 원본과 중복 커밋되지 않는다 — 이 인덱스가 승격 안전 논증 (a)의 기반이다.

### 기존 LRU 시멘틱(크기·수명)이 로그 기반에서 어떻게 되나 (결정: 불변)

- **크기**: `CHANNEL_IDEMPOTENCY_CAP=1000`/stream 유지. cap은 메모리 바운드일 뿐 정본이 아니다(정본은 로그).
- **수명**: 업무 멱등키는 그 이벤트가 **미컴팩션 로그 윈도** 안 또는 **현재 스냅샷 참조** 동안 유효. 로그 컴팩션(§9)이 오래된 세그먼트를 절단하면 그 안의 멱등키도 만료 — 현행 tail-evict가 잘린 seq의 멱등 엔트리를 드롭하는 것(`ChannelService.ts:1514`)과 **정확히 동형**. 즉 "충분히 오래된 재시도는 새 이벤트로 취급"이라는 현 시멘틱이 그대로 이어진다. cross-restart 재시도가 스냅샷/tail 윈도 안이면 흡수(현행 R9 hydration이 보장하던 것), 윈도 밖이면 1회 중복(현행도 동일 — pre-upgrade bare key 스킵 케이스 `ChannelService.ts:415-421`가 이미 이 잔여를 문서화).

---

## 5. projection 계약

### channels.json의 지위 (결정: D1 — 스냅샷 캐시로 강등, 삭제 아님. 논증)

**§3.2 P2는 "정본=로그"를 요구하고, 이 설계는 그것을 지킨다.** 로그가 정본이고 `channels.json`은 로그에서 **재파생 가능한** 스냅샷 캐시로 강등된다(삭제하면 부트가 O(full-history) replay가 되므로 유지). 동시에 마이그레이션 리스크와 균형을 잡는다:

- **왜 big-bang 강등이 아닌가**: `channels.json` 경로는 미묘한 crash-safety를 축적했다 — collect→apply→persist→rollback(`ChannelService.ts:1441-1462`, ack `1661-1672`), saveImmediate/saveDebounced race recovery(`ChannelStateWriter.ts:142-160`), empty-channel reaper(`ChannelStateWriter.ts:213-247`), prototype 가드. 이걸 한 번에 버리면 회귀 표면이 거대하다.
- **균형점 — 프라이머시 반전을 단계적으로**: 커밋 지점을 `saveOrFail(전체상태)`에서 `log.append(envelope)`로 옮긴다(로그가 정본). 그 직후 in-메모리 projection 갱신, 그리고 `channels.json`은 **debounced 스냅샷**으로 강등(saveImmediate → 로그 append가 대체, saveDebounced 스냅샷은 부트 가속용). 부트: 스냅샷 로드 → `lamport > snapshot.snapshotLamport`인 로그 레코드만 replay(바운드된 catch-up). 이로써 (a) P2 준수(스냅샷은 파생물·삭제가능), (b) 마이그레이션 리스크 바운드(읽기 모델·reaper·검증기가 스냅샷 위에 그대로 생존), (c) post당 O(total) 재직렬화 DoS 소멸(`channels.ts:394-400`)을 동시 달성.

즉 **정본 유지+로그 감사용의 반대** 방향으로 결정한다: 로그가 정본, channels.json이 캐시. 단 "big-bang 교체"가 아니라 "커밋 지점만 로그로 이동, 스냅샷 경로는 부트 가속기로 잔존"이라는 단계적 반전이라 리스크가 낮다.

### ChannelService 재배선 방식

- 각 mutation(create/join/leave/archive/invite/kick/post/ack)의 마지막 `saveOrFail()`(`ChannelService.ts:682,746,848,896,979,1039,1147,1441,1661`)을 `await log.append(makeEnvelope('channel', payload))`로 교체. **1 RPC = 1 envelope**(post 1건 = append 1건 — §2.6 부분승격 금지 논증 ②의 근거). **append는 boolean을 반환**(D16, §2.4)하므로 기존 `if (!this.saveOrFail())` 패턴이 `if (!(await log.append(...)))`로 형태 보존된다 — append 성공(true) = 커밋(= 현행 saveImmediate 성공과 동일 의미).
- collect→apply→**append**→rollback: append가 false를 반환하면(배치 롤백 완료 상태) 현행 롤백 로직(`ChannelService.ts:1441-1462`)이 그대로 in-메모리 projection을 되돌림. lamport hwm은 안 되돌림(§3 함정). at-least-once 잔여(롤백했는데 크래시로 줄이 생존 → 재부트 부활)는 §2.6-(c) 계약.
- 채널 payload.seq/lastReadSeq/recipientSnapshot/mentions 등 하위 계약(`channels.ts:75-227`) **전부 불변** — envelope는 그 아래층이다(스코프 경계 준수).
- 스냅샷 write: mutation 후 `snapshotWriter.saveDebounced(projection)` (기존 `ChannelStateWriter.saveDebounced` `ChannelStateWriter.ts:121` 재사용, 파일만 `snapshot/channel.json`). 스냅샷 flush의 durable 경로는 §2.3.

### A2A(§6.F)는 처음부터 envelope 위 (결정: D11)

신규 소비자라 레거시 부채가 없다 — **projection-first로 짓는다**:
- 데몬 `A2aTaskService` 신설(채널 미러링): per-task mutex, `domain:'a2a'` append, `VALID_TRANSITIONS` 서버강제(`types.ts:654-661` 이관 — 성공 종단 상태는 `'completed'`다, `types.ts:624`; 로드맵 §6.M P1의 'done' 표기는 문면 정정 대상 → §놀라운점), 멱등 LRU(§4), DoS 캡(태스크 5000 등 채널 상수 재사용).
- pipe 핸들러 `a2a.task.*`를 렌더러 passthrough(`a2a.rpc.ts:242-243` `sendToRenderer`)에서 **데몬 직결**로. 렌더러 `a2aSlice`(`a2aSlice.ts:29,89`)는 캐시 강등(30분 GC `a2aSlice.ts:8-9,289`는 캐시 GC로 의미 재정의, 정본은 로그).
- **실행자(ClaudeWorker) 전이 경로 재배선 필수(패널 C12)**: `ClaudeWorker.updateTaskStatus`(`ClaudeWorker.ts:155`)는 현재 `sendToRenderer(..., 'a2a.task.update', ...)`(`ClaudeWorker.ts:162`)로 렌더러 스토어에 직행한다 — working/failed/completed 전이가 전부 이 경로다(`ClaudeWorker.ts:44,49,106,114,146`). a2aSlice를 캐시로 강등한 뒤 이 경로를 그대로 두면 **실행자 전이가 데몬 로그에 영영 도달하지 않아 정본이 어디에도 없게 된다**. 데몬 직결 RPC(파이프 경유 `A2aTaskService` append)로 재배선한다(§10 목록·PR4).
- 마이그레이션: 부트 시 렌더러 인메모리 → 데몬 1회 시드(§6.F). 단 A2A는 원래 비내구라 "유실해도 됨"이 기존 계약(30분 GC) — 시드는 best-effort.
- **execute의 2-프로세스 문제(§6.F, R14) — Q1은 스키마 수용만(델타 ⑧ 정정)**: task 상태는 데몬 로그로, 실행자(ClaudeWorker)는 Main 잔존(`src/main/a2a/ClaudeWorker.ts:21,37,58`이 `claude` CLI spawn — 프로세스 경계 유지). 데몬이 task를 stale 강등하는 순간 Main 워커가 살아있을 수 있다 = 분산상태 문제. **본 설계의 몫은 1급 "스키마 수용"이다**: `domain:'a2a', payload.kind:'executor-lifecycle'`(spawn/heartbeat/exit)과 `fenceToken` 필드를 payload 스키마에 예약한다 — **실제 기록·화해 프로토콜 구현은 §6.F/Q1-4의 몫**이다. v1.1의 "1급 기록" 표현은 §2.5의 "Q1 커밋 단일 티어(relaxed 공집합)"와 상충했다(하트비트는 주기적 손실허용 신호 — fsync 커밋 스트림에 넣으면 공집합 주장 붕괴 + fsync 낭비): **하트비트는 §6.F 구현 시점에 §2.7 relaxed 스트림의 첫 소비자로 지정 예정**이고, spawn/exit(저빈도·커밋 가치 있음)만 커밋 스트림 후보다 — 그 배정 확정도 §6.F에서.

### projection 재구축(replay) 비용 + 스냅샷 전략

- **정상 부트**: 스냅샷 로드 + `lamport > snapshotLamport` tail replay. replay 양은 마지막 스냅샷 이후 이벤트뿐 → 스냅샷 주기가 상한을 결정(§9). O(스냅샷 이후 Δ).
- **폴백 체인(D14+델타 ④⑤로 완결·정직화)**: 최신 스냅샷 → `.bak` 체인(`core.ts:343-356`) → **최근 reseed 스냅샷(§6.4c, 있으면)** → **genesis + 잔여 로그 replay**. v1의 "스냅샷 손상 → 전체 replay"는 D2 하에서 거짓이었다(레거시가 로그에 없음) — genesis가 바닥이 되며 참이 됐고(v1.1 A2), v1.2는 그 서사의 컴팩션 경계를 마저 정직화한다(델타 ⑤): **"완전 복구"는 스냅샷 체인(최신/.bak/reseed) 중 최소 1개 생존을 전제**한다. 스냅샷 체인 전손 시 genesis+잔여 로그가 복구하는 범위는 "마이그레이션-전 상태 + **컴팩션으로 절단되지 않은** 로그 구간"이다 — 절단된 구간은 스냅샷에만 존재했으므로 복구 불가(§9). 컴팩션 전이라면 완전 복구다.
- **스냅샷 트리거**: (a) N개 이벤트마다 또는 (b) 세그먼트 롤 시. 스냅샷 = projection 직렬화 + `snapshotLamport` 마커, **`durableAtomicWrite`로 기록(§2.3)**. 스냅샷이 내구화되면 그 lamport 미만 세그먼트는 컴팩션 후보(§9, 단 감사용 1버전 보존 + genesis·reseed 절대 제외).

---

## 6. 무중단 마이그레이션

### 6.1 부팅 시퀀스 구체 절차 (감지→변환→검증→활성, 델타 ③⑥ 반영)

데몬 부트에서 writer.load()가 서비스 생성자에 꽂히는 지점(`index.ts:2727` `new ChannelStateWriter`, `2769` `new PrincipalStateWriter`)에 마이그레이션 게이트를 선행 배치(pipe serve 전, `acquireLock` `index.ts:511` 이후).

1. **감지 — manifest 존재 시**: 유효 manifest → 로그 활성 모드(§3 스캔-부트 + §5 스냅샷/replay; manifest는 힌트, 실체는 스캔 — D15). **manifest 부재 시 3분기(델타 ③ — v1.1의 "스캔이 로그 모드 복원" 단일 규칙을 대체)**:
   - **(a) 세그먼트 0개** → first-boot 또는 레거시 마이그레이션(2단계로).
   - **(b) 세그먼트 존재하나 전부 빈 것 + genesis 스냅샷 검증 성공** → 2~3단계 크래시 잔해다(빈 세그먼트 생성과 manifest write 사이). **manifest 재구성만으로 마이그레이션 완결**(재변환 불필요) — D15 first-boot 판별("세그먼트 0개일 때만")과의 충돌이 이 분기로 해소된다.
   - **(c) 그 외(비어있지-않은 세그먼트 + manifest 부재 = 정상 경로로 도달 불가능한 비정상)** → 해당 세그먼트를 `events/quarantine/`으로 **격리(보존, 삭제 아님** — 기존 quarantine 관례 재사용: `core.ts:316-337`의 validate-실패 격리 핸드오프, `src/daemon/util/atomicWrite/quarantine.ts`) 후 레거시 재시도. fail-safe: 설명 불가능한 상태에서 조용히 로그 모드로 진행하지 않는다. 유의 — §2.3 win32 잔여(최초 manifest rename 비내구)가 첫 append 후 전원손실과 겹치면 이 분기로 떨어질 수 있다: 격리는 보존이므로 데이터 손실은 아니며, 수동 복구 절차 대상으로 로그에 명시 고지한다.
   - **재시도 멱등성**: (a)(c)에서의 재마이그레이션은 기존 빈 세그먼트·genesis·machine-id를 안전하게 덮어쓴다(machine-id는 기존 값 재사용, §6.1-2) — genesis의 "불변" 계약(§6.2)은 **manifest 활성(4단계) 이후**부터 발효되므로 완결 전 재작성은 계약 위반이 아니다.
2. **1회 변환(결정: D2 — O(1)) + machine-id(델타 ⑥)**: 레거시 `channels.json`을 기존 `atomicReadJSONSync`+migrator(`ChannelStateWriter.load()` `ChannelStateWriter.ts:193`)로 읽어 **`snapshot/genesis-channel.json`으로 기록(D14, `durableAtomicWrite`)**, `snapshotLamport=0` 마킹, **`events/machine-id` 민팅·durable화(§8 — 기존 파일 있으면 재사용, 재민팅 금지)**, **빈 로그 세그먼트** 생성(+디렉토리 fsync). 순서 불변식: **machine-id durable → manifest write**(manifest가 machineId를 참조하므로, §2.1). machine-id만 있고 manifest 없는 크래시 창은 1-(a)/(b) 분기가 자연 흡수한다(machine-id 존재 시 재사용). 히스토리를 per-message envelope로 재합성하지 **않는다** — 레거시 상태가 곧 lamport 0의 projection 베이스라인이고, 로그는 마이그레이션 후 신규 이벤트만 lamport≥1로 기록(경계 계약은 §6.3).
3. **검증**: 방금 쓴 genesis를 검증기(`ChannelStateWriter.isChannelState` `ChannelStateWriter.ts:307`)로 재로드해 라운드트립 확인. 실패 시 마이그레이션 **중단**(레거시 파일 무손상 — 2단계는 READ만 했고 레거시를 안 지움).
4. **활성**: `manifest.json`(formatVersion, machineId, genesisRef, snapshotLamport, activeSegment)을 **`durableAtomicWrite`(§2.3)** 로 write = "마이그레이션 완료" 표식. v1이 이 지점을 fsync 없는 `atomicWriteJSON`에 얹었던 것이 패널 최우선 결함(A1)이었다 — manifest rename이 전원손실에 비내구면 재부트가 레거시를 재감지·재마이그레이션하고, 그 사이 fsync로 커밋된 마이그레이션-후 이벤트(사용자에게 acked)가 새 로그 계보 밖에 고아로 남는다. durable manifest + 1단계 3분기의 이중 방어로 이 창을 닫는다.

principals.json은 §6.5(로그 도메인 제외 — 독립 계약).

**구포맷 읽기 폴백 1버전**: 기존 `.bak` 폴백 체인(`core.ts:343-356`, primary→.bak→.bak.1..3)과 premigrate 스냅샷(`.v{n}.premigrate.bak` write-once, `migrate.ts:182-207`)이 "구포맷 읽기" 기계를 이미 제공한다. 마이그레이션은 레거시 `channels.json`을 **삭제하지 않고** 유지(§6.4 dual-write의 대상이기도 함).

**실패 시 롤백 안전**: 2단계 변환은 레거시를 **READ만** 하고 신규 파일만 WRITE. 크래시 mid-convert → manifest 미기록 → 다음 부트가 1단계 3분기로 감지·재시도(멱등). 3단계 검증 실패 → 중단, 레거시 유지. **데이터 손실 0.**

### 6.2 genesis 스냅샷 — 불변 보존 계약 (결정: D14)

- `snapshot/genesis-channel.json`은 마이그레이션 완결(manifest 활성) 시점부터 **원본 그대로 영구 불변**: 이후 어떤 스냅샷 갱신·컴팩션·reaper도 이 파일을 수정·삭제하지 않는다. manifest.genesisRef가 영구 참조. (완결 전 재시도 덮어쓰기는 §6.1-1 재시도 멱등성 참조.)
- 역할: §5 폴백 체인의 바닥. 최신 스냅샷·`.bak`·reseed 전손 시 **genesis + 잔여 로그 replay**로 마이그레이션-전 상태 + 미절단 로그 구간을 복구한다(컴팩션 절단분 제외 — §5·§9, 델타 ⑤ 정직화).
- reseed 스냅샷(`snapshot/reseed-{n}.json`, §6.4c)은 genesis와 **동급 불변·컴팩션 제외** — "구-데몬 구간의 genesis"다.
- §10 T-genesis: `snapshot/` 디렉토리에서 genesis 외 전손 주입 → genesis+잔여 replay로 레거시 데이터 포함 복구 검증(컴팩션 전 = 완전, 후 = 절단분 제외).

### 6.3 D2 경계 계약 — §6.E/§6.H 소비자를 위한 정직화

D2("재합성 안 함")의 대가를 소비자 계약으로 명시한다(패널 A2 — v1의 "잃는 것 없다" 서사 정정):
- **causalRefs는 마이그레이션-전 메시지를 참조할 수 없다** — 그 메시지들엔 eventId가 없다(genesis 안의 채널-로컬 seq 좌표만 존재).
- **전역 lamport 순서·provenance 그래프는 마이그레이션 경계에서 단절된다** — §6.E 리플레이는 lamport 1 이전으로 시킹할 수 없고(genesis는 불투명 베이스라인), §6.H 멀티머신 병합·통합 감사는 마이그레이션-전 이벤트를 개별 레코드로 볼 수 없다.
- 마이그레이션-전 히스토리의 보장 수준은 "**projection 상태로서 보존**(genesis + 채널 payload.seq 좌표)"이며 "envelope 이벤트로서 보존"이 아니다. §6.E/§6.H 설계는 이 경계를 전제해야 한다. (reseed 스냅샷(§6.4c)의 구-데몬 구간도 동일 성격의 경계다.)

### 6.4 다운그레이드(구 버전 데몬이 신 포맷을 만났을 때) — 3기전 (패널 B4 + 델타 ④ 재설계)

구 데몬은 `events/`·manifest를 모르고 `channels.json`을 읽는다. 오버랩 버전 동안 로그 append와 병행해 `channels.json`도 debounced dual-write(saveDebounced, `ChannelStateWriter.ts:121`, 30s)를 유지한다. 잔여 3개(30s stale 창, 데몬 자동 교체(PR #342, 로드맵 §2.2)와의 상호작용, 재-업그레이드 시 구-데몬-기간 쓰기의 무성 유실)를 다음 3기전으로 닫는다:

- **(a) `daemon.ping`에 `eventLogFormatVersion` additive 노출**: ping 핸들러는 `index.ts:1495-1496`(`pipeServer.onRpc('daemon.ping', ...)`)이고 additive 필드 선례가 이미 있다(`index.ts:71` — bootTrace를 ping 응답에 additive로 실은 주석). B′(#342) 자동 교체 로직은 이 값으로 포맷 세대를 인지한다: **구 main이 신 포맷 데몬을 만나면(자기가 모르는 formatVersion) 재사용도 교체도 하지 않고 fail-closed**(사용자 고지 배너) — 구 데몬을 신 로그 위에 조용히 앉히는 최악 경로를 차단. 필드 부재(구 데몬) = 레거시 세대로 해석.
- **(b) graceful shutdown 시 dual-write 스냅샷 강제 flush + durable**: `daemon.shutdown` RPC(`index.ts:1972-1975` — "the handler runs the full shutdown body (dumps, ...)")와 시그널 종료 경로에서 `channels.json` dual-write를 `flushSync`(기존 `ChannelStateWriter.flushSync` `ChannelStateWriter.ts:266-287` 재사용) + durable 승격(§2.3)으로 강제한다. 자동 교체(#342)는 graceful shutdown을 경유하므로, **교체·정상종료 다운그레이드에서 30s stale 창이 0이 된다.** 크래시 다운그레이드만 debounce 창 잔여(현행 saveDebounced와 동급).
- **(c) 재-업그레이드 부트 가드 + legacy-reseed (델타 ④ 재설계 — 워터마크 + reseed 스냅샷)**:
  - **v1.1 mtime 가드 폐기(오발동 결함)**: `channels.json mtime > 로그 최신 wallClock` 비교는 **신 데몬 자신의 dual-write/shutdown flush가 mtime을 미는 것**과 구 데몬 쓰기를 원리적으로 구별하지 못한다 — dual-write는 append **후** debounce로 파일을 쓰므로 mtime은 정상 운영에서도 항상 마지막 로그 이벤트보다 뒤다 → 오버랩 기간 **매 정상 재시작마다 reseed 오발동** = 허위 감사 이벤트 양산(정직성 에토스 위반).
  - **대체 = 워터마크**: 신 데몬의 dual-write는 `channels.json` 안에 additive 필드 `eventLogWatermark: { lamport, stateHash }`를 심는다 — `lamport` = 이 파일에 마지막으로 반영된 로그 hwm, `stateHash` = 워터마크 필드 자신을 제외한 상태 직렬화의 해시. **stateHash가 필수인 이유(구현 사실)**: 구 데몬의 load→save 왕복은 미지의 최상위 필드를 **보존**한다 — `isChannelState` 검증기는 version/컨테이너/spot-check만 보고 추가 필드를 거부하지 않으며(`ChannelStateWriter.ts:307-369`), `saveImmediate(state)`는 로드된 객체를 통째 재직렬화한다(`ChannelStateWriter.ts:103-118`). 따라서 구 데몬이 mutation 후 저장해도 lamport 워터마크 값은 옛값 그대로 살아남아, lamport 비교 단독으로는 "전진"을 감지할 수 없다. stateHash는 내용이 바뀌는 순간 불일치하므로(구 데몬은 hash를 재계산할 줄 모른다) **"워터마크 이후 내용 전진 = 구 데몬 쓰기"의 유일하게 신뢰 가능한 증거**가 된다.
  - **부트 판정**: `stateHash` 일치(= 파일 내용이 신 데몬이 마지막으로 쓴 그대로) → 무변경, reseed 없음 — 정상 재시작 오발동 0. `stateHash` 불일치(또는 워터마크 필드 자체 부재 — 구 데몬이 신 포맷 도입 전 파일로 되돌린 케이스) → 구-데몬-기간 쓰기 증거 → reseed.
  - **reseed = 스냅샷, 이벤트가 아니다(Codex 지적 반영)**: v1.1처럼 로그에 요약 델타 이벤트만 남기면 최신 스냅샷 손상 시 구-데몬 구간을 genesis+replay로 재구성할 수 없다(그 구간은 로그에 없으므로). 대신: ① `channels.json`의 현재 상태로 **`snapshot/reseed-{n}.json`을 `durableAtomicWrite`** (genesis급 불변, manifest.reseedRefs에 등록, 컴팩션 절대 제외 — §6.2·§9) ② 로그엔 **reseed 마커 이벤트**(`domain:'channel', payload.kind:'legacy-reseed'`, reseed 번호·stateHash·감지 시각)만 append — 감사 가능하되 상태 운반은 스냅샷이 담당 ③ 활성 projection 스냅샷도 reseed 상태로 재작성(snapshotLamport = 마커의 lamport). 이후 replay는 `lamport > snapshotLamport`만 적용하므로 reseed 이전 로그 이벤트(이미 dual-write에 반영돼 있던 것)와 이중 적용되지 않는다. 폴백 체인 편입: **최신 → .bak → 최근 reseed → genesis**(§5).
  - 손실 범위는 (b)의 크래시 잔여(≤30s)뿐이며, reseed 마커에 감지 사실이 기록되어 **무성이 아니다**.

### 6.5 principals.json 계약 (결정: D12 — 독립 계약 절, 승인 확정)

**로드맵 §6.L 문면과의 편차(명시)**: §6.L 함정 절은 "기존 `channels.json`/`principals.json` 마이그레이션은 무중단이어야 한다"로 두 파일을 함께 묶었으나, 본 설계는 principals를 **로그 도메인에서 제외**한다. domain enum에 'principal'을 추가하지 않는다(additive-only + 스코프 규율). 이 편차는 **오케스트레이터 승인 확정**(§열린질문 뒤 판정 기록).

- **근거**: principal은 이벤트 히스토리가 아니라 **현재상태 레지스트리**다 — 렌더러 agent detection이 upsert의 원천이고, 데몬 재시작 시 전 pane-agent가 stale로 백필되며 렌더러 재등록만이 live로 되돌린다(`principals.ts:11-15`). 손실이 비파국임을 로더가 명문화한다(`PrincipalStateWriter.ts:133-135` — "loss is not catastrophic — it is restored by renderer re-registration"). upsert/markStale 스트림을 replay하는 것보다 렌더러 재등록이 항상 더 신선하다 — 로그화의 이득이 0이다.
- **다운그레이드 동작**: principals.json은 로그 전환의 영향권 밖이므로 구/신 데몬이 같은 파일을 같은 계약으로 읽고 쓴다 — §6.4의 어떤 기전도 필요 없다(자명 호환).
- **렌더러 재등록 전 라우팅 저하(기존 동작 유지)**: 재시작 직후 stale 기간에는 wake worker의 `livePtyIdOf` 조회가 undefined를 반환하고 기존 slug 휴리스틱으로 폴백한다(`index.ts:2780-2782` — "A stale principal returns undefined and falls back to the existing slug heuristic"). 로그 전환이 이 저하 창을 늘리지도 줄이지도 않는다 — 이것이 계약이다.
- **실패 테스트를 계약으로**: §10 T-principal — principals.json 손상/삭제 주입 시 ① 채널/A2A projection·로그 무영향 ② 빈 레지스트리로 degrade(`PrincipalStateWriter.ts:153-155`) ③ 렌더러 재등록으로 복원, 을 검증한다.

> **함정(§6.L 3-1 무중단 마이그레이션):** manifest write(6.1-4단계)와 첫 신규 append 사이 크래시 → manifest 있음 + 빈 로그 + genesis만 존재 = 정상(스캔-부트가 genesis 로드 + 빈 replay = 레거시 상태 복원). manifest write 자체는 durableAtomicWrite(tmp fsync+rename+dir fsync)라 torn/비내구 manifest 불가(win32 잔여는 §2.3 — §6.1-1 3분기가 흡수). 순서 불변식: **genesis(durable)·machine-id(durable)·빈 세그먼트 생성·검증 성공 → 그 다음에만 manifest write.** manifest가 마지막 커밋 지점이되, 부트는 manifest를 힌트로만 쓴다(D15 — 이중 방어).

---

## 7. authContext

### principalId / verifiedWorkspaceId 스탬핑 지점 (누가 신뢰 가능하게 채우나)

**데몬 경계에서 스탬프하되, 신뢰 앵커는 기존 `verifiedWorkspaceId` 서버핀 관례를 그대로 계승한다.** 현행 배선(인용):
- `verifiedWorkspaceId`는 `a2a.channel.rpc.ts`의 `forward()`가 **서버 해석값으로 덮어쓴다**(`a2a.channel.rpc.ts:84,96,180-183` — "stamp the server-resolved workspace over ANY client-supplied verifiedWorkspaceId"). 해석 불가 + mutating이면 fail-closed(`a2a.channel.rpc.ts:185-193`). → envelope.authContext.verifiedWorkspaceId는 **이 서버핀 값을 그대로** 담는다. 위조 불가능한 유일 authz 앵커.
- `principalId`는 pipe/MCP 발신자로부터 **strip**된다(`a2a.channel.rpc.ts:108-120` — "principalId is a renderer-only field ... strip the forgeable copy"). 정당한 principalId는 GUI `channels:mutate-local` 경로만 운반(`a2a.channel.rpc.ts:106-107`). → authContext.principalId는 데몬이 **서버측에서** 채운다: verifiedWorkspaceId + (해석된 senderPtyId → principal 레지스트리 조회, `livePtyIdOf` 역방향 `index.ts:2782`, `panePrincipalId` `principals.ts:39-41`)로 결정. 발신자 주장값을 신뢰하지 않는다.
- 예약 신원 가드 계승: `local-ui`(`HUMAN_MEMBER_ID` `channels.ts:293`)·`ws-human`(`HUMAN_WORKSPACE_ID` `channels.ts:287`)의 pipe 스푸핑은 이미 거부(`a2a.channel.rpc.ts:145-178`). envelope도 이 가드 하류에서만 스탬프.
- 트러스트 경계 불변식(`principals.ts:5-8`, `channels.ts:113-114`): **principalId/memberId = display/routing, authz 아님. authz는 verifiedWorkspaceId.** authContext는 이 경계를 envelope에 명문화 — trustTier/principalId는 라우팅·표시·감사, verifiedWorkspaceId만 권한 판정.

### trustTier 값 정의 (§6.K 4등급 매핑)

`type TrustTier = 'trusted' | 'semi-trusted' | 'heuristic' | 'untrusted';` — §6.K 4등급(신뢰/준신뢰/휴리스틱/비신뢰)과 1:1.

| trustTier | 의미 | Q1 매핑(코드 근거) |
|---|---|---|
| `trusted` | 프로세스 신원 검증됨 | 서버핀 verifiedWorkspaceId 해석 성공(`a2a.channel.rpc.ts:180-183`) + 렌더러 process-boundary(`channels:mutate-local`). §6.K "integrations 훅 브리지·SDK 방출" |
| `semi-trusted` | 우리가 spawn/env-hint로 PID 검증 | env-hint 폴백 신원, `wmux run --asp` 래퍼(§6.K ②). Q1엔 주로 A2A execute(우리가 spawn한 ClaudeWorker `ClaudeWorker.ts:58`) |
| `heuristic` | 신뢰신호 부재 시 추론 | AgentDetector 스루풋 휴리스틱(§6.K). envelope 스탬프는 데몬이 신뢰신호 없을 때 부여 |
| `untrusted` | raw/미검증(표시전용) | mutating에서 verifiedWorkspaceId 해석 실패는 애초에 fail-closed(`a2a.channel.rpc.ts:185`)이므로 로그에 안 남음. untrusted는 §6.K 비신뢰 raw OSC ASP(표시전용) 도메인 전용 — Q1 채널/A2A 커밋경로엔 미출현 |

Q1 스코프(채널+A2A)에서 커밋되는 envelope는 사실상 trusted/semi-trusted만이다(untrusted는 fail-closed로 걸러짐). heuristic/untrusted 슬롯은 §6.K ASP 소비자를 위해 스키마에 예약(relaxed 스트림 §2.7과 짝).

---

## 8. 멀티머신 예비

### Q1에서 origin.machineId (결정 — 패널 C8로 생애 계약 확정)

**`events/machine-id`에 1회 민팅되는 UUID, 설치 생애 영구 불변.** 생성·durable화 시점은 **마이그레이션 2단계**(§6.1-2, 델타 ⑥ — 순서 불변식 "machine-id durable → manifest write"). 없으면 `randomUUID()` 생성·영속, 있으면 로드. 리터럴 `'local'` 센티넬을 쓰지 않는 이유: Q4 연합 시 두 머신이 모두 `'local'`이면 `(machineId, seq)` 유일성이 붕괴한다. (getBootId `index.ts:114`는 **부트마다** 바뀌므로 부적합 — machineId는 origin.seq의 비리셋 단조와 짝을 이루는 설치 생애 식별자여야 한다.)

**생애·소재 계약(v1 수정 — 패널 C8)**:
- **machineId는 영구 불변이다. Q4에도 교체하지 않는다.** v1의 "Q4에 키 지문으로 교체"는 `(machineId, seq)` 연속성·유일성 논증을 스스로 깼다(교체 시점 전후의 로그가 다른 machineId 아래 갈라짐). Q4 페어링 신원은 **`origin.keyId`(additive 신규 필드)** 로 분리해 얹는다 — machineId(로그 계보 식별자)와 keyId(암호학적 페어링 신원)는 다른 축이다.
- **소재 = `events/machine-id`, 로그와 동일 fate**: v1처럼 `~/.wmux/machine-id`(로그 밖)에 두면 로그만 소실됐을 때 옛 machineId가 살아남아 hwm이 0부터 재시작 → 소실된 로그의 `(machineId, seq)`들이 **재사용**된다(전역 유일성 붕괴). `events/` 안에 두면 로그 소실 = machine-id 동반 소실 = 재민팅 = **새 origin 계보** — 재사용이 구조적으로 불가능하다.
- **부분 소실 복구**: machine-id 파일만 없고 세그먼트가 살아 있으면, 부트 스캔(§3)이 아무 레코드의 `origin.machineId`에서 값을 복구해 재기록한다(재민팅 금지 — 세그먼트가 곧 증거).

### Q4 활성화 시 바뀌는 것 / 안 바뀌는 것

| | Q1 (예비) | Q4 (활성) |
|---|---|---|
| origin.machineId | 민팅 UUID | **불변 — 교체 금지**(계보 연속성) |
| origin.keyId | 부재 | **additive 신설** — 페어링 Ed25519 키 지문(§6.H), machineId↔keyId 바인딩은 페어링 시 교환 |
| origin.seq | 로컬 append 인덱스 | **불변** — 여전히 로컬 append 인덱스 |
| lamport | 로컬 append마다 ++ | 원격 이벤트 수신 시 `hwm = max(hwm, recv)` 후 ++로 **의미 확장**(§6.H) |
| 커서/ack | 단일 머신 per-member(`lastReadSeq` `channels.ts:102`) | **origin별 독립 유지**(§6.H "전역 커서 발명 금지" — §3 계층화 승인의 근거) |
| envelope 스키마 | — | **불변**(additive만 — keyId가 그 예) — Q4는 "활성화"지 "발명"이 아님(§6.L 목표) |
| 채널 복제 | 전부 로컬 | `bridged:true` 옵트인 채널만 복제(§6.H) |

envelope 형상·lamport 시멘틱·idempotency는 Q4에 **바뀌지 않는다** — 이것이 "Q1에 심으면 Q4가 발명이 아니라 활성화"(§6.L)의 구체다.

---

## 9. 성능·용량

### append 오버헤드 예산 (post 1건당 추가 ms — saveDebounced 대비)

- **현행 커밋경로**: 채널 post는 동기 `saveImmediate`(`ChannelService.ts:1885` → `ChannelStateWriter.ts:103`)로 **전체 상태를 재직렬화+write**(fsync 없음). 상태가 클수록 O(total messages) — `channels.ts:394-400`이 명시한 DoS 축.
- **신규 커밋경로**: 1레코드 append(줄 직렬화 O(payload)) + fsync 배리어(~0.5–2ms SSD). **코얼레싱(§2.5)이 Q1부터 포함**이므로 동시 커밋 버스트에서 배리어 비용이 배치당 1회로 분할상환된다 — N건 동시 버스트의 per-append 유효 fsync 비용은 ~(1–2ms)/N.
- **순증/순감**: 한산할 때 fsync ~1–2ms 순증. 큰 상태·버스트에선 **순감**(O(total) 재직렬화 소멸 + 배리어 분할상환). 내구성은 순증(현행 no-fsync → acked 이벤트 전원손실 생존). saveDebounced(30s 병합, `ChannelStateWriter.ts:36`)는 스냅샷 write 전용이 되어 커밋경로 밖으로 빠진다 — 커밋 지연이 debounce 창에 의존하지 않게 되어 예측가능해진다.
- 예산 목표: 커밋 append p99 ≤ 3ms(코얼레싱 포함, SSD). 검증 리그(§6.G) 카오스 시나리오로 실측 게이트.

### 로그 증가율 추정 (워크로드 가정 명시)

가정(파워유저 1일): 채널 post 500건 + ack 2000건(커서 이동, post당 ~4 소비자) + A2A task 전이 1000건 ≈ **3500 이벤트/일**. envelope 오버헤드 ~250–400B/레코드(payload 별도, 채널 텍스트 평균 ~200B) → 채널 post ~600B, ack/전이 ~350B. 대략 **~1.5–2MB/일** 원시 로그. 4MB 세그먼트는 ~2일치. 이는 컴팩션 전 원시 증가율이고, 스냅샷+절단이 상주분을 바운드한다(아래).

### 컴팩션/보존 정책 (스냅샷 + 로그 절단 — §6.E 캡 정합, 델타 ⑤ 정직화)

- **스냅샷 지점**: N=1000 이벤트마다 또는 세그먼트 롤 시 projection 스냅샷 + snapshotLamport — **`durableAtomicWrite`로만(D13)**.
- **절단**: snapshotLamport 미만 세그먼트는 절단 후보. 단 **감사용 1버전 보존**(가장 최근 절단대상 세그먼트 1개 유지 — §6.L "구포맷 읽기 폴백 1버전" 및 감사 요구) + **genesis·reseed 스냅샷은 절대 제외(D14·§6.4c)**.
- **복구 범위의 정직화(델타 ⑤)**: 절단된 구간은 이후 **스냅샷에만 존재**한다 — 따라서 "genesis+로그 replay = 완전 복구"는 컴팩션 전에만 참이고, 절단 후 스냅샷 체인(최신/.bak/reseed) 전손 시에는 절단분이 복구 불가다(§5 폴백 서사와 일치). 이 잔여를 없애는 콜드 아카이브(절단 세그먼트를 삭제 대신 이관·압축)는 **Q2+ 옵션**으로만 기록 — §6.E 레코딩의 세그먼트 캡·LRU 기계와 공유 가능성이 있다(1줄, 설계는 그때).
- **함정**: 컴팩션이 절단하는 세그먼트에 아직 스냅샷에 반영 안 된 idempotencyKey가 있으면 cross-restart 재시도 흡수 윈도가 좁아진다 → 절단은 **반드시 durable 스냅샷 확정(§2.3 — write+tmp fsync+rename+dir fsync 완료) 후**에만. 순서: durable 스냅샷 → snapshotLamport 커밋 → 그 미만 세그먼트 절단. fsync 없는 스냅샷을 전제로 절단하면 전원손실 시 "스냅샷은 사라졌는데 그 근거 세그먼트도 없는" 이중 소실이 난다(v1 결함 — D13이 닫음).

---

## 10. 테스트 계획 + 구현 좌표 + PR 분할

### 파일별 변경 목록 (신설 포함)

**신설:**
- `src/shared/eventlog.ts` — `EventEnvelope`, `EventDomain`, `TrustTier`, `makeEnvelope()` 팩토리, payload 타입(채널/A2A). additive-only 규약.
- `src/daemon/eventlog/AppendOnlyLog.ts` — 세그먼트드 NDJSON writer(D3/D4), lamport/origin.seq hwm(D6), fsync+코얼레싱·**배치 단위 롤백(batchStartOffset 단일 ftruncate)**(D5/D16/§2.4-2.5), short-write 루프, `append(): Promise<boolean>`, 전방 스캔 복구(D15/§2.6), append 뮤텍스.
- `src/daemon/eventlog/EventLogManifest.ts` — manifest read/write(**durable 전용**), formatVersion, machineId, genesisRef, reseedRefs.
- `src/daemon/eventlog/migrateToEventLog.ts` — 감지(manifest-부재 3분기+격리)→변환(genesis+machine-id)→검증→활성(§6.1-6.2), dual-write 브리지, **워터마크(lamport+stateHash) 기반** 재-업그레이드 가드+reseed 스냅샷(§6.4c).
- `src/daemon/eventlog/SnapshotStore.ts` — projection 스냅샷(debounced+durable)/genesis·reseed 로드, 폴백 체인(§5), 컴팩션 트리거(§9).
- `src/daemon/a2a/A2aTaskService.ts` — projection-first A2A 서비스(§5, D11), `VALID_TRANSITIONS` 이관.
- `src/shared/machineId.ts` — `events/machine-id` 민팅·로드·레코드-복구(§8), 생성 시점은 마이그레이션 2단계(§6.1-2).

**수정(재배선):**
- `src/daemon/util/atomicWrite/core.ts` — **additive `durable?: boolean` 옵션**(D13/§2.3: tmp fsync→rename→dir fsync, win32 잔여 문서화). 기존 호출부 무변경(additive).
- `src/daemon/channels/ChannelService.ts` — `saveOrFail()`(`:1885`) → `await log.append(...)`(boolean, `:1441` 등 롤백 패턴 형태 보존, 1 RPC=1 envelope); 생성자(`:345-426`)에 스냅샷+tail replay; 멱등 인덱스를 로그 기반으로(§4); **dual-write에 eventLogWatermark(lamport+stateHash) 스탬프(§6.4c)**. 하위 시멘틱 불변.
- `src/daemon/channels/ChannelStateWriter.ts` — `channels.json` → `snapshot/channel.json` 경로 전환, saveImmediate 커밋경로 해제(스냅샷 전용), shutdown flush의 durable 승격(§6.4b — `flushSync` `:266-287`).
- `src/daemon/index.ts` — 부트 마이그레이션 게이트 삽입(`:2727` 앞), `A2aTaskService` 배선, `daemon.ping`(`:1495-1496`)에 `eventLogFormatVersion` additive(§6.4a), `daemon.shutdown`(`:1972-1975`) 경로에 스냅샷 durable flush(§6.4b).
- `src/main/pipe/handlers/a2a.rpc.ts` — task.* 를 renderer passthrough(`:242-243`)에서 데몬 직결로.
- **`src/main/a2a/ClaudeWorker.ts` — `updateTaskStatus`(`:155`)의 `sendToRenderer('a2a.task.update')`(`:162`) 직행을 데몬 `A2aTaskService` append 경유로 재배선**(패널 C12 — 누락 시 실행자 전이(working/failed/completed, `:44,49,106,114,146`)가 로그에 미도달, a2aSlice 강등 후 정본 부재).
- `src/renderer/stores/slices/a2aSlice.ts` — 정본→캐시 강등(주석/의미 재정의).
- `src/main/pipe/handlers/a2a.channel.rpc.ts` — authContext 스탬프가 서버핀(`:180-183`) 하류에서 채워지도록 payload 배선.

### 테스트 케이스 목록 (필수 4종 + 패널·델타 추가분)

- **T-크래시 복구(필수, 델타 ② 케이스 포함)**: append 중 프로세스 kill → 부트 전방 스캔·최초 불량 절단(§2.6) → 커밋(fsync-resolve)된 이벤트 무손실 + 불량-이후 폐기. 코얼레싱 배치 중간 torn(비순서 writeback 모사) 케이스 포함. **+ at-least-once 고정 케이스: fsync 직전 kill → 부트 후 해당 배치는 "절단 or 승격" 둘 중 하나만 허용, 부분(배치 일부) 승격 금지 — §2.4-4 단일 ftruncate·페이지캐시 생존 논증 검증.**
- **T-fsync실패 주입**: fsyncSync throw 주입 → 배치 전체가 `ftruncate(batchStartOffset)` 1회로 물리 제거되고 배치 전원 false(순서의존 null 매장 없음 — 델타 ①) → projection 롤백과 디스크 일치, 재부트 replay에 롤백 이벤트 미출현.
- **T-롤 직후 크래시**: 롤로 빈 신규 세그먼트 생성 직후 kill(manifest 갱신 전/후 2변형) → 재부트가 first-boot로 오인하지 않고 직전 세그먼트에서 hwm 복원 — lamport/seq 리셋·재사용 없음(§2.8·§3).
- **T-manifest크래시(델타 ③으로 3분기 확장)**: (a) 세그먼트 0개+manifest 부재 → 레거시 마이그레이션 (b) 빈 세그먼트+genesis 유효+manifest 부재 → manifest 재구성만으로 완결(재변환 없음) (c) 비어있지-않은 세그먼트+manifest 부재 → `quarantine/` 격리 후 레거시 재시도(격리 파일 보존 확인). + §6.1-4 직후(첫 append 전) kill → 재마이그레이션 미발생.
- **T-genesis**: `snapshot/`에서 genesis 외 전손 → genesis + 잔여 로그 replay로 마이그레이션-전 데이터 포함 복구 — 컴팩션 전 완전, 컴팩션 후 절단분 제외(§6.2, 델타 ⑤ 문면).
- **T-마이그레이션 왕복(필수)**: 레거시 `channels.json`(빈/멤버/아카이브/멱등맵 변형) → 마이그레이션 → genesis+machine-id+빈로그 → 부트 replay → projection이 레거시와 동일. 변환 실패 주입 시 레거시 무손상. 재시도 멱등(§6.1-1).
- **T-멱등(필수)**: 동일 idempotencyKey 재시도(같은 프로세스 + cross-restart) → append 없이 원본 결과, 로그에 1건만. **+ at-least-once 승격 레코드에 대한 재시도가 중복 커밋되지 않음(§2.6-(a)·§4).** 절단 윈도 밖 재시도는 1회 중복(현행 잔여 동형).
- **T-lamport 재개(필수)**: 재시작 후 첫 신규 lamport = 직전 max+1(오프바이원 없음), 재사용/역행 없음. 배치 실패 후 hwm gap 허용·재사용 금지. 승격 레코드의 lamport가 hwm 스캔에 반영됨(§3 함정).
- **T-다운그레이드 3기전(델타 ④ 갱신)**: (a) 구-main 모사가 미지 formatVersion에 fail-closed (b) graceful shutdown 후 channels.json이 로그와 일치(stale 0) (c) **워터마크 판정**: 신 데몬 정상 재시작 N회 → reseed 오발동 0(stateHash 일치); 구-데몬 쓰기 모사(내용 변경, 워터마크 필드 왕복 보존) → stateHash 불일치 감지 → reseed 스냅샷 생성 + 마커 이벤트 + 폴백 체인 편입, 델타 무성 폐기 없음.
- **T-principal**: principals.json 손상/삭제 → 채널/A2A 로그·projection 무영향, 빈 레지스트리 degrade, 렌더러 재등록 복원(§6.5).
- T-projection 파리티: 기존 ChannelService 테스트 스위트 **무변경 통과**(시멘틱 불변 증명).
- T-스냅샷 손상 폴백: 최신 스냅샷 손상 → `.bak`(`core.ts:343`) → (reseed 있으면 reseed →) genesis+replay 순 폴백(§5).
- T-A2A 전이 게이트: `VALID_TRANSITIONS`(`types.ts:654`) 데몬측 강제(성공 종단=`'completed'`, `types.ts:624`) + 완료증거 payload 수용(스키마만, 게이트는 Q1-4b). ClaudeWorker 전이가 데몬 로그에 도달(C12).
- T-컴팩션 순서: durable 스냅샷 확정 전 절단 금지(§9 함정) + genesis·reseed 절대 비절단.

### PR 단계 분할 (버전 불변, 각 PR 독립 그린)

리포 관례 준수: PR은 VERSION을 올리지 않고(릴리스=명시적 사용자 액션, 로드맵 §5), 각 PR이 독립적으로 green.

- **PR1 — 로그 프리미티브**: `AppendOnlyLog`(코얼레싱 fsync·배치 단일 롤백·boolean append·short-write 루프·전방 스캔 복구) + `EventEnvelope` + `machineId` + core.ts `durable` 옵션. 순수 라이브러리, 서비스 미배선. 단위테스트(T-크래시(승격 케이스 포함)/T-fsync실패/T-롤크래시/T-lamport). **그린.**
- **PR2 — 마이그레이션 엔진 + manifest + 스냅샷 스토어**: `migrateToEventLog`(3분기 감지·genesis·워터마크·reseed 스냅샷) + `EventLogManifest`(durable) + `SnapshotStore`(폴백 체인). 하니스 테스트(T-마이그레이션/T-genesis/T-manifest크래시 3분기/T-다운그레이드). 서비스 미배선. **그린.**
- **PR3 — ChannelService 재배선**: 커밋경로 로그화 + 스냅샷 debounce + 멱등 로그화 + 워터마크 스탬프 + shutdown durable flush. 기존 채널 테스트 무변경 통과(T-파리티)가 게이트. **그린.**
- **PR4 — A2aTaskService**: projection-first A2A + pipe 직결 + **ClaudeWorker 전이 재배선(C12)** + 렌더러 캐시 강등 + executor-lifecycle envelope **스키마 예약**(기록·펜싱 구현은 §6.F — 델타 ⑧). **그린.**
- **PR5 — authContext 스탬핑 + 완료증거 payload 스키마 + ping formatVersion**: verifiedWorkspaceId/principalId/trustTier 데몬 경계 스탬프(§7) + A2A 전이 payload evidence 스키마(§6.M P1, 게이트는 Q1-4b) + `daemon.ping` additive(§6.4a). **그린.**

`src/shared`/PROTOCOL 변경(PR1의 eventlog.ts, PR4의 pipe 계약, PR5의 ping 필드)은 오케스트레이터 리뷰 필수(로드맵 §5, additive-only).

---

## 함정 종합 (§6.L 3건 + 파생)

1. **무중단 마이그레이션(§6.L 3-1)**: manifest는 durableAtomicWrite로만(D13), 순서 불변식은 genesis→machine-id→세그먼트→검증→manifest(§6.1). manifest-부재는 3분기(빈-세그먼트 완결 복구 / 비정상 격리 — 델타 ③). 변환은 레거시 READ-only. 부트는 manifest를 힌트로만(D15). 다운그레이드는 §6.4 3기전(워터마크+reseed 스냅샷 — 델타 ④).
2. **CHANNELS_EPOCH 재사용(§6.L 3-2)**: daemonEpoch=CHANNELS_EPOCH는 **순서 비관여 provenance**(D8). 부트 incarnation 구별은 `(machineId, origin.seq)` 영속-단조 + machineId의 로그-동일-fate(§8)가 담당.
3. **lamport 영속 재개(§6.L 3-3)**: 스캔 기반 max 복원 + pre-increment(D6/D15). 사이드카 카운터 금지. 롤 직후 크래시의 리셋 함정은 "최고번호 **비어있지-않은** 세그먼트" 규칙이 차단(§3). hwm은 배치 실패 시 gap 감수·재사용 금지, 승격 레코드는 스캔이 hwm에 반영.
4. **배치 롤백(델타 ①)**: 실패 단위는 배치 — `ftruncate(batchStartOffset)` 1회 + 전원 false. append별 독립 ftruncate는 순서의존으로 로그 중간 null 매장 → 커밋 레코드 유실(§2.4-4).
5. **at-least-once 승격(델타 ②)**: valid unsynced tail은 커밋으로 승격될 수 있다 — 결함이 아니라 계약(D17). 안전은 idempotencyKey·ack-전용 커서·1 RPC=1 envelope가 보장(§2.6).
6. **컴팩션 순서(§9)**: **durable** 스냅샷 확정 후에만 세그먼트 절단 + genesis·reseed 절대 제외(D14). 절단 후 완전복구는 스냅샷 체인 생존 전제(델타 ⑤).
7. **execute 2-프로세스(§6.F/R14)**: Q1은 스키마 수용만(델타 ⑧) — 기록·펜싱·하트비트-relaxed 배정은 §6.F. ClaudeWorker 전이 경로 재배선(C12)이 그 전제.

## 놀라운 점 / 모순 (발견)

- **현행 fsync 전무**: `core.ts`(async `:200-260`, sync `:361-413`)는 write+rename만 하고 fsync를 **한 번도 호출하지 않는다**. 스냅샷엔 허용되나 정본 로그엔 부족 → D5(커밋 fsync+코얼레싱)와 D13(durableAtomicWrite)으로 신규 도입.
- **구 데몬의 unknown-필드 왕복 보존이 워터마크 설계를 결정**: `isChannelState`는 spot-check라 미지 최상위 필드를 거부하지 않고(`ChannelStateWriter.ts:307-369`) `saveImmediate`는 로드 객체를 통째 재직렬화한다(`ChannelStateWriter.ts:103-118`) — 구 데몬이 써도 lamport 워터마크 값이 살아남아 lamport 단독 비교는 전진 감지 불가 → `stateHash` 동반이 필수(§6.4c). 델타 ④ 반영 중 확인한 구현 사실.
- **daemonEpoch 이름-역할 불일치**: 필드명 "daemonEpoch"는 "데몬 incarnation"을 암시하나 로드맵은 스키마 상수 `CHANNELS_EPOCH` 재사용을 지시(부트마다 안 변함) → D8로 "provenance 스탬프, 순서 비관여"로 역할 확정하고 incarnation 유일성은 origin.seq로 이전. (구현 시 코멘트로 못박아 오독 방지 권고.)
- **domain enum의 'a2a' vs 'task' 이중 존재**: §6.L enum이 둘 다 가짐. §6.F(A2A 내구화)·§6.M P1(완료증거)은 **A2A task = `domain:'a2a'`**에 얹히고, `'task'` 슬롯은 §6.J 워크트리/§6.M P2 풀 태스크(Q2 미래)용으로 예약 — 완료증거 스키마는 `domain:'a2a'`의 전이 payload에 붙는다.
- **로드맵 정정 제안 2건**: ① §6.M P1의 `done`/`failed` 표기 — 성공 종단 상태명 'done'은 실코드 TaskState에 없다(정본 `'completed'`, `types.ts:624`, `VALID_TRANSITIONS` `types.ts:654-661`) → `completed/failed`로 정정 제안. ② §6.L "per-member 커서·ack·clientMsgId 멱등은 전부 envelope 필드의 특수화로 흡수" — 커서·ack 부분은 §6.H "전역 커서 발명 금지"와 모순이므로 **"계층화(도메인 로컬 순서 유지, lamport는 전역 감사층)"로 문면 정정 제안**(멱등 흡수는 유지 — §4가 실제로 수행). 승인 근거는 §3(델타 ⑦).

## 열린 질문 (1)

1. **A2A execute 시드 마이그레이션의 유실 허용 범위**: 현행 A2A는 30분 GC 비내구(`a2aSlice.ts:8`)라 부트 시 렌더러→데몬 1회 시드가 best-effort다. 마이그레이션 순간 in-flight working 태스크(Main 워커 생존)를 데몬이 어떤 상태로 시드할지 — §6.F 펜싱·하트비트-relaxed 배정과 겹치는 경계라 §6.F 설계와 동시 확정.

### 판정 기록 (오케스트레이터 승인 확정 3건 — 델타 라운드)

| 건 | 판정 | 반영 위치 |
|---|---|---|
| origin.seq additive 확장 (+`origin.keyId` Q4 예약) | **승인** | D7, §1, §8 |
| D12 — principals.json 로그 도메인 제외 (로드맵 §6.L 문면 편차) | **승인** | D12, §6.5 |
| 커서·ack 계층화 (로드맵 §6.L "특수화로 흡수" 문면 이탈) | **승인** — §6.H "전역 커서 발명 금지"가 근거 | §3, §놀라운점 정정 제안 ② |

(v1 열린 질문 "fsync 단위"는 v1.1에서 코얼레싱 Q1 포함으로 해소 — §2.5.)

---

## 리뷰 로그

### 1라운드 — 3모델 패널 (2026-07-06)

3모델 패널(Codex + GLM + Claude, 독립 컨텍스트) plan 모드 리뷰. 판정: 골격(로그-projection 계층화 · D2 재합성-회피 방향 · 채널+A2A 스코프)은 3축 모두 유효 인정 — 결함은 전부 **내구성 구현 계약**에 집중. 합의 분포: **3-MODEL 3건 · 2-MODEL 5건 · SOLO 7건 · 기각 4건.**

#### 반영 완료 (15건)

| # | 합의 | 발견 요지 | 반영 위치 |
|---|---|---|---|
| A1 | 3-MODEL CRIT | manifest·스냅샷이 fsync 전무한 atomicWriteJSON 위 — 전원손실 시 재마이그레이션→커밋 이벤트 고아화(내부 모순) | D13, §2.3 durableAtomicWrite, §6.1-4, §9 |
| A2 | 3-MODEL CRIT | D2 하에서 "스냅샷 손상→전체 replay" 거짓 — 레거시가 로그에 없어 복구 불능 + "무손실" 서사 과장 | D14, §6.2 genesis, §6.3 경계 계약, §5 폴백 체인, T-genesis |
| A3 | 3-MODEL CRIT | 롤 직후 크래시 시 빈 세그먼트를 first-boot 오인 → lamport/seq 리셋(§6.L 함정 위반), orphan 세그먼트 미정의 | D15, §2.8, §3 스캔-부트, T-롤크래시 |
| B4 | 2-MODEL CRIT | 다운그레이드×B′(#342) 미정의 — 포맷 인지·stale 창·재-업그레이드 델타 무성 유실 | §6.4 3기전(ping `index.ts:1495`·shutdown `index.ts:1972`·reseed), T-다운그레이드 |
| B5 | 2-MODEL CRIT | write 성공+fsync throw = ghost 레코드가 로그 내부 매장 → replay가 롤백 이벤트 재적용 | §2.4(배치 롤백으로 흡수), T-fsync실패 |
| B6 | 2-MODEL | fs.writeSync 1회가 전량 쓰기 미보장 | §2.4 short-write 루프 |
| B7 | 2-MODEL | 에러모델 불일치(throw vs 현행 boolean 롤백 계약) — throw면 롤백 블록 건너뜀 | D16, §2.4, §3, §5 재배선 문면 |
| C8 | 2-MODEL | machineId Q4 교체가 (machineId,seq) 연속성 파괴 + 로그-별도 생애로 seq 재사용 가능 | §8 영구불변+keyId additive+동일 fate+레코드 복구 |
| C9 | SOLO(오케스트레이터 재정) | per-append fsync는 버스트 p99 구조적 미달 — 코얼레싱 Q2 연기 번복 | D5, §2.5, §9 예산 |
| C10 | SOLO | "hwm=max+1 저장 + ++" 오프바이원(첫 값 max+2) | D6, §1 표, §3, T-lamport |
| C11 | SOLO | D12가 '놀라운 점'에만 — origin.seq와 비대칭(같은 로드맵 편차인데 승인 규율 없음) | §6.5 독립 계약 절, 판정 기록, T-principal |
| C12 | SOLO | ClaudeWorker.updateTaskStatus(`:155,:162` sendToRenderer 직행)가 §10 누락 — 실행자 전이 정본 부재 | §5 D11 절, §10 수정 목록·PR4, T-A2A |
| D13 | SOLO | relaxed·commit 단일 스트림 공유 시 내부(비말미) 손상이 tail 복구 밖 | §2.6 전방 스캔 절단 + §2.7 relaxed 별도 스트림(트레이드오프 논증) |
| D14 | SOLO | 좌표 정밀화 + 'done'≠TaskState('completed'가 정본) | §2.1 좌표(config.ts:10-12·constants.ts:228-230 재검증 — 실코드 일치 확인, 함수 스팬으로 정밀화), §5·§10 completed 명시, §놀라운점 로드맵 정정 제안 |
| D15 | SOLO | 크래시 테스트 3케이스 부재 | §10 T-fsync실패·T-롤크래시·T-manifest크래시 |

#### 기각 (4건 — 사유)

- **G1 (fsync 오해)**: v1 fsync 계약에 대한 오독 기반 지적 — v1이 이미 식별·결정한 범위(D5) 내. 실결함은 A1(적용 누락)로 별도 반영.
- **G2 (레거시 히스토리 envelope 재합성 요구)**: D2 번복 요구는 기각 — 재합성은 O(히스토리) 마이그레이션 비용 + 가짜 lamport/authContext 소급 날조 문제. 대신 복구 가능성 갭은 genesis 불변 보존(A2/D14)으로, 서사 갭은 §6.3 경계 계약으로 해소.
- **G7 (기충족)**: 지적 시점에 이미 v1이 충족하던 요구(중복 발견).
- **G8 (시퀀싱 준수)**: v1의 마이그레이션 순서 불변식(genesis→검증→manifest)이 이미 준수하던 시퀀싱에 대한 지적.

### 2라운드 — 델타 재리뷰 (Codex+Claude 독립, 2026-07-06)

v1.1 반영 15건 판정: **Codex 12 OK / 3 PARTIAL · Claude 15 OK** + 양측 신규 5건씩 → 교차 합의 **8건(2-MODEL 2 · SOLO 6)**. PARTIAL·신규가 전부 **코얼레싱 도입(C9)×마이그레이션 수정(A3/B4)의 상호작용 지대**에 수렴 — B′ 선례("델타 리뷰가 연쇄 결함을 잡는다")의 재현이다.

| # | 합의 | 발견 요지 | 반영 위치 |
|---|---|---|---|
| ① | 2-MODEL CRIT 10 | append별 독립 ftruncate가 배치 fsync 실패와 모순 — 순서의존 null 매장 → 커밋 레코드 유실 | D16 개정, §2.4 배치 모델 재작성, §2.5, T-fsync실패 |
| ② | Codex CRIT 9 (재정: watermark 기각) | "최초 불량 이후=전부 미관측" 과장 — valid unsynced tail이 승격됨 | D17 신설, §2.6 at-least-once 계약+안전 논증 3종+부분승격 금지 계층, §4 연결, T-크래시 |
| ③ | Codex CRIT 8 | 빈-세그먼트+manifest-부재 크래시 창이 감지 규칙과 충돌 | §6.1-1 3분기(재구성 완결/격리), 재시도 멱등, T-manifest크래시 확장 |
| ④ | 2-MODEL CRIT 9 | mtime 가드가 자기 dual-write와 구별 불가(오발동) + reseed 요약으로는 복구 불가 | §6.4c 워터마크(lamport+**stateHash**)+reseed 스냅샷(불변·폴백 편입), T-다운그레이드 갱신 |
| ⑤ | Claude INFO 7 | "genesis+전체 replay=완전 복구"가 컴팩션과 모순(A2 결함의 경계 재발) | §5·§9 복구 범위 정직화, 콜드 아카이브 Q2+ 1줄, T-genesis 문면 |
| ⑥ | Codex INFO 7 | machine-id 생성·durable 시점 미명시 | §6.1-2(genesis와 함께, manifest 전), §2.1·§8 링크 |
| ⑦ | Claude INFO 6 | 커서 계층화가 §6.L 문면 이탈인데 미기록 | §3 승인 기록(§6.H 근거), §놀라운점 정정 제안 ②, 판정 기록 |
| ⑧ | Claude INFO 6 | "executor-lifecycle 1급 기록"이 "relaxed 공집합"과 상충(하트비트) | §5 "스키마 수용만"으로 정정, §2.7 첫 소비자 지정, D11·함정 7 |

### 3라운드 — Codex 마이크로 패스 (2026-07-06, 확정 게이트)

v1.2 봉합부 8건 + 신규 논증 2건(§6.4c stateHash 필수성 — 오케스트레이터가 `isChannelState` spot-check(:307-369)·`saveImmediate` 통째 재직렬화(:103-118)를 실코드 검증 / §2.6 배치 프리픽스 승격의 hwm 무충돌)을 조준 검증: **8/8 OK, NO NEW FINDINGS.** 수렴 종결(패널 15 → 델타 8 → 마이크로 0) — 확정.

---

## 산출물 경로

`plans/envelope-design-2026-07-06.md` (이 문서)
