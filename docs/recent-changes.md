# Recent Changes — Project Memory MCP

**Period**: January 30 – February 20, 2026  
**Commits**: ~80  
**Generated**: February 20, 2026

---

## Summary

Over 3 weeks of intensive development, the Project Memory MCP system evolved from an initial MCP server + basic VS Code extension into a comprehensive multi-component orchestration platform. Key themes: tool consolidation, agent system maturity, container support, interactive terminal development, supervisor infrastructure, and orchestration overhaul.

---

## Timeline by Feature Area

### Week 1 — Foundation & Consolidation (Jan 30 – Feb 5)

#### Initial Commit & Setup (Jan 30–31)
- **`0af8dc2`** — Initial README and project documentation
- **`9e9b077`** — VS Code extension created: `DashboardViewProvider`, `ServerManager`, file watchers

#### Agent System Buildout (Feb 1–4)
- **`93db69d`** — Dashboard components, agent definitions, extension features expanded
- **`9dba66d`** — Comprehensive VS Code extension setup guide
- **`63cc97c`** — Analyst agent added; ServerManager dashboard path updates; workspace config
- **`9c07d29`** — Step types system (`standard`, `analysis`, `validation`, `complex`, `critical`, etc.)
- **`6d4476f`** — Plan step types wired into the runtime
- **`9a3eb56`** — Goals/success criteria, step reordering ops, instruction generation, Runner agent

#### Tool Consolidation (Feb 3)
- **`8ca0abf`** — **Major milestone**: Consolidated 39 individual MCP tools → 5 unified tools (`memory_workspace`, `memory_plan`, `memory_steps`, `memory_context`, `memory_agent`), each with action-based dispatch

### Week 2 — Infrastructure & Agents (Feb 6–13)

#### Dashboard & UX (Feb 6–7)
- **`f87c83e`** — 16 system improvements to the MCP server and dashboard
- **`4644303`** — Dashboard icons and inline SVGs
- **`315a9f7`** — Sidebar widgets and dashboard pages updated
- **`19b7899`** — Sidebar Unicode artifact fix, isolate server button, empty steps validation

#### Context & Workspace Infrastructure (Feb 8–10)
- **`0347712`** — Context infrastructure overhaul, workspace handling improvements, handoff refinements
- **`70f4e0c`** — Workspace identity fixes and general improvements
- **`ac3e484`** / **`58b7ac6`** — File locking fixes (race condition resolution)
- **`01cd6a0`** — Codebase indexing improvements
- **`7f9c4ec`** — Workspace context storage, compact init mode, knowledge files system
- **`0b05236`** — Copy plan ID button, step filters/sorting, `workspace_set` auto-wrapping fix

#### Agent Maturity (Feb 10–11)
- **`0d25a00`** — Hub-only handoffs (Coordinator, Runner, Analyst) — established hub-and-spoke model
- **`241e27e`** — Remove `last_verified` from agents, build script docs, workspace context population
- **`1d3c10f`** — Agent behaviour improvements and dashboard refinements
- **`c2df4e7`** — Subagent recovery instructions
- **`dd6a792`** — Better subagent instruction issuing

#### Skills System (Feb 12)
- **`5a6f48f`** — Skills system introduced — domain-specific knowledge packs (`SKILL.md` format)

#### System Evolution (Feb 13)
- **`2667c74`** — **Major milestone**: System-wide architecture evolution — Builder agent, Integrated Programs, Skills, Context Optimization, and Subagent Architecture
- **`981f0ac`** — Instruction updates
- **`b4cf7d8`** — Container fix: proxy added for workspace folder access from container
- **`955e75d`** — Workspace discovery fixes for container mode

### Week 3 — Advanced Systems (Feb 14–20)

#### Programs & Cognition (Feb 14)
- **`e44bbe1`** — Integrated Program dashboard visualization
- **`7ccb722`** — Cognition agent (read-only reasoning spoke) and strict spawn tool
- **`6a8ee48`** — Instruction file reorganization: split monoliths, reclassify PM-internal skills
- **`3fd3c5e`** — SkillWriter refactor mode for cross-workspace instruction classification
- **`a76c958`** — Extension monolith split: skills/instructions UI components extracted
- **`85b0ce8`** — Parent-child workspace hierarchy with registration guard

#### Subagent Control (Feb 15)
- **`b5f25e5`** — Spawn tool repurposed from execution to context-prep only
- **`0940be3`** — Subagent cancellation prevention and spawn serialization
- **`fe5231e`** — Local workspace changes commit

#### Dashboard & Extension (Feb 16)
- **`7e9e79b`** — Program-aware plans dropdown filtering and relationship display
- **`e6fcc75`** — Deploy defaults fix, skills bug fix, identity staleness bug fix
- **`d6fdf20`** — Terminal updates and quality-of-life improvements
- **`969914e`** — Interactive terminal GUI visibility fix + build script DLL hardening
- **`7a7e193`** — Interactive terminal GUI launches successfully

#### Interactive Terminal (Feb 16–18)
- **`63c61c1`** — Phase 0: Clean slate — remove legacy terminal artifacts
- **`c6560e2`** — Interactive terminal overhaul (Rust + CxxQt + QML architecture)
- **`a6d3fd2`** — Interactive terminal able to launch
- **`c83c32b`** — Interactive terminal updates + revised agent session tooling
- **`480ae57`** — Wire `read_output`/`kill` protocol handling for terminal sessions

#### Orchestration Overhaul (Feb 18–19)
- **`8549d5b`** — Documentation for unfinished plans
- **`c035725`** — Strict two-mode architecture plan (local vs. container)
- **`46a91fa`** — Strict two-mode boundaries implementation (local + container mode alerts + liveness)
- **`e5a6435`** — Merge `feature/strict-mode-boundaries` branch

#### Supervisor (Feb 19–20)
- **`a1e84e2`** — Migration advisory auto-detection added to workspace/plan tools
- **`2c13652`** — **Supervisor Epic B**: Control API + handshake transport layer (Rust crate for local process supervision)

---

## Key Architectural Changes

### Tool Consolidation (Feb 3)
39 individual MCP tools were consolidated into 5 action-based tools:
| Tool | Actions |
|------|---------|
| `memory_workspace` | register, info, list, reindex, migrate, merge, scan_ghosts |
| `memory_plan` | list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, build scripts, templates, confirm, programs |
| `memory_steps` | add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace |
| `memory_context` | get, store, store_initial, list, append_research, list_research, generate_instructions, workspace context, knowledge files |
| `memory_agent` | init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage |

### Hub-and-Spoke Agent Model (Feb 10)
Agents restructured from flat peer model to hub-and-spoke:
- **Hub agents**: Coordinator, Analyst, Runner, TDDDriver — can spawn subagents
- **Spoke agents**: Executor, Reviewer, Tester, Architect, etc. — hand off to hub only
- Anti-spawning instructions, scope boundaries, and recovery protocols formalized

### Integrated Programs (Feb 13–14)
Multi-plan containers for grouping related work:
- Plans can be organized under program umbrellas
- Dashboard visualizes program hierarchy with progress aggregation
- `upgrade_to_program` converts large plans into programs automatically

### Skills System (Feb 12–14)
Reusable domain knowledge packs:
- Structured `SKILL.md` files with frontmatter metadata
- SkillWriter agent for generating and maintaining skills
- Matched skills injected into agent init context
- 18 skills registered (React, PySide6, CxxQt, MVC, etc.)

### Supervisor System (Feb 19–20)
New Rust crate (`supervisor/`) for local process management:
- Epic A: Foundation — project structure, config, lock files, process registry
- Epic B: Control API — named pipe/TCP transport, handshake protocol, JSON-RPC dispatch
- Planned: Epics C–F (Runtime Runners, VS Code Integration, Observability, Service Mode)

---

## Vulnerability Remediation (Feb 20)

During the Build, Test & Install plan execution:
- 13 npm audit findings in `vscode-extension/` identified
- Fixed 5 (minimatch ReDoS, qs DoS) via npm overrides in `package.json`
- Remaining 8 are moderate ajv ReDoS — dev-only, unfixable until eslint upgrades to ajv@8
- Created `.npmrc` with `audit-level=high` to suppress unfixable warnings
- Production dependencies confirmed zero vulnerabilities

---

## Build & Install Improvements (Feb 20)

- Created `install.ps1` — comprehensive component-based install script
  - Supports: Server, Extension, Container components (individually or combined)
  - Flags: `-InstallOnly`, `-SkipInstall`, `-Force`, `-NoBuild`
  - Error handling via `Invoke-Checked` helper
- Container rebuilt with latest changes (332 MB image)

---

## Statistics

| Metric | Value |
|--------|-------|
| Total commits | ~80 |
| Active plans | 22 |
| Archived plans | 56+ |
| Agent definitions | 16 |
| Skills registered | 18 |
| MCP tools | 5 consolidated + 4 extension-side |
| Dashboard pages | 8+ |
| Instruction files | 20+ |

---

## Post-February 2026 Updates (Plan execution follow-up)

### Realtime and event delivery behavior
- Clarified that dashboard refresh/invalidation is driven by persisted event flow and is not blocked by optional outbound notification channels.
- Preserved non-blocking delivery semantics so local state progression remains authoritative even when outbound dispatch is degraded.

### Webhook runtime configuration and safety controls
- Documented runtime controls and validation for webhook dispatch, including enablement, URL validation, optional signing, retry bounds, timeout limits, and queue controls.
- Configuration surface currently includes:
  - `PM_WEBHOOK_ENABLED`, `PM_WEBHOOK_URL`
  - `PM_WEBHOOK_SIGNING_ENABLED`, `PM_WEBHOOK_SECRET`
  - `PM_WEBHOOK_TIMEOUT_MS`, `PM_WEBHOOK_MAX_PAYLOAD_BYTES`
  - `PM_WEBHOOK_RETRY_MAX_ATTEMPTS`, `PM_WEBHOOK_RETRY_BASE_DELAY_MS`, `PM_WEBHOOK_RETRY_MAX_DELAY_MS`, `PM_WEBHOOK_RETRY_JITTER_RATIO`, `PM_WEBHOOK_RETRYABLE_STATUS_CODES`
  - `PM_WEBHOOK_QUEUE_CONCURRENCY`, `PM_WEBHOOK_QUEUE_MAX_INFLIGHT`, `PM_WEBHOOK_FAIL_OPEN_ON_QUEUE_OVERFLOW`

### VS Code extension plans workflow refinements
- Plans tab behavior now emphasizes explicit plan selection before rendering step details.
- Selected workspace/plan routing context is preserved to reduce accidental context drift when navigating between plans.
- Step-viewer expectations were documented: ordered step rendering with phase/type/status metadata for operator clarity.
