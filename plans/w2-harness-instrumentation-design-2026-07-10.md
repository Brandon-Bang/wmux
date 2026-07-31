# W2 — 하니스 N페인 계측 설계 (2026-07-10)

- 정본 상위 문서: `plans/strategy-reset-2026-07-09.md` §4 B2("상시 계측 승격") + §5 W2 2주차("하니스 N페인 계측 — B2 재개 게이트의 실체")
- 작성: Fable 오케스트레이터 직접(아키텍처 판단 — 해봐야 아는 축)

## 0. 목표

B2(엔진 재개)를 "여유 있음/실블록" 같은 무정의 판정이 아니라 **수치 게이트**로 만든다. 임계(프레임 p95 > 예산 2× 또는 IME 실패 재현) 초과가 곧 재개 트리거 — 자동으로 뭔가를 시작하는 게 아니라, 오너가 판단할 신호를 CI가 상시 기록하게 만드는 것이 산출물.

## 1. 어디에 붙이나 — `core/harness/`(E0) 아님, `scripts/perf-bench.mjs` 확장

E0 하니스(`core/harness/`)는 `@xterm/headless`로 바이트→그리드 정합성만 본다(GPU·실 렌더 없음). 이번 계측은 **프레임 예산·WebGL context-loss**처럼 실 GPU 렌더가 필요하다 — E0로는 원천 불가능. 반면 `scripts/perf-bench.mjs`(A1 벤치, `.github/workflows/perf.yml`)는 이미:
- 패키지된 실앱 + Playwright CDP로 8페인 inputLatency·RAM을 측정 중
- `--scrollback-lines`(긴 스크롤백 시드) · `--webgl-occupancy`(WebGL 캔버스 카운트) 플래그 보유
- `bench/history.ndjson` 상시 트렌드 기록 + `perf-compare.mjs` 회귀 게이트 기존재

**결정: 신규 하니스를 만들지 않고 이 인프라를 확장한다**(신규재발명 금지 — 프로젝트 관례, WorktreeManager 재사용 선례와 동일 원칙).

## 2. 4개 시나리오 스펙

### 2.1 N페인 동시 스트리밍 프레임 예산 (N=4/8/16)
- `measureInputLatency`가 이미 rAF 캐던스를 재는 패턴(rafDeltas/summarize)을 재사용해 **입력 없이** N페인이 동시에 합성 워크로드를 스트리밍하는 동안의 프레임 델타를 표본화하는 `measureFrameBudget(page, paneCount)` 신설.
- 스트리밍 소스: 각 페인에 `pane.split` 후 셸에 반복 출력을 흘려보낸다(예: `yes` 계열 또는 `printf` 루프 — 플랫폼 무관 결정적 텍스트 flood. Windows CI 전용 실행 경로이므로 `cmd /c "for /l %i in () do echo ..."` 류 검토, 워커가 최종 명령 확정).
- 측정: 30~60프레임 rAF 델타 표본 → p50/p95. 예산은 60fps 기준 16.7ms를 N별로 다르게 두지 않고 **N마다 별도 baseline**으로 기록(§3 게이트가 N별로 독립 비교).
- 기존 8페인 분기(`for i<7 pane.split`)를 `spawnPanes(client, n)` 헬퍼로 일반화해 4/8/16 모두 재사용.

### 2.2 한글 IME 시나리오
- CDP `page.keyboard`는 raw keydown/keyup만 지원 — 실제 IME composition은 `Input.imeSetComposition`(CDP 프로토콜, playwright-core는 미노출)이 필요할 수 있다. 대안: `page.evaluate`로 포커스된 `.xterm-helper-textarea`에 `compositionstart/compositionupdate/compositionend` + `input` 이벤트를 합성 디스패치해 "안녕"처럼 완성형 한글 문자열이 최종 echo에 정확히 도달하는지 검증.
- 실패 판정: (a) 프레임 정체(위 예산의 2배 초과) 또는 (b) echo된 텍스트가 입력 문자열과 바이트 단위로 불일치 — 이 경우 `imeScenario.pass = false`.
- 이 시나리오는 **정본 스펙 부재 상태로 처음 만드는 것**이므로 워커가 실제 xterm.js/wmux composition 처리 코드를 먼저 읽고(IME 관련 기존 코드: `src/renderer` 내 grep 필요) 합성 이벤트 시퀀스가 실제 브라우저 IME와 등가인지 근거를 보고할 것.

### 2.3 긴 스크롤백
- 이미 `--scrollback-lines N`으로 지원됨 — 신규 로직 없음. N페인 프레임 예산 측정을 `--scrollback-lines`와 조합해서 도는 추가 실행 조합만 CI 스텝에 추가(예: N=8 + scrollback=10000).

### 2.4 WebGL context-loss
- `measureWebglOccupancy`의 canvas 탐색 패턴을 재사용해, 포커스 페인의 WebGL 캔버스에 `WEBGL_lose_context` 확장을 `page.evaluate`로 강제 호출(`loseContext()`) → N프레임 대기 → `restoreContext()` → 재측정.
- 판정: 컨텍스트 복구 후 해당 페인이 검은 화면(빈 캔버스)으로 고착되지 않고 콘텐츠가 다시 그려지는지(픽셀 샘플링 또는 xterm.js의 내부 재초기화 콜백 발생 여부 — 워커가 실측 가능한 신호를 정찰해 확정) + 복구 소요 시간(ms).

## 3. 게이트 — `perf-compare.mjs` 확장

기존 `GATES`(비율+절대마진 회귀 게이트)는 숫자 회귀 전용이라 IME/WebGL의 불리언 정합성 판정에 안 맞는다. **신규 `BOOL_GATES` 배열**을 병행 도입:
- 항목: `{ key, label, path(불리언 필드 dot-path), scenarioPath }`
- 판정: baseline 무관 — `current !== true`면 그 항목은 즉시 FAIL(회귀 비교가 아니라 정합성 체크이므로).
- 숫자 게이트(N페인 프레임 p95)는 기존 `GATES` 배열에 `frameBudgetP95Ms_N4/N8/N16` 3항목 추가, ratio 2.0(전략 문서 "예산 2×"를 그대로 ratio로 사용) absMargin은 워커가 로컬 1회 실측 후 기존 항목들의 마진 스케일(10ms류)에 맞춰 정한다.
- **B2 재개 트리거는 하드 실패가 아니라 신호**: 위 신규 게이트들이 FAIL이어도 `perf.yml` 잡 자체는 기존처럼 nonzero exit로 실패해도 무방하다(전략 문서상 이 잡이 실패하는 것 자체가 "곪았다"는 신호이자 B2 재개 조건 ②). 다만 최초 착지 시점엔 baseline이 없으므로 record-only(기존 패턴)로 시작 — 이후 오너가 blessed baseline을 커밋해야 게이트가 살아난다(기존 `bench/baseline-ci.json` 관례 그대로).

## 4. CI 배선

`perf.yml`은 이미 push-to-main + PR(경로: `src/**`, `scripts/perf-bench.mjs`, `scripts/perf-compare.mjs`, ...)에서 돈다. `perf-bench.mjs`를 고치는 이번 변경 자체가 트리거 조건에 이미 포함되어 있어 워크플로 파일 구조 변경은 불필요 — CLI에 새 시나리오를 **기본 실행 경로에 추가**(옵트인 플래그 뒤에 숨기지 않는다. "상시 기록"이 요구사항이므로)하는 것으로 충분. 다만 45분 타임아웃 예산을 확인하고, 필요하면 `--frame-budget-panes 4,8,16`처럼 개별 스킵 플래그를 추가해 로컬 반복 실행을 가볍게 할 수 있게 한다(`--skip-cold`류 기존 관례와 동일).

## 5. 검증 범위(정직한 한계)

이 워크트리는 macOS이고 `perf-bench.mjs`의 대상(`out/wmux-win32-x64/wmux.exe`)은 Windows 전용 패키지 산출물이다 — **로컬에서 E2E 실행 불가**, 기존 S-A2 스파이크와 동일한 제약(로컬은 순수 로직 단위 테스트까지, CI 왕복이 실증). 워커는:
- 신규 순수 함수(프레임 통계 요약, IME 문자열 비교, 게이트 판정 로직)는 `scripts/__tests__/perfCompare.test.mjs` 패턴으로 유닛 테스트를 반드시 추가
- CDP/Playwright 의존 함수는 타입/구조만 정적 검증(tsc 대상 아님 — .mjs), 실행 검증은 오케스트레이터의 CI 왕복 몫으로 정직히 이관

## 6. 산출물

- `scripts/perf-bench.mjs`: `spawnPanes` 일반화, `measureFrameBudget`, IME 시나리오, WebGL context-loss 시나리오, CLI 플래그
- `scripts/perf-compare.mjs`: `BOOL_GATES` + 신규 숫자 게이트 3종
- `scripts/__tests__/*.test.mjs`: 신규 순수 로직 테스트
- `CHANGELOG.md`: Unreleased 엔트리(§4 B2 계측 게이트 신설)
