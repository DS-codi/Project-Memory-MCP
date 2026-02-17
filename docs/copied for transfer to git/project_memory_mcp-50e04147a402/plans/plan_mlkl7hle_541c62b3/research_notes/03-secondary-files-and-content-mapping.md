---
plan_id: plan_mlkl7hle_541c62b3
created_at: 2026-02-13T18:08:33.309Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Secondary Instruction Files Assessment & Content Mapping

## Assessment of Each Secondary File

---

### 1. handoff-protocol.instructions.md (153 lines)

**Current content:**
- Architecture diagram (hub-spoke model) — L6-25
- Hub/Spoke agent classification — L26-40
- Subagent spawning rules — L42-55
- Anti-patterns — L57-62
- Key rules for hubs vs spokes — L64-85
- Handoff flow example — L87-95
- What handoff does (mechanics) — L97-105
- Common handoff patterns table — L107-120
- Expanded agent handoff details — L122-165
- Subagent interruption recovery — L167-175
- Scope guardrails — L177-185

**Classification:**
| Content | Type | Destination |
|---------|------|-------------|
| Architecture diagram + hub/spoke classification | **SKILL** | agent-handoff/SKILL.md |
| Common handoff patterns table | **SKILL** | agent-handoff/SKILL.md |
| Expanded agent handoff details (per-agent routing) | **SKILL** | agent-handoff/SKILL.md |
| Handoff flow example | **SKILL** | agent-handoff/SKILL.md |
| "Only hub agents may call runSubagent" | **INSTRUCTION** | keep |
| Anti-spawning rules | **INSTRUCTION** | keep |
| Anti-patterns | **INSTRUCTION** | keep |
| Scope guardrails requirement | **INSTRUCTION** | keep |
| Subagent interruption recovery | **INSTRUCTION** | keep |

**Estimated split:** ~85 lines → skill, ~68 lines → instruction
**Reduced instruction file:** ~68 lines (from 153)

---

### 2. mcp-usage.instructions.md (142 lines)

**Current content:**
- Consolidated tools table — L8-17
- Required initialization rules — L19-30
- Tool usage patterns (create plans, templates, step progress, confirmation, ordering) — L32-95
- Recording handoffs example — L97-103
- Workspace vs plan context guidance — L105-118
- Completing agent sessions — L120-125
- Workspace identity rules — L127-138
- Hub-and-spoke model summary — L140-145

**Classification:**
| Content | Type | Destination |
|---------|------|-------------|
| Consolidated tools table | **SKILL** (overview/reference) | project-memory-overview or mcp-tools-usage |
| Tool usage patterns (create, templates, steps, confirmation) | **SKILL** | mcp-tools-usage/SKILL.md |
| Step ordering rules | **MIXED** — mandatory rules + guidance | Split |
| Workspace vs plan context guidance | **SKILL** | plan-context/SKILL.md |
| Workspace identity rules | **INSTRUCTION** | keep |
| Required initialization (MUST) | **INSTRUCTION** | keep |
| Hub-and-spoke model summary | **SKILL** (but already in handoff — redundant) | agent-handoff/SKILL.md (or remove duplicate) |

**Estimated split:** ~85 lines → skill, ~57 lines → instruction
**Reduced instruction file:** ~57 lines (from 142)

---

### 3. build-scripts.instructions.md (123 lines)

**Current content:**
- Retrieving build scripts — L7-14
- Running a build script — L16-24
- Registering new build scripts — L26-40
- This workspace's build commands (server, dashboard, vscode-ext, container, full build) — L42-90
- Script scope (workspace vs plan) — L92-100
- Agent responsibilities table — L102-110
- Reviewer workflow — L112-120
- Deleting scripts — L122-126

**Classification:**
| Content | Type | Destination |
|---------|------|-------------|
| How to retrieve/run/register scripts | **SKILL** | build-scripts/SKILL.md |
| This workspace's build commands tables | **SKILL** (workspace reference) | build-scripts/SKILL.md |
| Script scope guidance | **SKILL** | build-scripts/SKILL.md |
| Agent responsibilities table | **SKILL** | build-scripts/SKILL.md |
| Reviewer workflow for build-check | **SKILL** | build-scripts/SKILL.md |
| Deleting scripts guidance | **SKILL** | build-scripts/SKILL.md |
| "Always check for existing build scripts before running ad-hoc commands" | **INSTRUCTION** | keep (brief rule) |

**Estimated split:** ~115 lines → skill, ~8 lines → instruction
**Reduced instruction file:** ~8 lines (possibly merge into mcp-usage or delete standalone file)
**Note:** This file is almost entirely skill content. The instruction residue is minimal.

---

### 4. plan-context.instructions.md (64 lines)

**Current content:**
- Context file locations (directory structure) — L7-22
- Reading context (memory_plan get, memory_context get, workspace context) — L24-42
- Writing context (memory_context store, workspace_update) — L44-56
- Who reads what (agent → context type table) — L58-67

**Classification:**
| Content | Type | Destination |
|---------|------|-------------|
| Context file locations / directory structure | **SKILL** | plan-context/SKILL.md |
| Reading context patterns | **SKILL** | plan-context/SKILL.md |
| Writing context patterns | **SKILL** | plan-context/SKILL.md |
| "Who reads what" table | **SKILL** | plan-context/SKILL.md |

**Estimated split:** ~64 lines → skill, ~0 lines → instruction
**Reduced instruction file:** 0 lines (delete standalone file entirely)
**Note:** This entire file is skill content — no mandatory rules at all.

---

### 5. workspace-migration.instructions.md (56 lines)

**Current content:**
- When to use migrate action — L7-14
- How to migrate (JSON example) — L16-22
- What migrate does (9-step process) — L24-34
- Response fields table — L36-46
- When NOT to use — L48-52
- Recommended workflow for old workspaces — L54-58
- Related actions table — L60-68

**Classification:**
| Content | Type | Destination |
|---------|------|-------------|
| When to use / when NOT to use | **SKILL** | workspace-management/SKILL.md |
| How to migrate example | **SKILL** | workspace-management/SKILL.md |
| What migrate does (process description) | **SKILL** | workspace-management/SKILL.md |
| Response fields table | **SKILL** (reference) | workspace-management/SKILL.md |
| Recommended workflow | **SKILL** | workspace-management/SKILL.md |
| Related actions table | **SKILL** | workspace-management/SKILL.md |

**Estimated split:** ~56 lines → skill, ~0 lines → instruction
**Reduced instruction file:** 0 lines (delete standalone file entirely)
**Note:** Like plan-context, this is entirely skill content.

---

## Proposed Content Mapping Summary

### New Skills — Estimated Line Counts

| Proposed Skill | Sources | Estimated Lines |
|---------------|---------|-----------------|
| **project-memory-overview/SKILL.md** | §3+§5 from main file + tools table from mcp-usage | ~70 |
| **agent-handoff/SKILL.md** | ~85 lines from handoff-protocol + hub-spoke from mcp-usage | ~100 |
| **mcp-tools-usage/SKILL.md** | §4+§11+§12+§13+§14 from main file + patterns from mcp-usage | ~400 |
| **build-scripts/SKILL.md** | ~115 lines from build-scripts instruction | ~120 |
| **plan-context/SKILL.md** | ~64 lines from plan-context instruction + workspace-vs-plan from mcp-usage | ~80 |
| **workspace-management/SKILL.md** | ~56 lines from workspace-migration instruction | ~65 |

**Total new skill content:** ~835 lines across 6 files

### Reduced Instruction Files — Post-Extraction

| Instruction File | Original | After Extraction | Notes |
|-----------------|----------|-----------------|-------|
| project-memory-system.instructions.md | 2244 | ~1694 | Tool schemas + mandatory rules only |
| handoff-protocol.instructions.md | 153 | ~68 | Spawning rules + anti-patterns only |
| mcp-usage.instructions.md | 142 | ~57 | Init requirements + identity rules only |
| build-scripts.instructions.md | 123 | ~8 | Single-line rule (or merge/delete) |
| plan-context.instructions.md | 64 | 0 | **DELETE** — all content is skill |
| workspace-migration.instructions.md | 56 | 0 | **DELETE** — all content is skill |
| **TOTALS** | **2782** | **~1827** | **34% reduction** |

---

## Issues & Adjustments for Existing Plan Steps

### Issue 1: mcp-tools-usage is very large (~400 lines)
The `mcp-tools-usage/SKILL.md` absorbs the most content. Consider whether to split further:
- `mcp-tools-usage/SKILL.md` — core tool patterns and workflows (~200 lines)
- `agent-role-tips/SKILL.md` — per-agent tips and anti-patterns (~200 lines)

**Recommendation:** Keep as single file for now (400 lines is within reason for a comprehensive skill).

### Issue 2: build-scripts instruction file nearly empty after extraction
After extracting skill content, the build-scripts instruction file would be ~8 lines (just "Always check for existing build scripts"). This could be merged as a one-liner into `mcp-usage.instructions.md` rather than keeping a separate file.

### Issue 3: Two instruction files should be deleted entirely
`plan-context.instructions.md` and `workspace-migration.instructions.md` are 100% skill content. The plan should include steps to delete these files (or the existing steps should note this).

### Issue 4: Main instruction file remains large
At ~1694 lines, `project-memory-system.instructions.md` is still predominantly tool API schemas. This is appropriate — schemas are mandatory reference that should stay in instructions. No further extraction needed.

### Issue 5: Description field is critical for skill discovery
The `skills.tools.ts` matching algorithm weights description + first 500 chars heavily. Each new SKILL.md should have a carefully crafted description starting with "Use this skill when..." that includes relevant trigger keywords for matching.
