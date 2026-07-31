# Plan: AI-assisted worktree merge + verification exit

## Problem

사용자는 여러 기능을 git worktree별로 병렬 작업한다(각 worktree = 하나의 wmux
워크스페이스). 기능이 끝나면 로컬 main으로 합쳐야 하는데, 사용자는 diff를
hunk 단위로 읽는 데 약하고(본인 표현: "까막눈"), 충돌 해결 판단을 Claude에게
위임한다. 현재 앱에는 이 "합치기"를 돕는 어포던스가 없어 터미널의 Claude Code에
매번 말로 지시한다. 또한 Review/DiffPanel(워크스페이스별 uncommitted diff 집계)은
이 워크플로우에서 존재 의의가 불분명하다.

## Premises (검증 대상)

1. 사용자는 병렬 feature-worktree를 로컬 main으로 합치는 작업을 자주 한다.
2. 사용자는 diff를 hunk 단위로 읽지 않으며(못 하며), 판단을 Claude에게 위임한다.
3. 충돌이 발생하고 의미 기반 해결이 필요하다.
4. push→CI→PR가 병합 후 검증을 담당한다. 앱이 메워야 할 공백은 "로컬 병합 +
   충돌 해결" 단계지, 그 이후가 아니다.
5. 사용자는 "동일 작업 병렬 fan-out"은 쓰지 않는다(각기 다른 기능 병렬).

## Proposed solution (REVISED → 옵션 B, 사용자 승인 2026-07-20)

핵심 프리미티브: **stateful merge session**. git-native 머지가 기본, AI는 git이
실제 충돌을 보고할 때만 개입, 객관적 verify 게이트, 명시 Land/Discard.

상태기계: `idle → merging(--no-commit) → {clean | conflicted} → [conflicted:
ai-resolving → resolved] → verifying → {verified | failed} → {landed | aborted}`

1. **Merge 액션** — Git 탭 worktree 행에 "머지" 버튼. main 워크트리 기준으로
   `git merge --no-commit --no-ff <branch>` 실행(worktree.handler에 op 추가,
   기존 `withRepoLock` 재사용). **커밋하지 않음** — 스테이징만.
2. **clean 경로(~70%)** — 충돌 없으면 AI 없이 바로 verify 단계로. 결정적·즉시.
3. **conflict 경로** — git이 충돌 보고 시에만 해당 워크스페이스 Claude 페인에
   구조화 프롬프트 디스패치("이 충돌들을 의미 기반 해결, 커밋하지 마"). 충돌
   목록은 git에서 파싱해 프롬프트에 명시.
4. **verify 게이트** — 프로젝트 config에서 읽은 검증 명령(이 repo: `npm test` +
   `npm run lint`; `scripts/verify.sh` 하드코딩 금지 — 존재하지 않음)을 실행,
   **exit code**로 green/red 판정. "Claude가 done이라 함"은 신뢰하지 않는다.
5. **Land / Discard** — 사용자에게 plain-language 요약(변경 파일 수, verify
   결과, 충돌 있었으면 어떻게 해결됐는지) + 두 버튼. Land = 실제 commit,
   Discard = `git merge --abort`. diff 열기는 선택적 심화(게이트 아님).
6. **integration-health 신호(스코프 확정 필요)** — 각 worktree 행에 dry-run
   `git merge --no-commit` 예측("clean / 충돌 N건")을 상시 표시해 divergence를
   조기 노출. 신호등과 동거.

## Decision Audit Trail

| # | Phase | Decision | Class | 근거 |
|---|-------|----------|-------|------|
| 1 | CEO | 프리미티브 A→B 교체(git-native 기본, AI 충돌 시만) | USER CHALLENGE | 사용자 승인. 3-voice 만장 안전 우려 |
| 2 | CEO | main 직접 머지 대신 --no-commit 스테이징 + Land/Discard | Mechanical | 되돌릴 수 있는 상태 필요(P5 명시성) |
| 3 | CEO | verify 게이트=exit code(텍스트 무시), 명령은 config | Mechanical | "done" 텍스트 ≠ 증거; scripts/verify.sh 부재 확인 |
| 4 | CEO | diff-review를 게이트에서 선택적 심화로 강등 | Mechanical | diff-blind 사용자에 theater(P2) |

## Scope in

- Git 탭 worktree 행의 머지 버튼
- 워크스페이스 Claude 페인으로 구조화 머지 프롬프트 디스패치
- 병합 후 "diff 열어 확인" → DiffPanel/Review 연결
- 신호등 상태 반영(기존 gitSync 메타 사용)

## Scope out (defer to TODOS)

- Claude 없이 git-native 자동 머지 버튼
- 다중 worktree 일괄 머지
- 충돌 UI / 3-way merge 에디터
- diff를 읽어 hunk를 골라 담는 adopt 워크플로우의 확장

## Open questions

- 머지 타겟이 사용자의 로컬 main 체크아웃인가, 아니면 Claude가 worktree 안에서
  수행하나? (main으로 병합하려면 main에 있어야 하거나 별도 연산 필요.)
- 워크스페이스에 Claude 페인이 여러 개면 어디로 프롬프트를 보내나?
- 워크스페이스에 Claude 페인이 없으면?
- 프롬프트 디스패치가 이미 존재하는 fanout/terminal_send 경로를 재사용하나?

---

# /autoplan — Phase 1: CEO Review (Strategy & Scope)

Mode: **SELECTIVE EXPANSION** — UI 진입점(worktree 행의 액션)은 옳다. 바꿔야 할
것은 실행 프리미티브: "main으로의 fire-and-forget AI 프롬프트"가 아니라 "격리된
integration 표면으로의 git-native 머지 + 객관적 verify 게이트, 충돌 시에만 AI".

## 0A. Premise Challenge

| # | 전제 | 판정 | 근거 |
|---|------|------|------|
| P1 | 병렬 worktree를 로컬 main으로 자주 합친다 | 약~중(미계측) | 솔로 도구라 "버튼 원할 만큼 잦다"는 합리적 베팅이나, 가치가 빈도에 비례. 계측은 저비용 |
| P2 | diff를 못 읽어 판단을 Claude에 위임 | **참(load-bearing)** | 사용자 본인 발언. 이게 바로 순진한 버전을 위험하게 만드는 핵심 — diff를 못 읽으면 나쁜 머지를 못 잡으므로 안전 게이트가 "diff를 봐라"가 될 수 없다 |
| P3 | 충돌은 의미 기반 해결 필요 | 참, 단 소수 케이스 | 대부분 머지는 clean/fast-forward. AI는 충돌 부분집합에만 필요 → git-native가 주(主), AI는 on-demand |
| P4 | push→CI→PR가 사후 검증, 공백은 로컬 머지+충돌 | **부분 오류** | 로컬 main에 깨진 걸 합치면 CI는 이미 main 오염 후 실행. 공백은 "머지+충돌"이 아니라 "머지 + main 건드리기 전 VERIFY" |
| P5 | fan-out 안 씀 | 참(기확정) | batch/fan-out 머지 불필요 정당화 |

## 0B. What already exists (leverage map)

| 하위 문제 | 기존 코드 | 재사용 |
|---|---|---|
| worktree 열거/생성/제거 + repo 뮤텍스 | `worktree.handler.ts` (`withRepoLock` 동형) | 여기에 `merge` 연산 추가, 같은 락 |
| git 실행 | `src/main/git/git.ts` (fail-soft, code 반환) | merge/verify 헬퍼 추가 |
| 결과 diff 확인 표면 | `addWorkspaceDiffSurface` → DiffPanel | verify 출구 |
| Claude 페인 식별 | `selectors/fleet.ts` (agentName/agentStatus) | 프롬프트 목적지 탐색 |
| PTY 텍스트 주입 | a2a/`terminal_send`/`sanitizePtyText` | 충돌 해결 위임 경로(단, 위험) |
| 객관적 게이트 | `scripts/verify.sh` (exit code) | promote 전 green/red 판정 |

머지 헬퍼는 **없음**. worktree.handler에 list/add/remove만 있고 merge 부재.

## 0C. Dream state

- **CURRENT**: 사용자가 Claude에게 말로 머지 지시 → 됐길 바람 → 검증 불가.
- **THIS PLAN(순진)**: 버튼이 프롬프트 디스패치 → Claude가 main에 머지 → 사용자가
  못 읽는 diff를 눈으로 → **verification theater**.
- **12-MONTH IDEAL**: "Integrate" 액션 → 격리 integration worktree → git-native
  머지(충돌 시에만 AI) → `verify.sh` 게이트(초록/빨강, 객관) → 초록일 때만 main
  atomically 전진 → 행동 증거(테스트 출력, raw diff 아님).

## 0C-bis. Implementation alternatives

| # | 접근 | CC 노력 | 안전 | 평가 |
|---|------|---------|------|------|
| A | 순진한 프롬프트-디스패치 머지(plan 원안) | 저 | **낮음(footgun)** | main 직접 오염, 완료 계약 없음, diff 검증 theater |
| B | git-native 머지 버튼 + 충돌 시에만 AI + integration worktree에서 verify 게이트 | 중 | 높음 | **추천** — 객관 게이트가 diff-blind 사용자를 보호 |
| C | PR 기반(push→CI→GitHub 머지) | 0(신규코드) | 높음 | "로컬 main" 욕구 불충족, GitHub에서 diff 읽기 필요 |
| D | merge-queue/stacked-diffs | 고 | 높음 | 솔로에 과설계 |

## 0F. Mode selection

SELECTIVE EXPANSION 확정. 진입점 유지(worktree 행 액션), 실행 프리미티브를 A→B로
교체. 이는 blast radius 내 확장(worktree.handler + git.ts + DiffPanel 연결).

## 0.5. CEO Dual Voices — Consensus

Claude 독립 서브에이전트 + Codex, 둘 다 사전 리뷰 없이 독립 수행.

```
CEO DUAL VOICES — CONSENSUS TABLE
──────────────────────────────────────────────────────────────
  Dimension                              Claude Codex Consensus
  ─────────────────────────────────────── ───── ───── ─────────
  1. 전제 유효?                            No    No    CONFIRMED-NO
     (P2·P4 자기모순: diff 못 읽는데 diff로 검증)
  2. 올바른 문제?                          No    No    CONFIRMED-NO
     ("merge to main" 아니라 "safely integrate")
  3. 스코프 보정 적절?                     No    No    CONFIRMED-NO
     (git-native가 기본, AI는 충돌 시에만)
  4. 대안 충분 탐색?                       No    No    CONFIRMED-NO
     (git-native/preview/PR-flow 미분석)
  5. Fire-and-forget 프리미티브 건전?      No    No    CONFIRMED-NO(critical)
     (완료 계약 없음, "done" ≠ 증거, 이미 커밋됨)
  6. 6개월 궤적 건전?                      No    No    CONFIRMED-NO(critical)
     (auto-pilot → 감지 불가한 나쁜 머지가 빨라지고 신뢰됨)
──────────────────────────────────────────────────────────────
```

**검증된 팩트**: dispatched 프롬프트가 하드코딩한 `scripts/verify.sh`는 이 repo에
**존재하지 않는다**. 유일 verify는 `core/wmux-term/verify.sh`(spike 전용). 실검증
게이트는 `npm test`+`npm run lint`+tsc. → 프롬프트에 verify 명령 하드코딩은 즉시 깨짐.

**서브에이전트 고유 통찰**: 일회성 버튼(최대 divergence 시점에 1번 발사) 대신
**상시 integration-health 신호**(각 worktree 행에 dry-run `git merge --no-commit`으로
"clean / 충돌 N건 예측"). divergence를 깊어지기 전에 노출. + **stateful merge session**
상태기계(clean/conflicted/verified/landed/aborted), `--no-commit` 스테이징, 명시
Land/Discard = commit / `git merge --abort`.

## 0.6. Failure Modes Registry (diff-blind 사용자 기준)

| 실패 모드 | 순진안(A)에서 결과 | 완화(B) |
|---|---|---|
| 충돌을 한쪽 임의 선택으로 "해결" | verify 초록 통과 → main 착지 → push. 사용자 감지 불가 | 스테이징(`--no-commit`) + Land 전 plain-language 요약 |
| Claude가 "done" 오보 | 이미 커밋된 상태 | 머신 게이트(exit code)만 신뢰, 텍스트 무시 |
| verify 경로 오류 | 프롬프트 실패 or Claude 즉흥 | 프로젝트 config에서 명령 읽기, 하드코딩 금지 |
| 머지 방향 모호(worktree 안?) | no-op 또는 역방향 머지 | 빌드 전 결정(open question 아님) |
| 중단된 머지(MERGING 마커) | 비-git 사용자 방치 | 표면화된 abort 경로 |
| 동시 머지 | 레이스 | repo 뮤텍스(worktree.handler 기존 패턴) |

## Phase 1 — USER CHALLENGE (auto-decide 금지)

당신이 말한 방향: **Claude가 (main으로) 머지 + diff-review로 확인.**
세 리뷰어 전원 권고: **git-native 머지가 기본(충돌 시에만 AI) + 객관 verify 게이트
+ 명시 Land/Discard**. diff-review는 게이트가 아니라 선택적 심화로 강등.

세 리뷰어가 이걸 안전 리스크로 본다(선호 아님): diff를 못 읽는 사용자 + 이미
커밋되는 fire-and-forget = 감지 불가한 나쁜 머지. 당신의 원래 방향이 기본값이며,
바꿀지는 당신이 결정.

**→ 사용자 결정(2026-07-20): 옵션 B 승인.**

---

# /autoplan — Phase 3: Eng Review (옵션 B 기준)

## 3.0 Eng grounding (Fable primary — 코드 실측)

**완료 계약이 이미 존재한다(가장 큰 리스크 해소).** conflict 해결 디스패치를 raw
`terminal_send`(fire-and-forget)로 하지 말 것. 앱에 두 기존 메커니즘:
- **a2a task 라이프사이클** — `working → completed/failed`, `CompletionEvidence`
  구조화 증거, `A2aTaskService.transition`이 VALID_TRANSITIONS 강제
  (`src/shared/a2aEventlog.ts`, `a2a.rpc.ts`). → conflict 해결을 `a2a_task_send`로
  보내면 완료를 구조적으로 관측.
- **Stop 훅 / agentStatus** — Claude Code Stop 훅이 `HookSignalRouter` 경유로
  running→idle 전이 → 턴 완료 프록시.

**health 신호는 `git merge-tree` 필수(NOT `git merge --no-commit`).** `--no-commit`은
워킹트리/인덱스를 실제로 변경한다 → 라이브 main 체크아웃에 상시 실행하면 파괴적.
`git merge-tree --write-tree <base> <branch>`는 in-memory로 충돌 계산, 워킹트리
무변경. dry-run 예측 신호는 이걸로.

**머지 실행 위치.** main 워크트리는 dirty이거나 feature 브랜치에 있거나 실행 중
에이전트가 점유 중일 수 있다. 두 선택:
- (i) main 워크트리에서 실행 + 전제조건 강제(clean tree, base 브랜치, 비점유)
- (ii) **격리 integration 워크트리**를 임시 생성해 거기서 머지·verify → 성공 시에만
  main을 fast-forward(codex 권고). 사용자 main 체크아웃을 절대 안 건드림. **추천**.

## 3.1 Architecture (신규 ↔ 기존)

```
[Git탭 worktree행] --merge--> merge.rpc/worktree.handler (withRepoLock)
      |                              |
      |                       git.ts: merge-tree(예측) / merge(--no-commit)
      |                              |
      v                       {clean} → verify(npm test+lint, exit code)
[integration-health 신호]           |
  (merge-tree 예측, 상시)     {conflict} → a2a_task_send(Claude 페인)
                                     |          └─ completed+evidence로 완료 관측
                                     v
                              verify → {green/red} → [Land(commit)/Discard(abort)]
```

상태기계 위치: **main 프로세스**가 정본(디스크 MERGING 상태를 재시작 후 재조정
가능해야 함 — 렌더러 store만이면 재시작 시 유실). 렌더러는 구독·표시만.

## 3.2 Codex eng findings (독립)

1. **[critical] 머지 위치 미해결·모순.** "main 워크트리" vs "격리 integration"
   왕복. `worktree list` 첫 엔트리가 main 브랜치라는 보장 없음(코드는 그냥 "main"
   라벨). 전제조건 필수: 타겟 브랜치 명시+`symbolic-ref HEAD` 확인, 타겟 트리
   완전 clean(staged/untracked 포함), 진행 중 merge/rebase 없음, target/source
   **OID 캡처 후 Land 직전 재검증**. → **전용 integration 워크트리 권고**. 다른
   곳에 체크아웃된 브랜치를 직접 갱신하면 그 워킹트리가 불일치.
2. **[correctness] merge stderr 파싱 금지**(로케일 종속). 충돌 판정 =
   `MERGE_HEAD` 존재 **AND** unmerged 인덱스 엔트리 존재. 파일 목록 =
   `git diff --name-only --diff-filter=U -z`(NUL 구분). nonzero exit ≠ 충돌(운영
   실패일 수 있음). **브랜치명 아닌 캡처된 OID를 머지**(움직이는 참조 금지).
3. **[critical] 충돌 처리 여전히 fire-and-forget.** `agentStatus`는 advisory이지
   완료 계약 아님. 게다가 Claude 페인은 feature 워크트리 소속인데 충돌은
   integration 체크아웃에 존재(누가·어디서 해결하나?). 명시적 세션 콜백
   `mergeSession.resolutionReady(sessionId)` 필요 + main이 **독립 재검증**(기대
   MERGE_HEAD, unmerged 0, 마커 없음, 세션 소유 불변) 후에만 verify 착수.
   timeout/retry/취소/에이전트 사망/"적합 Claude 페인 없음" 처리 추가.
4. **[high] 상태는 main 세션 매니저 + 내구 메타.** 렌더러/`addWorkspaceDiffSurface`
   는 표시 전용. 세션ID·경로·OID·phase·verify 증거를 .git 아래 atomic 영속.
   재시작 시 MERGE_HEAD와 재조정, 외부/수동 머지 감지 시 unsafe abort 미제공.
5. **[high] 뮤텍스 불충분.** 프로세스 로컬·IPC 반환 시 해제. 세션은 AI+verify+
   Land/Discard 전 구간 지속되는 repo-wide 리스 + 크로스-프로세스 락 필요.
   타겟 체크아웃의 실행 중 에이전트/셸이 여전히 변경 가능 → **격리가 유일한
   견고한 답**.

**Fable 종합(+서브에이전트 교정)**: 완료계약에 대한 내 초기 판단을 교정한다.
a2a `completed`+CompletionEvidence는 **headless ClaudeWorker** 것이지 대화형 PTY
페인의 것이 아니다(서브에이전트 실측). 대화형 페인에 프롬프트를 보내는 건 여전히
fire-and-forget. **객관적 "해결됨" 신호 = `git diff --name-only --diff-filter=U`가
0건**(Claude가 전부 stage) — idle-gated 폴링으로 감지. agentStatus/Stop 훅은
신뢰 불가(아무 턴 종료에 발화, 재개 즉시 소거, resolved/awaiting_input/died 구분
불가). 격리 integration 워크트리는 4·5번을 한 번에 해소하되 wrinkle: 충돌 해결
Claude가 integration 워크트리에 cd돼야 함 → "Open as workspace(startupCwd)" 재사용.

## 3.3 ENG DUAL VOICES — CONSENSUS (만장일치)

```
ENG DUAL VOICES — CONSENSUS TABLE
──────────────────────────────────────────────────────────────
  Dimension                          Claude Codex Fable Consensus
  ─────────────────────────────────── ───── ───── ───── ─────────
  1. 머지 위치(격리 worktree 필요)     ✓     ✓     ✓    CONFIRMED
  2. 충돌 감지(diff-filter=U, not exit) ✓     ✓     ✓    CONFIRMED
  3. 완료계약(git-state 폴링, not 상태)  ✓     ✓     ✓    CONFIRMED(crit)
  4. 상태를 git에서 파생(재시작 복구)    ✓     ✓     ✓    CONFIRMED
  5. 락 키 일관성(target key) + 리스     ✓     ✓     ✓    CONFIRMED
  6. health는 merge-tree, refresh만      ✓     ✓     ✓    CONFIRMED(crit)
──────────────────────────────────────────────────────────────
```

**구현 전 필수 5교정**: (a) integration 워크트리 확정, (b) 충돌 완료신호를
`diff-filter=U==0` 폴링으로(agentStatus·a2a·텍스트 아님), (c) MERGING 상태를
디스크(git)에서 파생, (d) 락 키를 merge-target(base)으로 통일 + 세션 전 구간
리스, (e) health 프로브는 `git merge-tree`로 refresh 시에만(디바운스·캐시).

**발견된 기존 버그**: `withRepoLock` 키 불일치 — add는 `normPath(mainWt)`, remove는
`normPath(top)` (worktree.handler.ts:105,156). 머지 추가 시 base 키로 통일 필요.

## Effort reality (CC 기준)

- **B-MVP(clean 경로만)**: 격리 integration 워크트리 + clean 머지 + verify 게이트
  + Land/Discard. 충돌 시 "충돌 감지 — 여기서 Claude 열기"(수동). ~1일.
- **B-full**: + 충돌 AI 해결(integration에 Claude cd + `diff-filter=U==0` 폴링
  완료감지 + timeout/취소/사망 처리) + git-파생 재시작 복구 + health 신호. ~3–5일.

clean 머지는 git이 사소하게 처리하지만 diff-blind 사용자에겐 "클릭→초록→Land"도
가치. 단 사용자가 정작 Claude가 필요한 건 **충돌** 케이스(premise 2·3) — MVP가
충돌을 미루면 가장 필요한 부분이 수동으로 남는 트레이드오프.

## Phase 3 COMPLETE → Phase 4 Final Gate

DX phase 생략(신규 개발자대상 API/CLI/docs 표면 없음 — 내부 워크플로우 UI +
프롬프트 디스패치). 남은 taste 결정: **스코프(B-MVP vs B-full)**.

**→ APPROVED (2026-07-20): B-MVP.** clean 머지 스파인 먼저, 충돌 AI 해결은 후속.

## B-MVP 구현 태스크 (충돌 AI 자동해결 제외)

1. **git 헬퍼**(`src/main/git/` 신규 or 확장):
   - base 브랜치 해결(`gh defaultBranchRef` 재사용, worktree[0] HEAD 아님)
   - 전제조건: 타겟 clean(`status --porcelain`), HEAD==base·비detached, MERGE_HEAD 없음
   - 격리 integration 워크트리 생성/제거(base ref off)
   - `git merge --no-commit --no-ff <source-OID>` (캡처 OID)
   - 충돌 감지: `git diff --name-only --diff-filter=U -z` 비어있나
   - verify 러너: `npm test` && `npm run lint`, **exit code** 판정(스트리밍·timeout)
   - Land: OID 재검증 후 base ff/commit / Discard: `merge --abort` + integration 제거
2. **worktree.handler**: merge 세션 op(start/status/land/discard), 락 키=**base**로
   통일(기존 add/remove 키 불일치 버그도 정리), 세션 전 구간 리스.
3. **재시작 복구**: `worktree.list`가 per-worktree MERGING(`rev-parse MERGE_HEAD` +
   `diff-filter=U`) 파생 → 재시작 후에도 Land/Discard 제시.
4. **렌더러**: GitTab worktree 행 "머지" 버튼 → 세션 UI(merging/verifying/
   verified/failed) → plain-language 요약 + Land/Discard. 충돌 시 "충돌 감지 —
   여기서 Claude 열기"(기존 handleOpen을 integration 경로로).
5. **테스트**(CLAUDE.md 핵심함수 1~2개): 충돌 감지(diff-filter=U) + 전제조건 유닛.

## 후속(B-full, TODOS): 충돌 AI 자동해결(integration에 Claude cd + `diff-filter=U==0`
폴링 완료감지 + timeout/취소/사망) · health 신호(`merge-tree`, refresh만).