# E0 코어 베이스 결정 — 클린룸 기본값 (vte 파서 채용 + 자체 그리드)

- 상태: **v1.2** (2026-07-09) — v1.1(3모델 패널 반영) + **§9 로드맵 델타 R-E1~R-E4 오너 승인됨(2026-07-09)** + S-0 실빌드 결과(§8 대장 갱신). §10 리뷰 로그
- 작성: Fable 오케스트레이터 (판단·결정 직접). 사실 기반: Opus 리서치 워커 4기 병렬 보고(2026-07-09) + 코드베이스 직접 정찰 + 패널 실코드 검증
- 계약(정본): `roadmap-12mo-world-no1-2026-07-05.md` §3.2(B2·P1~P3·킬스위치 2축) · §6.A(코어 스펙·후보표·하니스 4항목) · Q1-8(:157) · 분기 게이트(:166)
- 이 문서가 확정하는 것: E1(Q2) 코어 베이스의 **기본값** + E0 하니스 설계 + 스파이크 재설계. **최종 확정 조건 = §9 델타(R-E2·R-E3) 오너 승인 + S-A 0일차 검증·반증 게이트(§3 D1) 통과.** 실코드 착수는 승인 후.

---

## 0. TL;DR — 결정 요약

| # | 결정 | 한 줄 근거 |
|---|---|---|
| D1 | **코어 기본값 = 클린룸**: `vte` 0.15 파서 채용 + 자체 그리드(§6.A 확정 스펙), 신설 `core/wmux-term`. **확정 조건 2건**: ① R-E2 오너 승인 ② S-A 0일차 검증·반증 게이트(vte wasm 실빌드 + 탈락 3종 재현 실빌드 로그) | 기성 3종 전부 게이트+비용 종합 기각 — "무포크 채용"은 존재하지 않음. 포크 유지보수는 상시 판단밀도 비용, 클린룸+하니스는 기능 목록화 후 대부분 위임 가능(단 reflow·damage는 판단밀도 구간 — 오케스트레이터 공동) |
| D2 | **libghostty-vt 승격 기각** + E1 착수 전 재평가 조건 3개 | G2(reflow 제어 불가)+Windows 실검증 미완(wmux 본진)+C3/C5 비용(Zig 툴체인·프리빌드 3/6 부재·API alpha 무태그) 종합 |
| D3 | 유니코드: 데이터 파일 **Unicode 16.0.0 커밋** + 생성기 버전 파라미터화. 불일치 판정의 최종 오라클은 **UCD 원본**(unicode-width는 2차 참조) | 로드맵 문면(U16) 준수 + U17 승격 여지(데이터 교체 1커밋) |
| D4 | E0 하니스 스택: **녹화 스크립트가 코퍼스 정본**(.buf 채굴은 보조) + `@xterm/headless` 차등 러너 + **esctest 원본 무수정 실행**(GPL 격리 정책 §5-3) + cargo-fuzz + 4중 기준선 게이트 | RingBuffer .buf는 원형 tail만 보존(geometry 트레일 없음 — 패널 실코드 확인) → 결정적 재현은 녹화만 가능. esctest 전 계보 GPL-2.0 판명 |
| D5 | 이중 타깃: **napi-rs(메이저 버전 핀, 6조합 optionalDependencies)** + **wasm-bindgen**, 단일 크레이트 `cfg` 분기. S-A 0일차에 vte+wasm-bindgen+napi-rs MSRV 교집합 확인 | napi-rs는 N-API ABI 안정(electron-rebuild 불요) — node-pty(gyp 수동 패치)보다 정돈. 단 wasm+napi 동시 산출 정확 선례 미확정 → S-A가 실증 |
| D6 | 스파이크 재설계: **검증·반증(0일차) + S-A1 로컬 배관(2) + S-A2 CI·서명(3) + S-B 차등 PoC(2) + S-C esctest(2) = 9일** | 후보 비교는 리서치+반증 실빌드가 대체(R-E2 승인 전제), 코드 스파이크는 미검증 배관에 집중. S-A2에 **macOS 서명 무회귀** 1급 기준 |

**분기 게이트 충족 지도**: "코어 베이스 결정 문서(서명·프리빌드 축 포함)" = 본 문서 — **R-E2·R-E3 승인 조건부**. / "xterm.js 자신이 코퍼스 100% 기록" = §5-2 4중 기준선(자기일치 단독으로는 통과 불가).

---

## 1. 결정 프레임 — 하드 게이트 3 + 비용 축 5

로드맵 §6.A 평가 축을 게이트/비용으로 이원화한다. **게이트 실패 = "무포크 채용" 불가**(포크·재구현 비용으로 환산해 비용 축과 합산 판정). *리뷰 반영: 게이트 정의를 어댑터 경계 기준으로 정밀화, 업스트림 안정성은 게이트에서 비용 축으로 이동(P1 정합).*

**하드 게이트**:
- **G1 이중 타깃**: 동일 코어가 `wasm32-unknown-unknown` + N-API(win/mac/linux × x64/arm64)로 빌드되는가. 근거는 P2/P3가 아니라 **§6.A 아키텍처 문면 자체**("두 타깃으로 빌드 — ① wasm32(렌더러 워커) ② N-API(데몬)"). wasm 타깃의 용처는 P3 규율 안에서다: 렌더러의 xterm.js **폴백 대체**·오프라인 차등검증·E2 렌더러의 damage 소비 보조 — 상시 이중 파싱이 아니라도 타깃 자체는 필수(폴백이 킬스위치의 전제).
- **G2 HostReflow**: **어댑터 경계에서 이중 reflow 차단을 증명할 수 있는가**(내부 스위치 유무가 아니라 통제 가능성). ConPTY(win32, build 21376+ — 현행 `useTerminal.ts:308` 분기)가 자체 reflow하므로 코어 reflow를 끄는 경로가 어댑터에서 강제 가능해야 한다. reflow_mode 결정 규칙은 §6-3 전이표.
- **G3 계약 강제 가능성**: 우리 4표면 계약(feed/resize/snapshot/events)을 어댑터 경계로 강제할 수 있는가(P1). — 업스트림 API의 **안정성·배포 상태는 게이트가 아니라 비용 축 C5**로 평가한다(핀·벤더·포크 추적 비용).

**비용 축**: C1 damage 품질 / C2 유니코드(U16+·UAX#29·mode 2027) / C3 서명·프리빌드·공급망 / C4 이벤트 표면 — **OSC 133은 C4 내 최대 가중**(ASP §6.K의 결정적 신호; 클린룸에선 우리 구현이라 무비용, 기성 채용 시 패치 비용으로 계상) / **C5 업스트림 안정성·배포 상태**(무태그·미게시·alpha 선언 = 핀·벤더 관리 + breaking 흡수 비용).

---

## 2. 후보 4종 판정표 (사실 근거 — 워커 4기 보고, 1차 출처 검증. 출처 키는 부록 A)

| 축 | alacritty_terminal **0.26.0**(2026-04-06) | wezterm-term **0.1.0 미게시**(main 2026-07-07 활동) | libghostty-vt **무태그**(ghostty 모노레포 main) | 클린룸 (vte **0.15.0** + 자체) |
|---|---|---|---|---|
| G1 wasm32 | ❌ `lib.rs`가 tty/event_loop/thread **무조건 컴파일**, `polling`(epoll/kqueue/IOCP)·rustix 무조건 import, 끄는 feature 없음(유일 feature=serde) — 어댑터로 우회 불가(빌드 그래프 문제), 포크 필수 | ❌ 상태머신 본체(`TerminalState`)가 std 전용 — terminfo(파일시스템)+termwiz(libc/nix/termios). no_std 서브크레이트 4종은 있으나 그 위 그리드·상태머신 재구현 = 클린룸과 수렴. wasm 요청 #181 open(2020~) | ⚠️ `wasm.h` 실재(`__wasm__` 가드), 공식 "WebAssembly 호환" 선언. 타깃 triple 미확정·공식 wasm 아티팩트 미배포 | ✅(S-A 0일차 실빌드로 확증) vte no_std — 비선택 의존 arrayvec·memchr(전수는 S-A 0일차 `cargo tree`로 확정) |
| G1 N-API | 선례 미발견 | 선례 미발견 | ⚠️ coder/libghostty-vt-node 실재(MIT) — 프리빌드 **Linux x64/arm64·mac arm64뿐**(win 전체·mac x64 부재), 이벤트 API 없음, 초기 단계 | ✅ napi-rs 표준 매트릭스 6조합 전부 커버 |
| G2 HostReflow(어댑터 통제) | ⚠️ 가능 — grid 레벨 `resize(reflow: bool)` 존재, 단 `Term::resize`가 alt-screen로 자동 결정이라 `grid_mut()` 우회 래퍼 필요 | ❌ 불가 — `Screen::resize` 내부에서 rewrap 강제(`is_conpty`는 스크롤백 gravity만), 어댑터가 개입할 표면 없음 → 포크 필수 | ❌ 불가 — C API에 스위치 없음, reflow가 DECAWM 종속(내부 Zig 함수는 C 경계 밖) | ✅ `reflow_mode`를 계약에 설계 |
| G3 계약 강제 | △ 4표면 전부 형상 불일치(feed 없음 — 외부 Processor 조합·damage pull·이벤트 push) — 어댑터로 가능하나 두꺼움 | △ 어댑터로 가능(advance_bytes+seqno+Alert 큐잉) | △ 어댑터로 가능(vt_write+render pull+콜백 큐잉) | ✅ 계약=구현 |
| C1 damage | 라인 단위+라인당 **단일 span**(불연속 변경 min~max 뭉갬), full-invalidate 15곳+(INSERT 모드 중 매 프레임 Full) | seqno 기반 `get_changed_stable_rows` — 행 단위, 모델 양호 | row 단위 2층 dirty(global 3상태+per-row), 수동 리셋 계약 | DamageBatch(행 내 런 span) 설계 — 참조: wezterm seqno |
| C2 유니코드 | ❌ char 단위+zerowidth 리스트(UAX#29 아님), ZWJ 클러스터 폭2 보장 없음, mode 2027 없음(vte ansi는 2026만). 폭 U17 | ✅ U16+grapheme+ZWJ/VS16+2027(단 영구 on) | ✅ U17+2027+VS15/16 완비 | ✅ 재료: unicode-width 0.2.1=U16/0.2.2=U17(태그별 `UNICODE_VERSION` 확인), unicode-segmentation 1.13.3, ghostty lut 알고리즘 |
| C3 프리빌드·서명 | (선례 없음 — 자체 구축) Rust 단일 | 동일 + 의존 무게(image·terminfo·miniz_oxide·fancy-regex·pest) | **Zig 0.15.x 툴체인 추가**(1.0 전 breaking 리스크)+win/mac-x64 프리빌드 선례 부재+핀 커밋 vendor | Rust 단일 + napi-rs 표준 파이프라인 |
| C4 이벤트(OSC 133 최대 가중) | ❌ vte **ansi 레이어**가 OSC 7·133 unhandled 폐기 — 패치 필요 | 파서는 OSC 7/8/52/133 전부 구조화(Alert에 8·52 없음 — 큐잉 어댑터) | OSC 133/8/52/7 인식(동기 콜백+pull 혼합, 클립보드 콜백 부재) | raw `osc_dispatch` 직접 dispatch — OSC 133·7·8·52를 1급 이벤트로 |
| C5 업스트림 안정성 | 안정 릴리스(연 2~4회, crates.io) | **미게시**(0.1.0 고정, #6663 미해결)·"내부 사용 외 안정성 보장 없음" — Tattoy가 포크 재게시로 우회 중 | C API **"public alpha, definitely going to change"** 명문+무태그(태깅 목표 2026-03이었으나 미확인). 코어 로직은 stable 구분 | 자체 소유(비용 0) |

**판정.** 기성 3종 중 "무포크 채용" 가능한 것은 없다: alacritty_terminal은 G1 빌드 그래프 실패+C2·C4 재작업(Cell 모델 교체) 합산으로 전면 개조와 등가. wezterm-term은 wasm 경로=재구현+C5(미게시). libghostty-vt는 §3 D2. — 단 이 판정은 소스 독해 기반이므로, **탈락 3종의 G1/G2 실패를 재현 실빌드로 반증 확인**하는 절차를 S-A 0일차에 둔다(§3 D1 확정 조건 ②, 각 ≤반나절: 재현 명령은 부록 A).

---

## 3. 결정과 근거

### D1 — 클린룸 기본값 (vte 0.15 채용 + 자체 그리드) · 확정 조건 2건

로드맵 §6.A "권고 기본값: 클린룸"을 유지·강화한다. 근거:

1. **소거**: §2 — 기성 3종 전부 게이트+비용 종합 기각. "베이스 채용"의 실질이 전부 "포크+대개조"로 판명. 포크는 업스트림 추적이라는 상시 판단밀도 비용을 만든다(실행 주체가 Opus 워커인 우리에게 최악의 비용 형태).
2. **클린룸의 원래 리스크(공수 최대)가 리서치로 절하됨** — 단 "스펙 완결 기계 작업"은 **조건부**다: 파서는 vte로 빌리고(no_std·Apache-2.0 OR MIT·MSRV 1.62.1), 폭 테이블(unicode-width 태그+ghostty lut 알고리즘)·그리드 자료구조(§6.A 확정 스펙 기존재)·reflow **참조 구현 2개**(alacritty `grid/resize.rs`·wezterm `rewrap_lines`)가 기성이다. **E1 스펙 문서가 VT 기능 in/out 목록(DEC 모드·마진·탭·문자셋·SGR·DCS·UTF-8 복구·스크롤 영역·alt-screen …)을 하니스 케이스와 1:1 매핑한 후에야** 대부분이 위임 가능해지고, **reflow·damage 산출은 '해봐야 안다' 구간으로 분류해 오케스트레이터 직접/공동 구간으로 남긴다**(CLAUDE.md 위임 판별법 준수 — 리뷰 반영).
3. **선례(부류 한정)**: Rio(MIT)가 "빌린 파서(copa — **vte의 Rio 포크**) + 자체 그리드 + 자체 폭 크레이트 + native/wasm 이중 출하"로 실재 — **아키텍처 부류의 존재 증명**이다(vte 특정 선택의 증명은 아니며, 그것은 S-A 0일차 실빌드가 담당 — 리뷰 반영).

**확정 조건(이 중 하나라도 실패 시 §2 재판정으로 복귀)**:
- ① §9 R-E2·R-E3 오너 승인.
- ② **S-A 0일차 검증·반증 게이트**: (a) vte `cargo build --target wasm32-unknown-unknown --no-default-features` 통과 + `cargo tree` 의존 전수 확정(U1) (b) 탈락 3종 재현 실빌드 — 부록 A 명령 실행, 실패 로그를 결정 증거로 첨부(각 ≤반나절) (c) vte+wasm-bindgen+napi-rs(버전 핀) MSRV 교집합 확인.

**파서 서브결정 — vte** (vs wezterm-escape-parser / vtparse): wezterm-escape-parser는 OSC 구조화가 매력이나 미게시(C5 동일 문제)+시맨틱이 그들 enum에 결합. vtparse는 동적 OSC 버퍼가 장점이나 모노레포 소속+대형 match 컴파일 비용 이슈(rust-lang/rust#81124). vte는 crates.io 게시·독립 저장소·최소 의존이며, **raw `Perform` trait(8콜백)만 쓰고 `ansi` 피처는 쓰지 않는다** — OSC 7/133 폐기는 ansi 레이어의 문제고 raw `osc_dispatch(&[&[u8]])`에는 전 파라미터가 도달한다. **채용 조건 2건**: ① vte 공개 퍼저 부재 — E0 퍼저(§5-4)가 vte+그리드 통합을 직접 커버 ② vte 고정 OSC 버퍼 — 대형 OSC(iTerm2 이미지류)는 v1에서 절단+이벤트 플래그 명시 처리, E4(Kitty graphics)에서 재평가.

### D2 — libghostty-vt 승격 기각 + 재평가 조건

로드맵 승격 조건("damage·직렬화·이중 타깃 충족 시 최우선 대안")은 부분 충족(damage row 단위 있음 / 직렬화는 formatter 문자열 — CellRun 아님 / wasm 선언 있음·실물 미검증). 기각은 **게이트·비용 종합**이다:
- **G2 실패**: 어댑터 경계에서 reflow 통제 불가(C API 무스위치·DECAWM 종속) — Windows 본진 제품이 감수 불가.
- **Windows 실검증 미완**(heise 보도 문면) — 우리 최대 시장이 그들의 미검증 지대.
- **C5**: C API "public alpha·definitely going to change"+무태그 — 핀 커밋 vendor 강제(coder 선례), breaking 흡수가 우리 분기 계획 밖.
- **C3**: Zig 0.15.x 툴체인 추가 + 6조합 중 3조합 프리빌드 선례 부재.

**재평가 조건(E1 착수 직전 1회, 전부 충족 시에만 스파이크 재개)**: ① 태그된 버전+안정성 문구 완화 ② Windows 빌드 공식 검증(CI 증거) ③ reflow 제어 API. **잔존 가치**: 차등 러너 제3 레퍼런스 후보 — 단 coder 바인딩은 `snapshot()`뿐이고 속성(fg/bg·플래그) 커버리지 미확인이므로 **커버리지 사전 확인 후에만** dev-dependency 채용(불충분 시 (c)'스펙 모호' 심판 축은 E1로 이월 — 리뷰 반영).

### D3 — 유니코드 데이터 버전

데이터 파일 **Unicode 16.0.0 커밋**(로드맵 문면 준수) + 생성기 버전 파라미터화(U17 승격 = 데이터 교체 1커밋). 검증 크레이트는 unicode-width 0.2.1(U16 정확 일치 태그). **U6 불일치 판정 규칙: UCD 원본이 최종 오라클, unicode-width는 2차 참조**(리뷰 반영). 생태계(alacritty·ghostty)는 U17 — 차등 러너 (d)분류(§5-2)와 함께 운용.

### D4 — E0 하니스 스택 (상세 §5)

- **코퍼스 정본 = 녹화 스크립트** (리뷰 반영 — M1 재설계): RingBuffer `.buf`는 **원형 tail만 보존하고 geometry 트레일·초기 상태가 없어**(실코드 확인) 결정적 재현의 정본이 될 수 없다. 대표 워크로드 8종은 녹화기가 초기 geometry부터 resize 이벤트까지 스크립트 주도로 기록한다. `.buf` 채굴은 **보조**(퍼저 시드·mid-stream 강건성 케이스 — "경계 절단 입력 무크래시"는 오히려 퍼저 가치)로 강등.
- 형식: alacritty ref-tests 차용 — `{name}/recording.bin` + `events.jsonl`(초기 geometry·resize·reflow_mode 트레일) + `expected.grid.json` + `meta.json`(seed·워크로드 스크립트 해시).
- 차등 러너: `@xterm/headless` 6.0.0(**devDependency 신규 추가 필요** — 현 package.json 부재, 리뷰 반영) — IBufferCell로 문자·폭·fg/bg(+색모드)·9플래그 판독. 명시 한계: isDoubleUnderline 부재·**headless 기준선에 Unicode11Addon 로딩을 명시 고정**(본체 renderer와 동일 폭 모델 — lockfile 핀).
- **esctest: 원본 무수정 실행** — GPL-2.0 판명(전 계보). 격리 정책은 §5-3.
- 퍼저: cargo-fuzz 자체 타깃 신규(vte·wezterm 공개 fuzz 부재 확인).
- **코퍼스 데이터 거버넌스** (리뷰 반영 — 3-MODEL): 저장소 커밋 가능한 코퍼스는 **합성·스크립트 녹화만**. 실세션 유래(.buf 채굴 포함)는 ① 로컬 전용(커밋 금지·`.gitignore`) ② 옵트인 ③ 다층 스크럽(§6.E 패턴 + Bearer/쿠키/SSH 키/URL 자격증명/base64 고엔트로피) ④ **수동 감수 통과 후에만** 합성 재구성으로 승격(원 바이트 직접 커밋 금지) ⑤ 로컬 보관분은 §6.E와 동일하게 secret-span 표시+at-rest 취급.

### D5 — 이중 타깃 파이프라인

단일 크레이트 `core/wmux-term`, `cfg(target_arch = "wasm32")` 분기로 wasm-bindgen / **napi-rs(메이저 버전 명시 핀 — S-A 0일차에 최신 안정 메이저 확정)**. napi-rs 표준 매트릭스 6조합+optionalDependencies+ABI 안정(electron-rebuild 불요)으로, 두 번째 애드온이 첫 번째(node-pty: gyp 수동 패치+postPackage 프루닝+spawn-helper 서명 예외)보다 가볍다 — C3 결론. 미검증 잔여: wasm+napi 동시 산출 정확 선례 미확정(Biome=네이티브+wasm 3종, Rio=native+wasm — 인접 선례) → **S-A 실증**. macOS 서명은 기존 entitlements 프레임에 신규 .node 편입 — **S-A2의 1급 무회귀 기준**(리뷰 반영).

### D6 — 스파이크 재설계 (로드맵 델타 R-E2, §9 — 오너 승인 조건부)

| 스파이크 | 기간 | 내용 | 통과 기준 |
|---|---|---|---|
| S-0 검증·반증 | 1일 | D1 확정 조건 ②: vte wasm 실빌드+cargo tree / 탈락 3종 재현 실빌드(부록 A) / MSRV 교집합 | 실행 로그 전건 첨부 — vte 실패 시 D1 재판정 복귀 |
| S-A1 로컬 배관 | 2일 | 크레이트 스켈레톤(vte+빈 그리드+feed 에코) → **로컬 win 단일 플랫폼**에서 napi 애드온+wasm 산출, 개발 Electron 로드 + **마이크로벤치 2개**(vte 단독 feed 네이티브 / wasm 스켈레톤 feed) | 양 타깃 로드·호출 성공 + 처리량이 예산(500/150MB/s) 오더의 ≥50%(미달 시 설계 재검토 트리거 — 리뷰 반영) + wasm 인스턴스 3개 동시 로드 메모리 오더 기록 |
| S-A2 CI·서명 | 3일 | 6조합 프리빌드 CI + optionalDependencies 패키징 + **패키지드 앱 로드(win)** + **macOS 서명·공증 무회귀**(신규 .node의 osxSign·프루닝 편입) | 6조합 아티팩트 + win 패키지 로드 + mac 서명 파이프라인 그린 |
| S-B 차등 PoC | 2일 | @xterm/headless에 녹화 코퍼스 1개(vim) feed → IBufferCell 전셀 추출 → diff 엔진 왕복 + 처리량·시간 계측 | 셀 diff 리포트 + 결정성(2회 일치) + xterm.js 기준선 수치 산출 |
| S-C esctest | 2일 | **선행 반일: esctest 80파일의 의존 질의(CPR/DECRQCRA/DECRQSS) 매핑**(U4 해소) → PTY 시뮬레이터 배관 → 왕복 실증 | **DECRQCRA 왕복 1건 + cup.py(CPR 기반) 완주** — 실패 시 §7 폴백(esctest 축 축소) 진입 전 결정 트리 실행 |

계 9일(로드맵 "2주 스파이크" 예산 내). S-B·S-C는 코어 없이 성립(xterm.js가 첫 피검체) — "하니스가 코어보다 먼저" 원칙의 실행형.

---

## 4. 기각 후보의 잔존 가치 (참조 지도 — 구현 시 정독 목록)

| 출처 | 가져올 것 | 라이선스 취급 |
|---|---|---|
| alacritty `grid/resize.rs` | reflow(WRAPPED 체인 재절단) 알고리즘·에지 | Apache-2.0 — 알고리즘 참조, **참조 후 자체 작성**(이식 시 NOTICE) |
| alacritty `tests/ref/` | 코퍼스 형식(recording+grid.json)·러너 패턴 | 형식 차용(코드 아님) |
| wezterm `screen.rs` | seqno 변경 추적 모델·StableRowIndex 3계 좌표 | MIT — 모델 참조 |
| wezterm escape-parser `osc.rs` | OSC 7/8/52/133 파싱 에지 체크리스트 | MIT |
| ghostty `lut.zig`·`grapheme.zig` | 3단계 LUT 생성·grapheme 폭 규칙(2027 시맨틱) | MIT — 알고리즘 참조(Zig) |
| ghostty `snapshot.zig` | 파서 상태 직렬화 범위(§6.E 키프레임 연동) | MIT |

*(리뷰 반영: kitty(GPL-3.0) 행 삭제 — "케이스 아이디어 참조"도 표현 복제 리스크. 컨포먼스 케이스는 esctest 실행·vttest·alacritty 형식·DEC/ECMA 규격에서만 도출.)*

## 5. E0 하니스 설계 (Q1-8 산출물 본체)

위치: `core/harness/`(TS) + `core/wmux-term/fuzz/`(Rust). CI는 `rig.yml` 선례대로 informational 편입 후 승격.

### 5-1. 녹화기 + 코퍼스 (M1)
- `core/harness/recorder.ts`: 스크립트 주도 녹화 — 초기 geometry 기록 → PTY 스폰 → 워크로드 스크립트 실행(resize 시점 포함) → `recording.bin + events.jsonl` 산출. 대표 워크로드 8종: claude/codex 스트림, vim, htop, cargo build, 한글 IME 세션, 대량 스크롤 flood, **resize 왕복(80→79→80 — reflow idempotent 케이스)**, alt-screen 앱.
- `core/harness/miner.ts`(보조): `.buf` 덤프 → 다층 스크럽 → **로컬 전용** mid-stream 케이스·퍼저 시드. 거버넌스는 D4(커밋 금지·옵트인·수동 감수 승격).
- **착수 전 사전 점검 인도물**(리뷰 반영): §6.E secret-span 구현 상태 확인 + `.buf` 포맷(raw 무필터) 실덤프 검증 1건.

### 5-2. 차등 러너 (M2 — 분기 게이트 직결)
- `core/harness/differ.ts`: 동일 recording을 (a) @xterm/headless(+Unicode11Addon 명시 로딩) (b) 우리 코어(E1부터) (c) 옵션: libghostty-vt-node(D2 조건부)에 feed → 셀 단위(문자·폭·fg/bg·플래그·커서) diff.
- **불일치 4분류 대장**: (a) 우리 버그 (b) xterm.js 버그 — 내재화 마케팅 재료 (c) 스펙 모호 — 제3 레퍼런스/DEC 규격 심판 (d) **의도된 개선**(xterm.js U11 폭 vs 우리 U16+grapheme) — **케이스별 명시 승인 목록으로만**(암묵 (d) 금지).
- **기준선 게이트 = 4중**(리뷰 반영 — 자기일치 단독은 tautology): ① 결정성 — xterm.js 2회 실행 일치 100% ② 전 코퍼스 무크래시 완주 ③ **골든 어서션** — 워크로드별 대표 어서션(vim 상태줄 텍스트·CJK 폭 2·resize 후 커서 위치 등 사람이 아는 정답)을 코퍼스당 ≥3개 수동 작성, xterm.js 산출이 이를 통과 ④ 재현성 — 녹화→재생 왕복 안정. **게이트의 의미는 "차등 기준선(분모) 확립 + 하니스 자체의 신뢰성 증명"으로 한정 명시** — 코어 정확도 판정은 E1(≥99.9%)·E4(99.99%).
- 성능: xterm.js feed 처리량·diff 시간 **기준선 수치 산출**(E1 코어 등장 시 예산 판정 활성화).

### 5-3. esctest 실행기 (M3)
- **GPL-2.0 격리 정책**(리뷰 반영 — 명문화): esctest2(ThomasDickey, 커밋 핀)는 저장소에 **미포함** — 셋업 스크립트가 실행 시점에 외부 클론(체크섬 검증), CI 캐시·아티팩트·배포물에 GPL 파일 미포함, `NOTICE`에 실행 의존 고지. DECRQCRA 체크섬 구현은 **DEC 규격·xterm ctlseqs 문서에서만 도출**(esctest 소스 참조 금지 — 클린룸 규율).
- 어댑터 원칙(리뷰 반영): 어댑터는 **바이트 라우팅만** — 질의 응답은 피검체에서 산출. 코어 피검체 = 자체 writeback(§6-1). xterm.js 피검체 = CPR은 xterm.js 자체 방출, DECRQCRA는 xterm.js 미구현이므로 **피검체 그리드 스냅샷에서 체크섬 계산하는 브리지**를 명시 사용(그리드가 판정 대상이므로 검증력 유지 — 단 이 경로는 xterm.js 한정임을 대장에 기록).
- 실행 매트릭스: xterm.js(기준선) / 우리 코어(E1+). esctest 색 미검증 한계는 5-2가 상보.

### 5-4. 퍼저 (M4)
- cargo-fuzz(libFuzzer), 타깃 = `feed(변이)` 후 불변식(크래시 0·panic 0·좌표 정합·WRAPPED 체인 무결·wide spacer 쌍 정합). 시드 = 녹화 코퍼스+.buf 유래 로컬 시드. E0에서는 타깃 스켈레톤만(가동은 E1).

### 산출물·순서·주간 산정 (리뷰 반영 — W2 가용성 명시)
Q1 잔여 ~11주(07-09→09-30). W2 현황: 리그 R1·R2 착지 완료(CL7 조기 게이트 개방 — R3/R4는 분기말 여유), **하니스가 W2 현재 최우선**. 배분: M1 2주 → M2 2주(**분기 게이트**) → S-0/S-A1/S-C 1주 → S-A2/S-B 1주 → M3 완성 1주 = **7주** + macOS GA(Q1-9) 3주 버퍼. **S-A2(CI·서명)와 macOS GA 패키징은 같은 파이프라인을 만지므로 주간 비중첩 배치**. M1·M2는 E1 스펙의 기능 목록화(§3 D1-2) 후 위임 적합, S-A·S-C는 실기 검증 포함 — 오케스트레이터 개입 지점.

---

## 6. 코어 계약 정밀화 (E1 스펙의 씨앗 — §9 R-E3 오너 승인 대상)

**리뷰 반영(3-MODEL): 아래 1은 §6.A 4표면의 "정밀화"가 아니라 시그니처 변경이다 — R-E3 델타로 승인받는다.**

1. **모드 분리 + writeback**: 코어 생성 시 `mode: Interactive | Replay`를 타입 레벨로 고정.
   - `Interactive`: `feed(bytes) -> { damage: DamageBatch, writeback: Uint8Array }` — DECRQCRA·CPR·DA 등 질의 응답은 이벤트가 아니라 PTY 되쓰기 바이트. wezterm(생성자 writer 주입)·ghostty(WRITE_PTY 콜백)가 증명하듯 **write-back 없는 VT 코어는 성립하지 않는다** — §6.A 4표면의 누락을 리서치가 드러낸 것.
   - `Replay`(materialize 경로): **writeback을 타입상 산출하지 않는다** — 로그 재생 중 응답 재생성이 P2 로그 정본·P3 단일 writer에 루프를 만드는 것을 API가 원천 차단(호출자 규율 아님 — 리뷰 반영).
2. `events()`의 OSC 52는 **정책 게이트 필드**(payload 노출 전 승인 플래그) 동반 — alacritty 기본 거부 선례를 계약 레벨로 흡수.
3. **reflow_mode 결정 전이표**(리뷰 반영 — E1 스펙에서 완성, 골격 고정): 입력 = {PTY backend(conpty/winpty/openpty), OS build, 세션 원격 여부}. 현행 제품 분기는 conpty+21376 고정(`useTerminal.ts:308`)이므로 v1 규칙 = win32·conpty → `HostReflow`, 그 외 → `SelfReflow`. winpty·SSH/WSL·구buildNumber 에지는 E1 스펙의 명시 전이표+resize 테스트 매트릭스로.

---

## 7. 리스크 대장 · 킬스위치 정합

| 리스크 | 확률/영향 | 완화 |
|---|---|---|
| wasm+napi 동시 산출 마찰(정확 선례 부재) | 중/고 | S-0·S-A1 최전방 — 실패 시 분리 크레이트(core+바인딩 2개)로 후퇴(계약 불변) |
| **feed 처리량 예산 미달**(500/150MB/s) | 중/고 | S-A1 마이크로벤치로 오더 조기 확인(≥50% 미달 = 설계 재검토 트리거) — E1 6주 소진 후 발견 방지(리뷰 반영) |
| reflow 클린룸 난이도(§6.A "최대 함정") | 중/고 | **판단밀도 구간으로 분류 — 위임 아닌 직접/공동**(D1-2). 참조 구현 2개 정독 + resize 왕복 idempotent 케이스 + HostReflow 모드에서 reflow 경로 미실행(win 절연) |
| S-A2 서명 파이프라인 회귀(신규 .node) | 중/중 | macOS 서명·공증 무회귀를 S-A2 1급 기준으로 + macOS GA 주간과 비중첩 배치 |
| 다중 wasm 인스턴스 메모리(50페인 × 선형 메모리) | 중/중 | S-A1에서 3개 동시 로드 오더 기록. 본 판정은 E2 SharedArrayBuffer 전 미측정임을 명시(리뷰 반영) |
| vte 대형 OSC 절단 | 저/중 | 코퍼스에 iTerm2 이미지 시퀀스 — 절단 동작을 명시 계약으로, E4 재평가 |
| esctest DECRQCRA 의존 범위 불명(U4) | 중/저 | S-C 선행 반일 매핑으로 해소 — 실패 시 esctest 축 축소(5-2·5-1이 주력) |
| GPL 격리 이의 | 저/저 | §5-3 정책 명문화(미포함·클론 시점·캐시 배제·NOTICE·클린룸 규율) |
| Q1 잔여 기간 내 M1·M2 미완 | 중/중 | 분기 게이트 필수분 = M1+M2뿐(S-A2·M3·M4는 Q2 이월 가능) — §5 주간 배분 |

**킬스위치 정합(§3.2 2축)**: 이 결정은 킬스위치 ①(코어 정확도)의 측정기를 코어보다 먼저 세운다. 클린룸이 E1에서 좌초해도 §6.L 로그 정본에 의해 검색·레코딩·복원은 degraded 지속, xterm.js 폴백 전 기간 유지(P1 — 코어 출처는 교체 가능한 구현 세부).

---

## 8. 미확인 사실 대장 (결정 영향 항목 — 검증 소유자·시점)

**S-0 실행 결과 (2026-07-09, rustup stable minimal + wasm32 타깃 신규 설치 후 실측):**
- ✅ **U1 해소 — D1 확정 조건 ②(a) 통과**: `vte@0.15.0` `--no-default-features`가 wasm32-unknown-unknown에서 클린 빌드(1.43s). `cargo tree` 의존 전수 = **arrayvec 0.7.8 + memchr 2.8.3 정확히 2개**(GLM 오산 우려 해소).
- ✅ **U8-a 반증 재현**: `alacritty_terminal@0.26.0` wasm32 빌드 실패 — `error: polling does not support this target OS`(예측 지점 정확).
- ✅ **U8-b 반증 재현**: `termwiz@0.23`(wezterm-term의 필수 의존) wasm32 빌드 실패 — uuid 랜덤 소스 외 **총 9개 컴파일 에러**. wezterm-term 자체는 미게시(모노레포 full clone 과대)라 의존 실증+소스 문면(term/src/lib.rs std 하드)의 합으로 기록.
- ✅ U8-c(사전 실증): libghostty-vt reflow 문면 — 헤더 terminal.h:1070-1071 "reflow content if wraparound mode is enabled" 원문 확인.
- **⇒ D1 확정 조건 ①(오너 승인)+②(검증·반증) 전부 충족 — 클린룸 최종 확정.**

| # | 미확인 | 결정 영향 | 검증 |
|---|---|---|---|
**S-A1 실행 결과 (2026-07-09, 브랜치 feat/e0-spike-sa1 — 상세 `core/wmux-term/SPIKE-SA1.md`):**
- ✅ **U2 해소**: Node 24.15 빌드 `.node`가 Electron 41 main(Node 24.14, ABI145)에서 **무재빌드 로드**(V2) + 렌더러 web wasm 로드·IPC 왕복(V3).
- ✅ **U7 해소**: wasm-pack 0.15.0 + @napi-rs/cli 3.7.2 **npm devDep 핀**(lockfile — cargo install 배제), napi-rs 메이저 3. **MSRV 교집합 = rustc 1.88**(napi 3가 최댓값 — S-A2 CI 툴체인 ≥1.88 핀 필요).
- ✅ **단일 크레이트 cfg 분기 성립**(D5 미검증 잔여 해소): cargo tree 격리 실증(native→napi+vte·wasm-bindgen 0 / wasm32→wasm-bindgen+vte·napi 0). §7 "분리 크레이트 후퇴" 미발동.
- ✅ **성능 게이트 통과 — 예산 자체 초과**: 네이티브 vte feed **618~782 MB/s**(예산 500)·wasm **558~637 MB/s**(예산 150). 단 스켈레톤은 파서 바운드 — E1(셀 속성·reflow) 재계측 필수, 본 수치는 오더 상한.
- V5: wasm 3인스턴스(80×24+1MB feed) RSS +4.8MB 오더(선형 메모리 직접 측정은 E2 전 미측정 유지).

| # | 미확인 | 결정 영향 | 검증 |
|---|---|---|---|
| ~~U1~~ | ~~vte wasm32 실빌드+의존 전수~~ | **해소 — 통과** | S-0 실측(위) |
| ~~U2~~ | ~~napi-rs 애드온의 wmux Electron 무재빌드~~ | **해소 — V2/V3**(위). 패키지드 앱 로드는 S-A2 잔여 | S-A1 실측 |
| ~~U3~~ | ~~@xterm/headless 대량 feed 성능~~ | **해소 — S-B 통과 기준 전부가 #364 M2에서 기충족**(셀 diff 리포트·결정성 2회 일치·기준선 77~105MB/s 실측). S-B 별도 사이클 불요 판정(2026-07-09) | #364 착지분 |
| U4 | esctest 80파일의 질의 의존 분포(CPR/DECRQCRA/DECRQSS) | M3 가치 | S-C 선행 반일 매핑 |
| U5 | libghostty-vt 태그 출하(D2 재평가 ①) + coder 바인딩 속성 커버리지 | D2·5-2(c) | E1 착수 전 1회 |
| U6 | 자체 생성 폭 테이블 vs unicode-width 0.2.1 일치성 — **불일치 시 UCD 원본이 오라클** | D3 | 빌드타임 크로스체크 테스트 |
| ~~U7~~ | ~~버전 핀+MSRV 교집합~~ | **해소 — rustc 1.88 핀**(위) | S-A1 실측 |
| ~~U8~~ | ~~탈락 3종 반증 실빌드~~ | **해소 — 전건 재현**(위) | S-0 실측 |

---

## 9. 로드맵 델타 (**오너 승인 완료 — 2026-07-09 "응 구현 해야지", 4건 일괄**)

- **R-E1 — esctest "포팅" → "원본 무수정 실행 + DECRQCRA 어댑터"**: §6.A 하니스 1항 문면 조정. 사유: esctest 전 계보 GPL-2.0 판명 — 코드 이식은 MIT 저장소 오염. 격리 정책·클린룸 규율은 §5-3. 그리드 스냅샷 어서션은 5-1 골든+5-2 차등이 담당(검증 범위 불변).
- **R-E2 — 스파이크 "후보 4종 각 3일" → "검증·반증 1일 + 배관 4건 8일"**: §6.A 문면 조정. 사유: 후보 비교는 리서치(§2)+반증 실빌드(S-0)가 대체 — 게이트 탈락 3종에 코드 스파이크 9일은 낭비, 절약분은 하니스 M1·M2(분기 게이트 필수분)에 재배정. *(리뷰 반영: 리서치 단독 대체가 아니라 반증 실빌드 증거를 절차에 편입)*
- **R-E3 — 코어 공개 표면에 writeback·모드 분리 추가**: §6.A "공개 표면은 4개뿐" + `feed(bytes) -> DamageBatch` 문면을 §6-1(Interactive/Replay 모드 + writeback)로 개정. 사유: 질의 응답(DECRQCRA·CPR·DA) 없는 VT 코어는 성립 불가 — wezterm·ghostty 실물이 증명. Replay 모드의 타입 레벨 writeback 차단으로 P2/P3 정합 유지. *(3-MODEL 합의 — "정밀화" 아닌 계약 변경으로 정직하게 승인 요청)*
- **R-E4 — 로드맵 사실 정정 2건**: ① §6.A 후보표·§2.3의 libghostty-vt "2026-03 분리 출하·별도 버저닝·수십 프로젝트" → "**모노레포 Zig 모듈 + WIP C API(alpha·무태그), 상용 실명 OrbStack, 별도 버저닝은 계획 단계**"(조사 1차 출처) ② §6.A:288 코퍼스 채굴 경로 `~/.wmux/scrollback/` → `{stateDir}/buffers/*.buf`(실코드 `StateWriter.ts:388`).

승인 시 v1.2로 로드맵 문면 각주 반영. **다음 절차: 오너 승인(R-E1~R-E4) → S-0 검증·반증 → E0 착수(LEDGER 32차: M1·M2 위임 — E1 기능 목록화 선행).**

---

## 10. 리뷰 로그 — 3모델 패널 1라운드 (2026-07-09)

패널: Codex(read-only, 실문서·로드맵 대조) 20건 / Claude 적대(Opus, **실코드 검증** — useTerminal·StateWriter·forge.config·§6.E) 14건 / GLM 5.2(문서+발췌 인라인) 15건. 총 49건 → 클러스터 23개. 주요 합의:

| # | 합의 | 요지 | 반영 |
|---|---|---|---|
| P1 | 3-MODEL | feed→{damage,writeback}는 4표면 시그니처 변경 + replay writeback 루프 | §6 모드 분리(타입 차단), R-E3 신설 |
| P2 | 3-MODEL | D1 "확정" 절차 과잉 — 승인 선행+반증 증거+U1 미검증 | D1 확정 조건 2건·S-0 신설·게이트 ✅ 조건부화 |
| P3 | 3-MODEL | 기준선 자기일치 = tautology | 5-2 4중 기준선(골든 어서션 포함) |
| P4 | 3-MODEL | 익명화 부족+§6.E 계약 누락+실세션 옵트인 | D4 거버넌스(합성 정본·로컬 전용·수동 감수) |
| P5 | 3-MODEL | S-A 3일 비현실+서명 무회귀 부재 | S-A1/S-A2 분리(5일)+서명 1급 기준 |
| P6 | 3-MODEL | 성능 예산 E0 부재 | S-A1 마이크로벤치+재검토 트리거 |
| P7 | 3-MODEL | esctest 기술성(xterm DECRQCRA 미구현·cup.py=CPR·어댑터 응답 생성 금지) | 5-3 원칙 재서술+S-C 재설계(2일) |
| P8 | 3-MODEL | GPL 격리 보강(정책·kitty·체크섬 출처) | §5-3 명문화·§4 kitty 삭제·DEC 규격 도출 |
| P9 | 2-MODEL | RingBuffer geometry 부재 — M1 전제 오류 | M1 재설계(녹화 정본) |
| P10 | 2-MODEL | 클린룸 "기계 작업" 과소평가 — reflow 위임 모순 | D1-2 재서술(기능 목록화 조건+판단밀도 구간 분류) |
| P11 | SOLO 채택 | Codex: G1 근거·G3 P1 충돌 / GLM: Rio=copa·vte 의존수 / Claude: 로드맵 경로 stale 외 | §1 게이트 재정의(C5 신설)·§3 정정·R-E4 |

---

## 부록 A — 출처 키 + S-0 재현 명령 (판정표 §2의 검증 가능성)

**후보별 핵심 1차 출처** (워커 보고 전문은 세션 산출물, 여기는 판정 근거 최소셋):

| 후보 | 버전 근거 | 판정 근거 소스 |
|---|---|---|
| alacritty_terminal | crates.io API `max_stable_version=0.26.0`(2026-04-06) | `alacritty_terminal/src/lib.rs:8,14,15`(tty/event_loop/thread 무조건 모듈) · `tty/mod.rs:9`(`use polling`) · `term/mod.rs:137-146,458-494`(LineDamageBounds·TermDamage) · `grid/resize.rs:14`(`resize(reflow: bool)`) · vte `ansi.rs:1523`(OSC 7/133 unhandled) · `ansi.rs:916`(mode 2026만) |
| wezterm-term | crates.io termwiz=0.23.3 게시 vs main 0.24.0 미게시 · wezterm-term 0.1.0 미게시(issue #6663) | `term/src/lib.rs:12,21,22`(std 하드) · `term/src/screen.rs:193,233-289`(`resize(is_conpty)` — rewrap 강제·gravity만 제어) · 서브크레이트 4종 `lib.rs:1`(`cfg_attr(not(std), no_std)`) · issue #181(wasm, 2020~open) · `terminalstate/mod.rs:1505-1517`(mode 2027 영구 on) |
| libghostty-vt | 태그 부재(mitchellh.com/writing/libghostty-is-coming — "tagged version within 6 months", 2025-09) · ghostty 1.3.0 릴리스노트 | `include/ghostty/vt.h`("work-in-progress··· definitely going to change") · `vt/terminal.h`(vt_write void 반환·resize 문서 "reflow if wraparound mode enabled") · `vt/wasm.h`(`#ifdef __wasm__`) · `vt/unicode.h`·`vt/osc.h` · github.com/coder/libghostty-vt-node(프리빌드 3조합) · heise 2026-03-24(Windows 실검증 미완) |
| vte / 재료 | crates.io vte `max_version=0.15.0` · unicode-width 태그별 `scripts/unicode.py` `UNICODE_VERSION`(0.2.1=16.0.0/0.2.2=17.0.0) · unicode-segmentation 1.13.3(2026-06-01) | vte `Cargo.toml`(`default=["std"]`·arrayvec·memchr) · `Perform` 8콜백(docs.rs) · esctest GPL-2.0(gnachman/migueldeicaza/ThomasDickey 전 계보 LICENSE) · alacritty `tests/ref.rs`(코퍼스 형식) · napi-rs/package-template(6조합 매트릭스) · raphamorim/rio(copa+자체 그리드+native/wasm) |

**S-0 재현 명령** (스크래치 크레이트에서 — 저장소 무접촉):

```bash
# (a) vte wasm 검증 (U1) — 통과가 D1 확정 조건
cargo new vte-probe && cd vte-probe
cargo add vte@0.15 --no-default-features
cargo build --target wasm32-unknown-unknown   # + cargo tree -e no-dev
# (b) alacritty_terminal 반증 (U8) — polling/rustix 컴파일 에러가 기대 결과
cargo add alacritty_terminal@0.26.0 && cargo build --target wasm32-unknown-unknown
# (c) wezterm-term 반증 — 미게시라 git 의존, std/terminfo 에러가 기대 결과
# Cargo.toml: wezterm-term = { git = "https://github.com/wezterm/wezterm" }
cargo build --target wasm32-unknown-unknown
# (d) libghostty-vt는 빌드 반증 불요(G2·C5 기각) — 헤더 문면 확인만:
curl -s https://raw.githubusercontent.com/ghostty-org/ghostty/main/include/ghostty/vt/terminal.h | grep -in reflow
```
