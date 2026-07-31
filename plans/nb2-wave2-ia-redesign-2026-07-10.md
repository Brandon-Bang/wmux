# NB2 파동2 — IA 재설계 (2026-07-10)

- 정본 상위: `plans/strategy-reset-2026-07-09.md` §4 NB2 파동2 ("태스크/worktree 사이드바 1급, FleetView 모달→상시 크롬, Company 발견성, 타입 스케일 시맨틱 4단+밀도 완화. 설계는 직접, 구현은 위임")
- 작성: Fable 오케스트레이터 직접(판단 밀도 — 위 규칙대로 설계는 위임하지 않는다)
- 정찰 근거: 파동2 착수 시 Opus 정찰 1건(read-only, file:line 인용 — 본 문서 §1~4 판단의 사실 기반)

## 0. 실행 순서 판단 — 4항목을 3사이클로 분할

4항목은 서로 결합도가 다르다. 한 PR로 묶으면 리뷰 폭발·롤백 단위 불명확. 결합도 기준으로 분할:

1. **사이클 A — FleetView 모달→상시 크롬** (독립적, 데이터 의존 없음, 즉시 착수)
2. **사이클 B — Company 발견성 + 타입 스케일 4단 재토큰화** (둘 다 파동1 연장선 — 시각-불변 규율 재사용, 병렬 가능하지만 리뷰 부담상 한 워커에 순차 위임)
3. **사이클 C — 태스크/worktree 사이드바 1급** (**J1 fan-out 배선 대기** — 아래 §4 판단)

## 1. 사이클 A — FleetView 모달→상시 크롬

**현황**(정찰): `AppLayout.tsx:1358`에서 `{fleetViewVisible && <FleetView/>}`로 조건부 마운트, `fixed inset-0` 오버레이 + `z-[var(--z-fleet)]` 백드롭(`FleetView.tsx:342`). `ChannelDock`은 이미 flex 형제 패턴(`AppLayout.tsx:1334-1338`)으로 동일 문제를 풀어놓은 선례가 있다.

**결정**: FleetView를 ChannelDock과 같은 **flex-row 형제 크롬**으로 전환한다. 모달(`role="dialog" aria-modal`, 백드롭 클릭-닫힘, 포커스 트랩)을 상시 패널(`role="region"`, 폭 고정 열림/닫힘 토글, 페인 reflow)로 바꾼다. 3탭(fleet/approvals/remote) 구조는 유지 — 상시 크롬 안에서도 탭 전환은 그대로 필요.
- 시각 회귀 관리: 열림 상태의 내부 레이아웃(FleetCard 그리드 등)은 폭이 좁아지므로(전체화면 82vh 모달 대비) **반응형 그리드 열 수 축소**가 불가피 — "시각 불변"이 아니라 "기능 불변"이 검증 기준(파동1과 다른 성격, 정직히 구분).
- 승인 표면 3중화(§5 정찰) 정리는 이 사이클에 묶지 않는다(스코프 팽창 방지) — 후속 이슈로 기록.
- Ctrl+Shift+A 토글 시맨틱: 상시 크롬에서는 "열기"가 아니라 "포커스/열림 토글"로 의미가 바뀐다 — 기존 키바인딩 유지, 동작만 재정의.

## 2. 사이클 B-1 — Company 발견성

**현황**: 헤더 토글(`Sidebar.tsx:98-126`)과 상태바 배지(`StatusBar.tsx:116-155`) 모두 `COMPANY_MODE_ENABLED` 뒤에 숨어있고, 상태바 표시는 `sidebarMode==='company'`일 때만 — 즉 진입 전엔 존재 흔적이 0.

**결정**: `COMPANY_MODE_ENABLED`가 완결 기능 게이트인지 확인 후(워커가 정찰 — 기능이 완성됐다면 플래그 제거가 곧 "발견성" 해법), 상태바 배지는 **company 모드 진입 여부와 무관하게 상시 표시**(회사가 존재하면 아이콘, 없으면 "+Create"류 CTA)로 바꾼다. 사이드바 헤더 토글은 워크스페이스 리스트와 대칭인 상시 아이콘으로 승격.

## 3. 사이클 B-2 — 타입 스케일 4단 재토큰화

**현황**: 토큰 4종은 파동1에서 이미 정의(`globals.css:284-317`)됐지만 적용은 3곳뿐. `text-[Npx]` 하드코딩 248회/31파일(10px×105, 11px×96, 9px×29, 12px×10, 8px×7, 13px×1).

**결정**: 파동1과 동일 규율(다크 테마 값 불변 지향, byte-identical 목표) 재사용 + 밀도 완화(오너 "8~11px 남발" 불만이 목표)를 결합한다.
- 매핑 규칙: 8~9px 다수를 `--text-caption`(밀도 완화로 caption 사이즈 자체를 9→10px 상향 검토 — 이 부분만 시각 변경 허용, 나머지는 토큰 스왑만)로, 10~11px을 `--text-body`로, 12~13px 헤딩류를 `--text-title`로 흡수.
- 전량 248회를 한 PR로 몰지 않는다 — **고빈도 상위 5개 파일**(정찰: CompanyPanel, WorkspaceItem/WorkspaceContextLine, ChannelsPanel, FleetCard 등 — 워커가 실제 카운트로 확정)부터 1차. 나머지는 후속 파동.
- 밀도 완화(패딩/줄간격)는 별도 서브커밋으로 분리(토큰 스왑=기계적, 밀도=시각 판단 — 롤백 단위 분리).

## 4. 사이클 C — 태스크/worktree 사이드바 1급 (보류 판단)

**현황**: worktree는 렌더러에 배지(⊕) 하나뿐(`WorkspaceItem.tsx:97`), WorkTask(J0)는 **렌더러 참조 0건** — 데몬/공유 계층에만 존재, MCP 노출도 J1로 연기됨(J0 설계 문서 원문).

**착수 판단 갱신(2026-07-10, 같은 날 재정찰)**: 착수 시점엔 J1 미착수였으나, 이후 (별도 워크스트림에서) `feat/j1-fanout` 브랜치가 진행되어 스키마·API 표면이 이미 확정됐다(`src/shared/workTask.ts`, `FanOutService.ts`, `TaskWorktreeManager.ts`, `task.mission.list`/`task.mission.update` RPC, 렌더러 `FanOutDialog.tsx`). **구현은 여전히 보류**(브랜치 미머지 — main 위 작업이 안전한 착수점) 하되, **설계는 이 스키마를 근거로 지금 확정한다**.

**설계(구현은 J1 머지 후)**:
- `WorkTask.paneGroupId`가 곧 태스크 전용 워크스페이스 id다(스키마 주석: "태스크 실행 단위 = 전용 워크스페이스"). 즉 fan-out으로 생긴 태스크는 **이미 존재하는 workspace 객체 중 하나**이지 신규 렌더러 개념이 아니다 — Sidebar가 `task.mission.list`로 얻은 `WorkTask[]`를 `paneGroupId → WorkTask` 맵으로 만들어 해당 workspace 행에 배지 대신 **미션 섹션**(별도 그룹 헤더 "Missions" 아래, title·status·missionChannelId 링크)으로 승격하면 된다. 배지(⊕)는 "이 workspace가 worktree다"라는 저수준 사실만 계속 표시하고, 미션 섹션은 "이 workspace가 fan-out 태스크다"라는 상위 개념을 얹는 방식으로 **공존**(worktree ⊂ task, 모든 task가 worktree는 아닐 수 있음 — broadcast-only 모드는 격리 없음, §6 C10).
- FleetView(사이클 A로 이미 상시 크롬) fleet 탭의 각 카드도 `paneGroupId` 매칭이 있으면 미션 title·상태를 부가 표시할 수 있다 — 신규 UI 표면 대신 기존 FleetCard 확장.
- 데이터 흐름: 렌더러가 `task.mission.list`를 폴링/구독(RPC 스트림 유무는 J1 실코드 확인 필요 — 폴링이면 채널 unread 갱신과 같은 주기 재사용 검토)해 `WorkTask[]`를 스토어 슬라이스에 투영. 신규 슬라이스(`workTaskSlice`) 1개, `channel_mission_*`처럼 도메인 재발명 금지.
- **구현 트리거**: `feat/j1-fanout`이 main에 머지된 직후 착수 — 스키마 재확인(머지 전 최종 리뷰로 필드가 바뀔 수 있음) 후 위임.

## 5. 검증 공통 규율
- 사이클 A·B는 UI 변경 → **3모델 풀패널 리뷰**(제품 코드 변경, 전략 §115 리뷰 차등 — 파동1과 달리 순수 토큰 스왑이 아니라 구조 변경 포함이므로 경량 대상 아님). 단 B-2 토큰 스왑 서브커밋만 놓고 보면 파동1급 경량 대상일 수 있음 — 워커 산출물 성격 보고 오케스트레이터가 최종 판정.
- 각 사이클 별도 브랜치, 별도 PR. LEDGER에 사이클 단위로 기록.
