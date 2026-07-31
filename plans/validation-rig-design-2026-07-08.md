# 검증 리그 v1 (Q1-7) 상세 설계 — §6.G

- 상태: **v1.1 (패널 리뷰 반영)** (2026-07-08) — 3모델 패널 중 Codex(13건)·Claude 적대(c4/M5/m다수) 반영, GLM은 게이트웨이 장애(529 ×2)로 지연 — 착지 시 델타 반영(§리뷰 로그). 오케스트레이터 자체 검증 2건 포함.
- 작성: 2026-07-08, Fable 오케스트레이터 직접 (판단밀도 설계 — Fable 윈도우 내 선행).
- 계약 정본: `plans/roadmap-12mo-world-no1-2026-07-05.md` §6.G(:356-360) · Q1-7(:156) · CL7(:164 — "리그 실검출 1건 실증 = 나머지 Q1 출하물의 선행 게이트") · 분기 게이트(:166).
- 선행: §6.L envelope(머지 완료 — PR1~PR5) + §6.M P1(게이트 #354·관측성 #357). 재시작·복구 시나리오는 envelope replay가 정본이 된 지금이 착수 적기.
- 스코프: **리그 v1** — 자가 GUI E2E 하니스 + 합성 멀티에이전트 시뮬레이터 + CI 편입(informational) + 실검출 실증(2단 — §7). required 승격은 번인 후 별도(§6).

---

## 0. 핵심 결정 요약 (각 1줄 + 근거)

| # | 결정 | 근거 요지 |
|---|---|---|
| G1 | **두 레인 + 공유 하네스**: E2E 레인(패키지 앱 + CDP) / SIM 레인(헤드리스 데몬 + 데몬 파이프 직결) | 실행 모델이 다르다. 데몬 파이프가 채널 전 표면(`src/daemon/index.ts:1603-1888`)+A2A(:1972-2022)+principal(:2041)을 노출하므로 SIM은 앱 없이 성립 |
| G2 | **격리 = 런당 fresh 홈 + `WMUX_DATA_SUFFIX='-rig-{runId}'`** — runId는 전 OS 필수(win32 named pipe 전역·병렬 런), 홈 오버라이드는 **HOME+USERPROFILE+APPDATA+LOCALAPPDATA 전부** | 경로 헬퍼가 win32에서 `USERPROFILE \|\| HOME`(`src/shared/constants.ts:287,:342` — 리뷰 Codex M3). 파이프 이름: unix `~/.wmux-daemon${suffix}.sock`·win32 `\\.\pipe\wmux-daemon${suffix}-${username}`(`src/daemon/config.ts:30-35`) — win32는 파일시스템 밖이라 suffix의 runId만이 격리 수단(Codex M4). userData는 앱이 자체 격리(`src/main/index.ts:214` setPath + fail-loud 검증 :229-232 — Claude 축③ 실증) |
| G3 | **러너 = vitest 단일**(신규 `vitest.rig.config.ts`, `fileParallelism: false`). playwright-core는 라이브러리로만 | 이미 의존성(`src/mcp/playwright/PlaywrightEngine.ts:183` connectOverCDP 선례). @playwright/test 도입은 러너 2개 — 기각 |
| G4 | **CDP 포트 = `WMUX_CDP_PORT` env 오버라이드(제품 additive 변경, v1 정식 채택)**. stdout 파싱은 unix 폴백으로 강등 | **win32 패키지 앱은 GUI 서브시스템이라 stdout이 스폰 부모에 도달하지 않는다** — `src/main/logSink.ts:4-8`이 자백("packaged Windows builds stderr has no parent console… traces vanished", 리뷰 Claude c/82). macOS/Linux stdout 도달도 미실증(Codex M6). env 오버라이드는 명시 설정 시에만 발동 — 기본 랜덤화(`src/main/index.ts:88-92`, 스캐닝 방지)는 불변. 제품 변경은 4줄 additive, PR-R3에 동봉 |
| G5 | **이중 검증 패턴**: E2E 시나리오는 (a) DOM 주장(CDP) + (b) 상태 주장(파이프 RPC) 둘 다 어서트 | §6.G 문면. 거짓 영수증·팬텀 배지 계열의 그물 |
| G6 | **SIM 신원 = "정직한 main" 규율 + 실등록 RPC**: 하네스가 페르소나당 workspaceId 1개를 배정·강제 스탬프(예약 신원·타 ws 자칭은 하네스 레벨 금지), principal은 실 RPC(`a2a.principal.upsert` `src/daemon/index.ts:2041`)로 등록. **제품에 테스트 전용 경로 0** | 데몬은 pre-stamped `verifiedWorkspaceId`를 verbatim 신뢰(`src/daemon/channels/channelCallerIdentity.ts:92-94` Rule 1 — Codex C1 확정). "동일 표면" 주장은 성립하지 않으므로 폐기 — 대신 SIM은 정직한 main을 모사하고, 커버 못 하는 레이어는 §2.5 커버리지 맵에 정직 선언(Claude 축②). "실등록 경로"(로드맵 :360)는 헤드리스 정합 해석 = 실 등록 RPC 표면 사용·백도어 0(같은 절이 "헤드리스 데몬 + 파이프 직결 가짜 principal"을 명시하므로 렌더러 경유 강제 해석은 자기모순 — Codex C2 해소) |
| G7 | **페르소나 6종 + 시나리오 8종, 결정적 시드**(실패 로그에 시드 인쇄) | §6.G 문면. 단 S2·S4·S7은 리뷰로 재정의(§4 — 존재하지 않는 계약을 어서트하지 않는다) |
| G8 | **카오스 v1 = 데몬 SIGKILL(3-OS) + 파이프 EPERM(unix 한정)**. 디스크풀·시계점프는 이연 — **로드맵 §6.G 문면 이탈, 오너 승인 항목**(§정정 R2) | SIGKILL→replay 수렴이 §6.L 실증이자 최대 가치. EPERM은 unix에서 저렴(socket chmod — Codex M8 절충). 디스크풀·시계점프는 포터블 구현 불확실(§11-3) — 분기 게이트(:166)가 카오스를 조건으로 열거하진 않아 게이트는 불침해(Claude 축⑦ 판정) |
| G9 | **실검출 실증 2단**: ①SIM 실증(PR-R2 동봉 — 조기 게이트 개방) ②GUI 실증(PR-R4 — 분기 게이트 문면 충족). 후보는 §7(리뷰로 교체됨) | CL7이 실증을 "나머지 Q1 출하물의 선행 게이트"로 못박는데 실증이 R4(최후)면 Q1 W1 전부가 리그 4-PR 완주에 인질(Claude M/68). 2단화로 해소 — 단 게이트 문면("GUI 회귀")의 조기 단계 해석은 **오너 승인 항목**(§정정 R1) |
| G10 | **도그푸드 29본 흡수 목록화, 폐기 없음** — `rig/CATALOG.md` absorb/keep/retire 3분류 | §6.G 문면 |
| G11 | **CI = 별도 `rig.yml`, informational 시작** — SIM 3-OS 먼저, E2E는 ubuntu(Xvfb) 단일 시작. required 승격은 2주 번인(<2% 플레이크) + 실증 완료 후 오너 결정 | 신규 E2E 초기 플레이크는 통계적 확실 — 게이트 시작은 전 PR 인질 |
| G12 | **위치 = 최상위 `rig/`**, `npm run test:rig[:e2e\|:sim]` | 앱 번들·기존 vitest glob 밖. 도그푸드(scripts/)와 구별되는 1급 존재 |

---

## 1. 아키텍처 — 두 레인, 한 하네스

```
rig/
  harness/
    isolation.ts      # G2: fresh 홈(4 env) + suffix(-rig-{runId}) 런 컨텍스트, teardown
    daemon.ts         # RigDaemon: dist/daemon-bundle/index.js 스폰·SIGKILL·재스폰·ready 대기(daemon.ping)
    session.ts        # RigSession: 데몬 실 PTY 세션 생성(session.create — 데몬이 PTY 소유자, 실경로)
    app.ts            # RigApp: 패키지 앱 launch(WMUX_CDP_PORT) + connect 재시도 + exit 리스너 + 타깃 선택
    pipe.ts           # PipeClient: main/daemon 양 파이프 — 토큰 경로 규약·RPC·타임아웃 + 정직-main 규율(G6)
    assert.ts         # StateAssert: 상태 어서션 헬퍼(각 헬퍼에 정본 코드 좌표 주석 필수)
    persona.ts        # PersonaRunner: 시드 주입 페르소나 루프 (§4)
    screenshot.ts     # 요소 rect 크롭 diff (전체 창 픽셀 diff 금지)
  e2e/                # *.rig.test.ts — GUI 레인 (§3)
  sim/                # *.rig.test.ts — 시뮬레이터 레인 (§4)
  EVIDENCE.md         # G9 실검출 증적 (2단)
  CATALOG.md          # G10 도그푸드 흡수 목록
vitest.rig.config.ts  # include: rig/**/*.rig.test.ts, fileParallelism: false, environment: node
```

- 기존 vitest 두 레인 불변 — 리그는 세 번째 레인(최상위 rig/는 기존 include 밖).
- **하네스가 곧 규율**: 시나리오는 `isolation → (daemon|app) → 행위 → 이중 어서션 → teardown` 형태의 vitest 테스트만. 일회성 mjs 재양산 금지.

## 2. 격리 모델 (G2 상세)

런 컨텍스트 = `mkdtempSync` 임시 홈 + `WMUX_DATA_SUFFIX='-rig-{runId}'`(runId = pid+counter, 전 OS):
- **홈 오버라이드 4종 전부**: `HOME`(posix) + `USERPROFILE`·`APPDATA`·`LOCALAPPDATA`(win32) — 경로 헬퍼가 `USERPROFILE || HOME`(`src/shared/constants.ts:287,:342`), 기존 도그푸드도 동일 관례(Codex M3).
- 데몬 데이터·토큰: `{홈}/.wmux-rig-{runId}/daemon-auth-token`(`src/shared/constants.ts:342` — 디렉토리가 suffix-aware)
- 데몬 파이프: unix `{홈}/.wmux-daemon-rig-{runId}.sock`(`src/daemon/config.ts:35` — `os.homedir()` 기반, HOME 오버라이드 추종은 스파이크 1에서 실증) / win32 `\\.\pipe\wmux-daemon-rig-{runId}-{username}`(`config.ts:33` — 전역 네임스페이스, runId가 유일 격리 수단)
- main 파이프·토큰(E2E): `\\.\pipe\wmux-rig-{runId}-{username}`(`constants.ts:235`) / `{홈}/.wmux-rig-{runId}-auth-token` — **suffix 문자열은 앱 스폰 env와 PipeClient가 단일 상수를 공유**(v1 리뷰에서 `-rig` vs `-rig-{id}` 발산이 인증 미스매치를 만들었다 — Claude 축① minor)
- userData: 앱이 suffix로 자체 격리 + fail-loud 검증(`src/main/index.ts:214,:229-232`) — 세션 오염 불가(실증됨)
- teardown: 프로세스 트리 kill → 임시 홈 삭제. 시나리오당 fresh 컨텍스트(공유 금지 — 상태 이월은 플레이크 근원)

### 2.5 레이어 × 레인 커버리지 맵 (정직 선언 — 리뷰 Codex C1·Claude 축②)

| 레이어 | SIM | E2E | 리그 밖(기존 테스트 몫) |
|---|---|---|---|
| 데몬 정본(ChannelService·A2aTaskService·eventlog·wake worker) | ✅ 주 표면 | 간접 | 유닛 5,263 |
| 데몬 파이프 핸들러(`src/daemon/index.ts` onRpc) | ✅ | 간접 | 유닛 |
| **main 파이프 라우터 3중 게이트**(principalId strip `src/main/pipe/handlers/a2a.channel.rpc.ts:102-120` · local-ui 거부 :145-155 · ws-human 거부 :168-178 · capability) | ❌ (데몬 직결) | **❌ (렌더러 mutate는 `channels:mutate-local` IPC 경유 — 라우터 우회 :5-8)** | **유닛·통합 테스트가 유일 가드** — 리그 사각임을 명시 수용. 라우터 게이트 회귀는 리그가 못 잡는다 |
| MCP 계층(zod·신원 해석) | ❌ | ❌ | MCP 유닛 |
| 렌더러(스토어·브릿지·UI) | ❌ | ✅ 주 표면 | 유닛 |
| main↔데몬 dual-write·폴백 | ❌ | ✅ 간접 | 유닛 |

**수용 논거**: 라우터 게이트·MCP는 순수 함수/얇은 계층이라 유닛이 정확히 잡고, 리그의 가치는 프로세스·와이어·시간 축(스폰·재시작·동시성)에 있다. 이 맵은 "리그가 전부 커버한다"는 착시를 금지하는 계약이다.

## 3. 자가 GUI E2E 레인 (§6.G 축1)

### 실행 시퀀스 (리뷰 반영)
1. `RigApp.launch(ctx)`: 패키지 산출물(OS별 바이너리 경로 규약)을 `env: { 4종 홈, WMUX_DATA_SUFFIX, WMUX_CDP_PORT: ctx.cdpPort }`로 스폰. **child `exit`/`close` 리스너로 조기 종료 즉시 실패**(타임아웃 대기 금지 — Codex m7) + stderr 채집.
2. **`WMUX_CDP_PORT`(G4 — 제품 additive)**: `src/main/index.ts:88` 분기에 env 우선 추가 — 설정 시 그 포트, 미설정 시 현행 랜덤(기본 동작 불변, 스캐닝 방지 유지). unix에서는 stdout 파싱(`[WinMux] CDP enabled on port` :92)을 크로스체크 폴백으로 병용.
3. **connect 재시도 루프**: `console.log`(:92)는 모듈 로드 타임, DevTools 엔드포인트 listen은 app.ready 부근 — 창 사이 ECONNREFUSED가 정상(Claude M/70). `connectOverCDP`를 backoff 재시도(총 예산 ≤30s)로 감싼다.
4. 타깃 선택: contexts/pages에서 **앱 메인 윈도**(webview guest 아님 — guest 미노출 제약은 `src/mcp/playwright/page-eval.ts:9` guest 한정, 메인 윈도 노출은 스파이크 1 실증).
5. 렌더러 준비: DOM 셀렉터 + `daemon.ping` ok 이중 신호 → 시나리오 → 이중 어서션(G5) → teardown.

### v1 시나리오 (3종)
| id | 시나리오 | 이중 어서션 |
|---|---|---|
| E2E-1 | 채널 생성→에이전트 pane 초대→멘션 포스트 | DOM: 메시지 렌더·배지 / RPC: seq·recipientSnapshot·unread |
| E2E-2 | **크로스-ws 멘션 전달** (P1 회귀 — 리그의 존재 이유) + same-ws 전달 동시 어서트(지난 회귀 지점) | DOM: 비활성 ws 넛지 흔적 / RPC: 수신 큐·delivered |
| E2E-3 | 앱 재시작 복구(정상종료→재기동) | DOM: 채널·히스토리 복원 / RPC: replay 후 projection 일치. **주의: 정상종료는 flushSync/durable 경로**(SIGKILL과 다른 계약 — §4 S7 참조) |

### 스크린샷
요소 `boundingBox()` rect 크롭 diff만. v1 최소(1~2곳). 기준선 `rig/e2e/__screenshots__/{os}/`.

## 4. 합성 멀티에이전트 시뮬레이터 레인 (§6.G 축2)

### 실행 모델
- `RigDaemon.spawn(ctx)`: `dist/daemon-bundle/index.js` 직접 스폰, ready=`daemon.ping`.
- 페르소나 = `PipeClient` N개. **정직-main 규율(G6)**: 하네스가 페르소나당 workspaceId 1개 배정, 모든 호출에 그 값만 스탬프(예약 신원 `ws-human`/`local-ui`·타 ws 자칭은 하네스가 거부). principal 필요 시 실 RPC(`a2a.principal.upsert`)로 등록.
- **실 PTY 세션(`RigSession`)**: wake worker 관련 검증은 live PTY 세션이 전제(`src/daemon/channels/channelWakeWorker.ts:88` listLiveSessions + 슬러그 매칭 + 출력 침묵 — Claude c/85). 데몬이 PTY 소유자이므로 `session.create`로 조용한 실셸(예: `sleep infinity`) 세션을 만들 수 있다 — 실경로, 백도어 아님. **단 v1 SIM 시나리오는 넛지 어서션을 하지 않으므로(S2·S4 재정의) RigSession은 하네스에 준비만 하고 소비는 E2E/후속에 예약.**

### 페르소나 6종 (§6.G 문면 6:6)
| 페르소나 | 행동 | v1에서 어서트 가능한 것 (리뷰 반영) |
|---|---|---|
| flood | 시드 기반 연사 | 유실·중복·seq 무결성·캡 |
| ping-pong | 둘이 서로 멘션 왕복 | **채널 무결성만**(무손실·순서·캡). ~~anti-loop~~ — 서버측 pair-cap은 미구현 보류 결정이고 replyGate는 렌더러 프롬프트 문자열(`src/renderer/hooks/channelMentionFlush.ts:131`)이라 SIM 관측면에 부재(Claude M/82). 넛지 폭주 가드(`channelWakeWorker.ts:35` 재넛지 캡→nudgeExhausted)는 live PTY 전제라 E2E/후속 몫 |
| dead | join·post 후 소멸 | unread 계정·수명주기 잔재·채널 기능 잔존 |
| hung | 연결 유지·무응답 | **채널 무결성**(무한 홀드 없음·unread 정확). ~~nudgeExhausted~~ — 동상(Claude c/85) |
| no-ack | 수신하되 ack 안 함 | **현행 계약 고정**: `deliveryStatus`는 ack로만 pending→delivered(`src/daemon/channels/ChannelService.ts:2083`, 스키마 `src/shared/channels.ts:159`) — ack 없으면 pending 유지를 어서트. **어서션 주석에 정본 좌표 필수**(Q1-2 P3가 이 계약을 뒤집을 때 리그가 함께 깨져 갱신을 강제하는 것이 의도 — Claude m/80) |
| boundary | 본문·evidence 캡 경계 | 경계 수용/거부 정확성(E12 캡 와이어 레벨) |

### 시나리오 8종
| id | 구성 | 핵심 어서션 (리뷰 반영) |
|---|---|---|
| S1 | flood ×8 | 전 도달·seq 연속·무중복(getMessages 전수 대조) |
| S2 | ping-pong ×2 | **핑퐁 부하 하 채널 무결성**(무손실·순서·캡·데몬 자원 바운드) — anti-loop 어서션 없음(존재하지 않는 계약) |
| S3 | dead ×3 + 정상 ×2 | unread·수명주기 수렴, 채널 기능 잔존 |
| S4 | hung ×2 + 정상 ×2 | **채널 무결성·무한 홀드 없음** — 넛지 바운드는 E2E/후속 예약 |
| S5 | no-ack ×3 | 현행 영수증 계약 고정(pending 유지 — 정본 좌표 주석) |
| S6 | boundary | 캡 경계 수용/거부(채널 본문·완료증거 E12) |
| S7 | flood 중 **데몬 SIGKILL→재스폰** | **단방 부분집합만**: {RPC ok 수신 커밋} ⊆ replay 결과. **미커밋 무부활은 어서트 불가** — AppendOnlyLog는 at-least-once valid-tail 승격 계약(`src/daemon/eventlog/AppendOnlyLog.ts:13-15,:254-269` — fsync 배리어 전 물리 write분이 부트 스캔에서 정당하게 승격될 수 있음, Claude c/80). **ack는 커밋 증거에서 제외**(flip 없으면 no-op ok — `ChannelService.ts:2185` 부근, Codex M12) — ack 효과는 후속 unread 질의로만 확인. graceful close는 별도 계약(pending 전원 false 확정 `AppendOnlyLog.ts:271-284`) — E2E-3과 혼동 금지 |
| S8 | A2A 전 수명주기(send→working→completed, 게이트 거부→재시도, 멱등 재전송) | §6.M 게이트·멱등·verifiedItemCount를 와이어 레벨로. + EPERM 카오스(unix): socket chmod 000 → 클라이언트 실패 격리·데몬 생존·복구 |

## 5. 파이프 클라이언트·어서션 (공유 기반)

- `PipeClient`: 도그푸드 `rpcCall` 패턴(`scripts/a2a-symmetric-reply-dogfood.mjs:66-70`) 정제·승격 + 정직-main 규율 내장(G6).
- `StateAssert`: `assertChannelSeq`·`assertUnread`·`assertTaskState`·`assertReplaySuperset`(S7 단방) 등 — **각 헬퍼 주석에 정본 코드 좌표 의무**(계약 이동 시 리그가 함께 깨지도록).

## 6. CI 편입 (G11)

- `.github/workflows/rig.yml`: `rig-sim`(3-OS, 데몬 번들만 — 저렴) + `rig-e2e`(v1 ubuntu Xvfb, `npm run package` 후).
- informational 시작. 승격 기준: main 2주 플레이크 <2% + 실증(§7) 완료 → 오너 결정.
- 플레이크 정책: 재시도 ≤1(재시도 통과는 warn — 침묵 금지), 시드·아티팩트(스크린샷·데몬 로그·이벤트로그 세그먼트) 업로드, quarantine 라벨.
- 비용: rig-e2e 패키징 — Baseline 아티팩트 재사용 검토(§11-4), v1은 자체 빌드.

## 7. 실검출 실증 (G9 — 2단, 리뷰로 후보 교체)

**절차**: 픽스 커밋을 스크래치 브랜치에서 revert → 리그 red(실패 로그 캡처) → main green → `rig/EVIDENCE.md` 기록.

| 단계 | 후보 | 잡는 시나리오 | 근거 |
|---|---|---|---|
| **①SIM (PR-R2 동봉)** | **#354 멱등-authz 순서**(`2264c4a` — 비참여자 키 재생 조회, **데몬측** `src/daemon/a2a/A2aTaskService.ts:329-334`) | S8 확장(비참여자 재생 시도 → authz 거부 어서트) | 데몬측이라 SIM 관측면에 정확히 도달. ~~v1의 1순위(ws-human create 우회)~~는 revert 대상(`2160acf`/`15a5324`)이 **라우터측**이라 SIM이 못 봄(데몬 가드 잔존 시 red 안 남 — Claude M/72) → 교체 |
| **②GUI (PR-R4)** | **크로스-ws 멘션 전달 회귀**(P1 — N-루프 패치 재적용, 패치 실재 확인: `~/.wmux-multiws-delivery.patch` 6652B) | E2E-2 | 분기 게이트 문면("GUI 회귀") 충족의 실물 |

**게이트 세만틱(오너 승인 필요 — §정정 R1)**: CL7 선행 게이트를 ①로 조기 개방(Q1 W1 항목 언블록), 분기 게이트 문면은 ②로 충족. 이 2단 해석 없이 문면대로면 Q1 W1 전체가 리그 4-PR 완주에 블록된다(Claude M/68).

## 8. 도그푸드 흡수 (G10)

29본 → `rig/CATALOG.md` 전수 목록화(absorb→시나리오 id / keep→수동 사유 / retire→중복 근거). 물리 삭제는 시나리오 CI 1주 그린 후 개별 PR.

## 9. PR 분할 (각각 독립 그린)

1. **PR-R1 — 하네스 코어 + SIM 스모크**: isolation(4-env·runId)·daemon·pipe(정직-main 규율)·assert + `vitest.rig.config.ts` + S1 + npm 스크립트.
2. **PR-R2 — 시뮬레이터 완성 + SIM 실증**: 페르소나 6종 + S1~S8(재정의판) + 카오스(SIGKILL·EPERM-unix) + CATALOG.md + **EVIDENCE.md ①단(멱등-authz revert 재현)** ← CL7 조기 게이트 개방.
3. **PR-R3 — GUI E2E 하니스**: `WMUX_CDP_PORT` 제품 additive(4줄) + RigApp(재시도·exit 리스너·타깃 선택) + screenshot + E2E-1~3. **선행: 스파이크 1.**
4. **PR-R4 — CI 편입 + GUI 실증**: rig.yml(informational) + EVIDENCE.md ②단(multiws 패치 재현).
5. (이후) required 승격 · E2E 3-OS · 카오스 잔여 2종 · 넛지 가드 시나리오(RigSession 소비) · §6.F fence 시나리오(§6.F 착지와 동시 — Claude m/70 예약).

## 10. 함정 (footgun)

1. 리그가 60번째 도그푸드가 되는 것 — 하네스 강제 + 카탈로그 규율.
2. 신원 백도어 유혹 — 커버 못 하는 검증(라우터 게이트·pane-principal 판정)은 §2.5 맵대로 유닛/E2E/이연. 제품 diff에 rig 전용 인증 경로가 보이면 리뷰 리젝. (`WMUX_CDP_PORT`는 인증 아닌 포트 고정 — 유일 허용 additive, G4 명시 결정.)
3. 전체 창 픽셀 diff — 금지, 요소 크롭만.
4. 공유 런 컨텍스트 — 금지, 시나리오당 fresh.
5. **win32 stdout 분리** — 패키지 GUI 앱의 stdout은 부모에 안 닿는다(`src/main/logSink.ts:4-8`). CDP 발견을 stdout에 걸면 win32 E2E가 구조적으로 불가 — G4가 env 우선인 이유.
6. win32 named pipe 전역성 — runId 필수(§2).
7. required 조기 승격 — informational 번인 먼저.
8. launch 데드락 — 하드 타임아웃 + `exit` 리스너 + stderr 채집(조기 종료는 즉시 실패).
9. **at-least-once tail 승격** — S7에서 "미커밋 무부활"을 어서트하면 정상 동작을 fail로 찍는다(로그 계약). 단방 부분집합만.
10. **graceful vs SIGKILL 혼동** — close는 pending false 확정, SIGKILL은 tail 승격 가능. E2E-3(정상종료)과 S7(SIGKILL)의 어서션 계약이 다르다.
11. ack를 커밋 증거로 세는 것 — no-op ok가 있다(M12).

## 11. 열린 질문 (스파이크)

1. **[PR-R3 전제, 1일]** 3-OS 패키지 앱에서 (a) `WMUX_CDP_PORT` env 관통 (b) 앱 메인 윈도의 connectOverCDP 타깃 노출 (c) unix stdout 도달(폴백용) (d) HOME 오버라이드 하 `os.homedir()` 추종(데몬 소켓 위치) — 4개를 한 스파이크로 실증.
2. ~~`WMUX_CDP_PORT` 도입 여부~~ → **G4로 결정 완료**(v1 정식).
3. **[이연]** 디스크풀·시계점프 카오스의 포터블 구현 — Linux 한정(tmpfs 쿼터·libfaketime) vs fault-injection seam의 경계. §정정 R2.
4. **[PR-R4]** rig-e2e 패키지 빌드의 Baseline 아티팩트 재사용.
5. **[v1 밖]** 워커 spawn(execute:true) 시나리오 — 실 Claude CLI 의존이라 CI 불가. 가짜 CLI 스텁(PATH 주입)은 §6.F fence 시나리오와 함께 설계(§9-5 예약).

---

## 로드맵 정정 제안 (오너 승인 — **2026-07-08 둘 다 승인됨**)

- **R1 — 분기 게이트 문면의 2단 해석** ✅승인: :164/:166 "리그 실검출(GUI 회귀) 1건"을 "①SIM 실검출 = CL7 선행 게이트 조기 개방 / ②GUI 실검출 = 분기말 게이트"로 2단화. 문면대로면 Q1 W1 전체가 리그 완주에 블록(§7). → **PR-R2 착지(=①) 시점부터 Q1-2 이하 W1 항목 착수 가능.**
- **R2 — 카오스 4종 중 2종(디스크풀·시계점프) v1 이연** ✅승인: §6.G :359 문면 이탈 수용. EPERM은 unix 한정 편입, SIGKILL은 완전 편입. 잔여 2종은 리그 v1.1+.

## 리뷰 로그

### 1라운드 — 3모델 패널 (2026-07-08)

Codex(read-only 실코드) 13건 + Claude 적대(Opus, 실코드) c4/M5/m다수 + 오케스트레이터 자체 검증 2건. **GLM 5.2는 게이트웨이 529 ×3으로 미착지 — 복구 시 델타 라운드로 반영 예정.**

| # | 합의 | 발견 요지 | 반영 |
|---|---|---|---|
| P1 | 2-MODEL(Claude c/82·Codex M6) | win32 패키지 앱 stdout 미도달(logSink 자백) — stdout 파싱 CDP 발견 구조적 파탄 | G4 반전(env 우선), footgun 5, 스파이크 1 확장 |
| P2 | 2-MODEL(Codex C1/95·Claude M/90) | 데몬 verbatim 신뢰 — "동일 표면" 거짓 + main 라우터 3중 게이트가 **양 레인 사각**(E2E도 mutate-local 우회) | G6 재작성(정직-main 규율), §2.5 커버리지 맵 신설 |
| P3 | Codex C2/98 | "실등록 경로" 위반(자칭 ws-sim) | G6 — 실 RPC(`principal.upsert` :2041) 등록 + 헤드리스 정합 해석 명시 |
| P4 | 2-MODEL(Claude c/80·Codex M12) | S7 "미커밋 무부활"이 at-least-once tail 승격 계약과 모순 + ack no-op ok | S7 단방 부분집합 재정의, footgun 9·11 |
| P5 | 2-MODEL(Claude c/85 + 자체) | S4 nudgeExhausted는 live PTY 전제 — SIM 발동 불가 | S4 재정의(무결성만), RigSession 예약 |
| P6 | 2-MODEL(Claude M/82 + 자체) | S2 anti-loop은 서버측 부재(pair-cap 미구현·replyGate는 렌더러 프롬프트) | S2 재정의(무결성만) |
| P7 | Claude M/68 | CL7 선행 게이트 × R4-최후 실증 = Q1 W1 전체 인질 | G9 2단화, §7, 정정 R1 |
| P8 | Claude M/72 + Codex m11 | SIM 실증 1순위(ws-human)는 라우터측 revert라 SIM 미도달 | 후보 교체(#354 멱등-authz — 데몬측) |
| P9 | Codex M3/M4 + Claude m/88 | win32 4-env 미격리 + suffix 불일치(-rig vs -rig-{id}) | §2 재작성(4-env·runId 통일) |
| P10 | Claude M/70 + Codex m7 | connectOverCDP 레이스(로그=모듈로드, listen=app.ready) + exit 리스너 부재 | §3 재시도 루프·리스너 |
| P11 | Codex M8 (Claude "방어가능"과 절충) | 카오스 3종 이연 = 문면 이탈 | EPERM(unix) 편입, 잔여 2종 정정 R2 |
| P12 | Codex M5/m13 + 자체 | 인용 오류(경로 접두·constants:342·config:30-35)·소켓 위치 미실증 | 전수 교정 + 스파이크 1(d) |
| P13 | Claude m/70 | §6.F fence 레이스 미커버(12개월 안전망 대비 최대 공백) | §9-5 예약(§6.F 착지 동시) — v1 스코프아웃 명시 |
| 확인 | Claude 축③·축⑥ | 격리 모델(userData fail-loud)·durability ok방향·후보 실재(2264c4a·패치 6652B)는 견고 | 유지 |

---

## 산출물 경로

`plans/validation-rig-design-2026-07-08.md` (이 문서)
