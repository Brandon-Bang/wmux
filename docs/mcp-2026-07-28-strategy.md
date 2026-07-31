# MCP 2026-07-28 Spec Response Strategy

Written: 2026-07-30 / Sources: claude.com blog + modelcontextprotocol.io official changelog

## Key Spec Changes

| Change | Details | Impact on wmux |
|---|---|---|
| Stateless core | `initialize` handshake removed; protocol version & capabilities carried in `_meta` on every request. `Mcp-Session-Id` removed | Medium — SDK absorbs most of it, but code assuming sessions needs auditing |
| `server/discover` required | Servers MUST implement an RPC advertising versions/capabilities/identity | Medium — expected to be resolved by SDK upgrade |
| Notification overhaul | GET stream & `resources/subscribe` → single `subscriptions/listen` stream. `ping` and `logging/setLevel` removed | Medium — audit long-poll / event notification paths |
| MRTR pattern | Server-initiated requests (sampling, elicitation, roots/list) replaced by `input_required` results + client retry | Low (medium if elicitation is used) |
| `resultType` required | Every result carries `"complete"` or `"input_required"` | Handled by SDK |
| Tasks promoted to extension | Long-running work is now an official extension (`tasks/get` polling, `tasks/update`) | **Opportunity** — structurally similar to a2a_task_* |
| Deprecated | Roots, Sampling, Logging features; HTTP+SSE transport; DCR (RFC7591) → Client ID Metadata Documents | Do not adopt in new code |
| SSE resumability removed | No `Last-Event-ID` redelivery — a broken stream means re-issuing as a new request | Retry logic needed if we move to HTTP |
| Cache hints | `ttlMs` & `cacheScope` required on `tools/list` etc.; deterministic tool ordering recommended | Big win for wmux with 200+ tools |

Grace period: deprecated features remain for at least 12 months. Nothing breaks immediately.

## Current State (as of 2026-07-30)

- wmux MCP: `@modelcontextprotocol/sdk ^1.27.1`, **stdio only** (`src/mcp/entry.ts`, `broker.ts`)
- stdio dodges most of the direct hits of this revision (HTTP sessions, SSE). Handshake removal and `server/discover` are territory a major SDK upgrade should absorb

## Strategy — 3 Phases

### Phase 1: Now (within 1–2 weeks, low cost)
- [ ] Monitor SDK release notes — when a 2026-07-28-compliant version lands, test on an upgrade branch (`src/mcp/__tests__` gate)
- [ ] Code audit: inventory `initialize` callbacks, session state, and `notifications/*` dependencies (especially the long-poll path)
- [ ] Ban Roots / Sampling / Logging / DCR adoption in new code — add to review criteria

### Phase 2: After SDK Support (1–2 months)
- [ ] Upgrade SDK + verify `server/discover` behavior
- [ ] Add `ttlMs` / `cacheScope` to `tools/list` and pin deterministic tool ordering — with wmux's large tool surface, client-side and prompt cache hits are the single biggest win
- [ ] Cross-call state (browser sessions, channels, etc.) already uses explicit handles (id arguments), which matches the spec's direction — only remove implicit session dependencies

### Phase 3: Opportunities (quarterly)
- [ ] **Tasks extension**: exposing wmux's a2a_task_send/query model as the official `io.modelcontextprotocol/tasks` extension gains compatibility with other clients
- [ ] **Stateless HTTP deployment option**: with sessionless Streamable HTTP, wmux MCP can run on Coolify/serverless for remote orchestration — apply the same principles (stateless + OAuth/OIDC) to the company (KS-) FastAPI MCP servers
- [ ] If company connectors need auth: start with Client ID Metadata Documents, not DCR

## Non-Goals
- No rushed migration right after the spec release — no hand-rolled implementations before a stable SDK version
- No new adoption of legacy HTTP+SSE, or new features built on Sampling/Roots
