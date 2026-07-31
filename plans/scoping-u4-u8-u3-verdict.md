# 스코핑 조사 U4·U8·U3 판정 (2026-07-30)

> `plans/workspace-scoping-survey.md`의 164지점 중 미검증 3건에 대한 코드 추적 판정.
> 판정 기준: U7(REAL → PR #679)과 U1(검증 결과 ACCEPTED)의 선례 적용.

---

## U8 — `meta.setStatus` / `meta.setProgress` → **REAL (P2)**

**증상:** 호출자 스코프 없이 사람이 보는 활성 워크스페이스에 씀.

**코드 근거:**
- `src/main/pipe/handlers/meta.rpc.ts`: `workspaceId`를 caller가 보낸 값 그대로 사용.
  senderPtyId 해석 없음, RpcContext 무사용, firstParty 체크 없음.
- renderer(`useNotificationListener.ts`): `payloadWsId ?? state.activeWorkspaceId`로 fallback
  → workspaceId 없으면 사용자가 보고 있는 ws에 적용.

**비교 대상:** `fanout.rpc.ts`, `a2a.channel.rpc.ts`, `events.rpc.ts`, `browser.rpc.ts`는
모두 `senderPtyId → resolveCallerWorkspace()`로 서버 해석.

**영향:**
- `meta.write` capability 가진 외부 MCP 클라이언트가 다른 ws의 status/progress를 변조 가능.
- `workspaceId` 생략 시 사용자의 active ws를 오염.

**판정:** **REAL** — U7과 같은 클래스. 단, `meta.write`은 선언형 capability라 선의의
에이전트만 접근하는 현실에서는 실질 위험 낮음. P2로 분류.

**수정 방향:** `fanout.rpc.ts` 패턴 적용 — `ctx.senderPtyId`로 workspace 해석,
caller-supplied workspaceId 무시.

---

## U4 — `principal.remove` / `markStaleWorkspace` → **ACCEPTED (transport-mitigated)**

**증상:** `verifiedWorkspaceId` 존재만 확인, 대상 비교 없음 → caller A가 B의 principal
제거 가능.

**코드 근거:**
- `src/daemon/index.ts:3367-3393`: 두 핸들러 모두 `verifiedWorkspaceId !== ''` 체크 후
  즉시 `principalService.remove(principalId)` / `.markStaleByWorkspace(workspaceId)` 호출.
  **caller ws ≠ target 비교 없음.**
- 대비: `a2a.principal.upsert`는 `resolveSessionWorkspace(record.ptyId)`로 소유권 확인.

**보상 제어:**
1. `channelLocal.handler.ts`: 이 RPC들은 renderer-only IPC(`IPC.CHANNEL_MUTATE_LOCAL`)
   경로에서만 호출됨. 렌더러가 `verifiedWorkspaceId`를 신뢰할 수 있는 값으로 stamp.
2. `methodCapabilityMap.ts`: `wmux.internal` capability → 외부 MCP/plugin 불가.
3. 외부 named-pipe caller는 daemon pipe에 직접 접근 가능하나, same-user ceiling (#113)
   적용. 같은 유저라면 이미 모든 ws 접근 가능.

**판정:** **ACCEPTED** — daemon-side 핸들러에 ownership 비교가 없는 것은 사실이나,
transport 경계(renderer-only) + capability(`wmux.internal`) + same-user ceiling으로
외부 도달 불가. `upsert`와의 비대칭은 기록해두되, 적대적 멀티에이전트 위협 모델
도입 전까지는 수정 불요.

---

## U3 — `operatorList` "파이프 미등록" vs 실제 등록 → **ACCEPTED (용어 혼란)**

**증상:** 주석은 "파이프 미등록"인데 `daemon/index.ts:3114`에 등록돼 있음.

**코드 근거:**
- `src/daemon/index.ts:3114`: `pipeServer.onRpc('a2a.channel.operatorList', ...)`로 등록.
  **그러나 이 `pipeServer`는 daemon의 내부 제어 파이프** (DaemonPipeServer).
- `src/main/pipe/handlers/a2a.channel.rpc.ts`: 외부 facing RpcRouter에는 **미등록**.
  테스트(`a2a.channel.rpc.test.ts:468-490`)가 "Unknown method" 반환 확인.
- `src/main/mcp/firstParty.ts`: MCP 도구로도 노출 안 됨.

**실제 접근 경로:**
  렌더러 GUI → `channelsSlice.operatorListDaemon()` → `bridge.mutateLocal()` →
  `channelLocal.handler.ts` allowlist → daemon DaemonPipeServer

**판정:** **ACCEPTED** — "파이프"가 "외부 facing main-process pipe router"를 지칭.
daemon 내부 제어 소켓에는 등록돼 있지만 외부 caller(agent/CLI/MCP)는 도달 불가.
주석이 혼란스러울 뿐 보안 불변량 유지. **주석 정정 권장.**

---

## 요약

| ID | 판정 | 우선순위 | 액션 |
|----|------|---------|------|
| U8 | **REAL** | P2 | `meta.setStatus/setProgress`에 senderPtyId 기반 ws 해석 추가 |
| U4 | ACCEPTED | — | 기록 보존. 적대적 멀티에이전트 시 재검토 |
| U3 | ACCEPTED | — | daemon/index.ts 주석 "파이프 미등록" → "외부 파이프 미등록" 정정 |
