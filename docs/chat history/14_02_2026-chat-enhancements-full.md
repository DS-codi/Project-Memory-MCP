User: lets begin brainstorming ways we can improve Project Memory with enhancements to the chat and tools 
 plan_mllk399r_69d8f32a — "Chat Response Enhancements for Project Memory"

GitHub Copilot: 

  

Ran `memory_agent` 
Completed with input: {
  "action": "init",
  "agent_type": "Brainstorm",
  "workspace_id": "project-memory-mcp-40f6678f5a9b",
  "plan_id": "plan_mllk399r_69d8f32a",
  "validation_mode": "init+validate",
  "context": {
    "deployed_by": "User",
    "reason": "Brainstorming chat response enhancements for Project Memory"
  }
}

Now let me read the VS Code chat response stream skill and look at the current chat participant implementation to understand what we're working with.  

Read skill [vscode-chat-response-stream](file:///c%3A/Users/User/Project_Memory_MCP/.github/skills/vscode-chat-response-stream/SKILL.md?vscodeLinkType%3Dskill#1-1), lines 1 to 200

Searched for files matching `**/vscode-extension/src/**/*chat*`, no matches

Searched for files matching `**/vscode-extension/src/**/*.ts`, 50 matches

Read skill [vscode-chat-response-stream](file:///c%3A/Users/User/Project_Memory_MCP/.github/skills/vscode-chat-response-stream/SKILL.md?vscodeLinkType%3Dskill#200-200), lines 200 to 400

Read skill [vscode-chat-response-stream](file:///c%3A/Users/User/Project_Memory_MCP/.github/skills/vscode-chat-response-stream/SKILL.md?vscodeLinkType%3Dskill#400-400), lines 400 to 608

Read [](file:///c%3A/Users/User/Project_Memory_MCP/Project-Memory-MCP/vscode-extension/src/chat/ChatParticipant.ts#1-1), lines 1 to 100

Read [](file:///c%3A/Users/User/Project_Memory_MCP/Project-Memory-MCP/vscode-extension/src/chat/ChatParticipant.ts#100-100), lines 100 to 220

Read [](file:///c%3A/Users/User/Project_Memory_MCP/Project-Memory-MCP/vscode-extension/src/chat/ChatPlanCommands.ts#1-1), lines 1 to 100

Read [](file:///c%3A/Users/User/Project_Memory_MCP/Project-Memory-MCP/vscode-extension/src/chat/ChatMiscCommands.ts#1-1), lines 1 to 100

Now let me also look at how the tools are structured and the existing chat tool implementations:  

Read [](file:///c%3A/Users/User/Project_Memory_MCP/Project-Memory-MCP/vscode-extension/src/chat/ChatPlanCommands.ts#100-100), lines 100 to 233

Read [](file:///c%3A/Users/User/Project_Memory_MCP/Project-Memory-MCP/vscode-extension/src/chat/ChatMiscCommands.ts#100-100), lines 100 to 304

Now let me also check the existing tool implementations and knowledge command handler to get a full picture:  

Read [](file:///c%3A/Users/User/Project_Memory_MCP/Project-Memory-MCP/vscode-extension/src/chat/ChatContextCommands.ts#1-1), lines 1 to 60

Searched for text `stream.button` (`**/vscode-extension/src/chat/tools/*.ts`), no results

Searched for regex `button\(|filetree\(|reference\(|anchor\(|\.progress\(` (`**/vscode-extension/src/**/*.ts`), 12 results

Searched for regex `\"command\":` (`**/vscode-extension/package.json`), 34 results

Now I have a thorough understanding of the current state. Let me store this brainstorm as context and present the ideas.Good, now I have all the context I need. Let me present the brainstorm.

# Brainstorm Session: Chat Response Enhancements for Project Memory

**Topic:** Enriching the `@memory` chat participant with interactive response features from the VS Code ChatResponseStream API.

---

## Current State Assessment

Right now, the chat participant uses only two response methods:
- **`response.markdown()`** — all content is plain markdown text
- **`response.progress()`** — transient loading indicators

That means **zero** usage of:
- `response.button()` — action buttons
- Command links via `MarkdownString` with `isTrusted.enabledCommands`
- `response.filetree()` — file tree visualizations
- `response.reference()` / `response.anchor()` — file references
- `ChatFollowupProvider` — exists but is minimal (only a few hardcoded follow-ups)

There's a huge surface area to make the chat experience interactive instead of read-only.

---

## Ideas

### Idea 1: Action Buttons on Plan Responses

**Summary:** Add `stream.button()` calls to plan-related responses so users can take immediate action.

**Where it applies:**
- `/plan list` — each plan gets a "View Details" button, active plans get an "Archive" button
- `/plan show <id>` — buttons for "Archive Plan", "Open in Dashboard", "Run Build Script"
- `/plan create` — button to "View Plan Details" after creation
- `/status` — "Refresh Status" button, plus "View Plan" for each listed plan

**Approach:**
- Register new commands like `projectMemory.archivePlan`, `projectMemory.showPlanInChat`, `projectMemory.runBuildScript` that accept plan/workspace IDs as arguments
- Wire buttons into existing handlers

**Pros:**
- Eliminates copy-pasting plan IDs to interact
- Makes the chat feel like a real control panel
- Low implementation risk — `button()` is straightforward

**Cons:**
- Need to register VS Code commands for each action
- Some actions (archive, delete) are destructive — need confirmation UX

**Complexity:** Low-Medium
**Impact:** High

---

### Idea 2: Command Links for Inline Plan/Step References

**Summary:** Use `MarkdownString` with `isTrusted.enabledCommands` to make plan IDs, step references, and agent names clickable inline.

**Where it applies:**
- Whenever a plan ID is displayed, make it a clickable link that opens plan details
- Step numbers become clickable to mark them active/done
- Agent names in lineage history link to agent instruction files

**Approach:**
```typescript
const md = new vscode.MarkdownString();
md.isTrusted = { enabledCommands: ['projectMemory.showPlanInChat'] };
const args = encodeURIComponent(JSON.stringify([planId]));
md.appendMarkdown(`[${planTitle}](command:projectMemory.showPlanInChat?${args})`);
response.markdown(md);
```

**Pros:**
- More natural reading experience — click right in the text
- Great for dense lists where buttons would be overwhelming
- Works alongside regular markdown

**Cons:**
- Must be careful with `enabledCommands` allowlisting
- URL-encoded JSON args can get messy to debug
- Mixed plain `markdown()` and `MarkdownString` objects need care

**Complexity:** Medium
**Impact:** High

---

### Idea 3: File Tree for Plan Artifacts and Step File Lists

**Summary:** Use `stream.filetree()` when showing plan artifacts, executor file lists, or workspace structure.

**Where it applies:**
- `/plan show` after steps — show "Files Modified" as a clickable tree
- Executor completion summaries — show created/modified files
- `/context` — show codebase structure via the profile
- `/deploy` results — show which files were deployed

**Approach:**
- Executor/Reviewer agents already store `artifacts` and `files_modified` in context
- Parse those lists into `ChatResponseFileTree[]` and render

**Pros:**
- Clickable file nodes open the file directly — huge UX win
- Visual hierarchy makes file lists scannable
- Already a native VS Code component, looks polished

**Cons:**
- Only useful when file lists exist (not all plans have artifacts yet)
- Need to gather file data from plan context/sessions

**Complexity:** Low
**Impact:** Medium

---

### Idea 4: File References and Anchors in Handoff Summaries

**Summary:** Use `stream.reference()` for file chips and `stream.anchor()` for inline file links when displaying handoff summaries, review findings, or executor logs.

**Where it applies:**
- Handoff data includes `files_modified` — render each as a `reference()` chip
- Review findings referencing specific files/lines — use `anchor()` with `Location`
- `/status` plan summaries that mention key files

**Approach:**
```typescript
response.markdown('### Files Modified\n\n');
for (const file of handoffData.files_modified) {
    response.reference(vscode.Uri.file(file), new vscode.ThemeIcon('file'));
    response.markdown('\n');
}
```

**Pros:**
- Professional look — chip-style references with icons
- One-click navigation to any referenced file
- Especially powerful for code review summaries

**Cons:**
- Requires absolute file paths — need to resolve relative paths from workspace
- Files might not exist yet (planned but not created)

**Complexity:** Low
**Impact:** Medium

---

### Idea 5: Build Script Action Buttons

**Summary:** When listing build scripts or showing plan details, add buttons that run registered build scripts directly.

**Where it applies:**
- New `/build` or `/scripts` slash command that lists and runs scripts
- `/plan show` — if the plan has associated build scripts, show run buttons
- Post-execution summaries — "Run Build to Verify" button

**Approach:**
- Register `projectMemory.runBuildScript` command that accepts `(workspaceId, scriptId)`
- The command resolves the script via MCP (`run_build_script`), then executes in terminal
- Button in chat: `response.button({ title: '▶️ Run Build', command: 'projectMemory.runBuildScript', arguments: [wsId, scriptId] })`

**Pros:**
- Turns chat into a lightweight CI control panel
- Agents already register build scripts — this exposes them to users
- Reduces context-switching to terminal

**Cons:**
- Need terminal management — show output or notification?
- Script might fail — need error reporting UX back to chat
- Destructive scripts (deploy) need safety guardrails

**Complexity:** Medium
**Impact:** High

---

### Idea 6: Enhanced ChatFollowupProvider

**Summary:** Make follow-up suggestions context-aware and comprehensive instead of the current minimal set.

**Where it applies:**
- After `/plan show` — suggest "Archive", "Add Step", "Run Build", "Start Executor"
- After `/plan create` — suggest "Add Steps", "Assign Architect", "View Plan"
- After `/status` — suggest viewing the most-active plan
- After handoff — suggest running the recommended next agent
- After `/context` — suggest "Set Context Section", "Store Knowledge"

**Approach:**
- Pass richer metadata from handlers to `ChatResult`
- Build a follow-up provider that maps metadata combinations to relevant next actions
- Include plan IDs, step counts, recommended agents in metadata

**Pros:**
- Massively reduces "what do I type next?" friction
- Contextual suggestions feel intelligent
- Already half-implemented — just needs richer metadata flow

**Cons:**
- Follow-up provider can't access MCP (it's sync-ish)
- Need to pre-compute relevant follow-ups in the handler
- Too many follow-ups could be overwhelming

**Complexity:** Low
**Impact:** High

---

### Idea 7: Step Manipulation Buttons

**Summary:** When showing plan steps, add inline buttons to mark steps done/active or skip them.

**Where it applies:**
- `/plan show <id>` — each pending step gets "▶️ Start" button, active steps get "✅ Done" button
- Could add "⏭️ Skip" for steps that are no longer relevant

**Approach:**
- Register commands: `projectMemory.markStepActive`, `projectMemory.markStepDone`
- Pass `[workspaceId, planId, stepIndex]` as arguments
- Command handler calls MCP `memory_steps(action: update)`

**Pros:**
- Users can drive plan execution from chat without typing
- Natural workflow: view plan → start step → finish step → next
- Combined with follow-ups, creates a guided experience

**Cons:**
- Many buttons per plan could be cluttered (10+ steps = 10+ buttons)
- Need to decide: buttons per step, or just "Mark Next Step Active"?
- Command links might be better here than full buttons (less visual noise)

**Complexity:** Medium
**Impact:** Medium-High

---

### Idea 8: Agent Handoff Approval Buttons

**Summary:** When an agent recommends a handoff (e.g., "Executor recommends Reviewer"), show approval buttons in chat.

**Where it applies:**
- After viewing a plan with `recommended_next_agent` set
- `/handoff` command — instead of typing args, use buttons
- Coordinator flow — show "Approve handoff to Reviewer?" with Accept/Reject buttons

**Approach:**
- `/plan show` detects `recommended_next_agent` and renders:
  ```
  response.button({ title: '🚀 Launch Reviewer', command: 'projectMemory.launchAgent', arguments: [wsId, planId, 'Reviewer'] });
  ```
- Command triggers the handoff + optionally opens the agent prompt

**Pros:**
- Makes the handoff protocol user-friendly
- Aligns with the hub-and-spoke model — user becomes a mini-Coordinator
- Visual confirmation before launching agents

**Cons:**
- "Launching" an agent from a button is conceptually different from running a subagent
- May need to integrate with VS Code's chat to send a prompt to the right agent mode
- Complex interaction pattern to design well

**Complexity:** High
**Impact:** High

---

### Idea 9: Progress Indicators for MCP Operations

**Summary:** Systematically add `stream.progress()` before every MCP call and remove inconsistency.

**Where it applies:**
- Many handlers already use `progress()` but inconsistently
- Some handlers do MCP calls with no progress indicator
- Multi-step handlers (status, context) should show progress between each call

**Approach:**
- Audit all handlers, ensure every `mcpBridge.callTool()` is preceded by `progress()`
- Create a helper: `async function withProgress<T>(response, msg, fn): Promise<T>`

**Pros:**
- Consistent UX — user always knows something is happening
- Easy to implement
- No new commands or registrations needed

**Cons:**
- Minor improvement — already partially done
- Could feel noisy for fast operations

**Complexity:** Very Low
**Impact:** Low

---

## Priority Matrix

| # | Enhancement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | Action Buttons on Plans | High | Low-Med | **P1** |
| 6 | Enhanced FollowupProvider | High | Low | **P1** |
| 5 | Build Script Buttons | High | Medium | **P1** |
| 2 | Command Links for IDs | High | Medium | **P2** |
| 7 | Step Manipulation Buttons | Med-High | Medium | **P2** |
| 8 | Agent Handoff Buttons | High | High | **P2** |
| 3 | File Tree for Artifacts | Medium | Low | **P3** |
| 4 | File References/Anchors | Medium | Low | **P3** |
| 9 | Consistent Progress | Low | Very Low | **P3** |

---

## Open Questions

1. **Button vs Command Link?** For step actions, do we prefer full buttons (prominent) or command links (inline, less noisy)? Probably command links for steps, buttons for major actions (archive, build, launch agent).

2. **New slash commands?** Should we add `/build`, `/scripts`, `/steps` as dedicated commands, or keep everything under `/plan`?

3. **Agent launching from chat** — What mechanism? A button that sends a chat prompt to `@memory` with an agent mode? Or a command that opens a new chat with the right mode pre-selected?

4. **Confirmation for destructive actions** — Archive, delete plan, skip step. Use a two-button pattern ("Are you sure?" → "Yes, archive" / "Cancel")? Or just do it with undo?

5. **Dashboard vs Chat** — Some of these features overlap with what the dashboard does. Should chat become a lightweight dashboard, or stay complementary?

---

What areas interest you most? Want to dig deeper into any of these, or are there other interaction patterns you've been thinking about?

User: # Button vs Command Link? For step actions, do we prefer full buttons (prominent) or command links (inline, less noisy)? Probably command links for steps, buttons for major actions (archive, build, launch agent).
- Explain the difference between the two
# New slash commands? Should we add /build, /scripts, /steps as dedicated commands, or keep everything under /plan?
- explain what slash commands do
# Agent launching from chat — What mechanism? A button that sends a chat prompt to @memory with an agent mode? Or a command that opens a new chat with the right mode pre-selected?
- explain what agents launching you are talking about; subagent or chat agent (the one that recieves prompts)
# Confirmation for destructive actions — Archive, delete plan, skip step. Use a two-button pattern ("Are you sure?" → "Yes, archive" / "Cancel")? Or just do it with undo?
- Two button panel
# Dashboard vs Chat — Some of these features overlap with what the dashboard does. Should chat become a lightweight dashboard, or stay complementary?
- complimentary / synced


GitHub Copilot: 

 Great questions — let me break each one down clearly.

---

## 1. Button vs Command Link

These are two different visual/interaction patterns in VS Code chat responses:

**Button (`response.button()`):**
- Renders as a **full, prominent clickable button** below the chat text
- Visually stands out — looks like a UI button with a border/background
- Good for **primary actions** you want the user to notice: "Archive Plan", "Run Build", "Launch Agent"
- Each button takes up visual space — 10 buttons in a row would be cluttered

**Command Link (`MarkdownString` with `command:` URI):**
- Renders as an **inline hyperlink** inside markdown text — just underlined text
- Blends naturally into the content flow
- Good for **secondary/contextual actions** embedded in lists: clicking a plan ID to view it, clicking a step number to toggle its status
- Compact — you can have many in a list without visual overload

**The principle:** Buttons for primary actions, command links for navigation and inline interactions.

Example for `/plan show`:
```
# 📋 My Plan                          ← markdown
🔵 Step 1: Set up auth               [▶️ Start]   ← command link (inline)
⬜ Step 2: Create endpoints           
✅ Step 3: Add tests                  

──────────────────────────────
[📦 Archive Plan]  [🔨 Run Build]     ← full buttons (prominent)
```

---

## 2. Slash Commands

Slash commands are the `/plan`, `/status`, `/context`, etc. that appear in the `@memory` chat participant. They're registered in package.json under the chat participant's `commands` array and route to different handler functions.

**Current commands:** `/plan`, `/context`, `/handoff`, `/status`, `/deploy`, `/diagnostics`, `/knowledge`

**The question:** Should we add new top-level commands like `/build`, `/scripts`, `/steps`?

**Recommendation: Keep under `/plan` with subcommands.** Reasons:
- `/plan build` or `/plan scripts` keeps the namespace tidy
- `/plan steps <planId>` could be a focused step-only view (lighter than `show`)
- Too many top-level slash commands creates decision fatigue
- Exception: `/build` as a standalone might make sense since build scripts are workspace-scoped, not plan-scoped

---

## 3. Agent Launching — What Kind?

Two very different things here:

**Chat agents (the user-facing ones):** These are the `.agent.md` modes like `@memory` with Brainstorm mode, Coordinator mode, etc. The user selects them in the VS Code chat panel and sends prompts to them. "Launching" one means opening a new chat turn with that agent mode pre-selected.

**Subagents (programmatic):** These are spawned by hub agents via `runSubagent()` inside Copilot's tool system. The user doesn't directly interact — they run autonomously and return results.

**What I was proposing:** When a plan has `recommended_next_agent: "Reviewer"`, add a button that opens a new chat prompt pre-addressed to the right agent mode. This is about **chat agents** — giving the user a one-click way to kick off the next phase with the correct agent, rather than manually switching modes and typing the right prompt.

For example, after Executor completes, the chat shows:
```
✅ Executor completed Phase 2. Recommends: Reviewer

[🚀 Launch Reviewer]   ← button that initiates a chat 
                           prompt to @memory in Reviewer mode
                           with plan context pre-filled
```

The mechanism would be a VS Code command that calls `vscode.commands.executeCommand('workbench.action.chat.open', { ... })` or similar to pre-populate a chat prompt targeting the right agent mode.

---

## 4. Confirmation for Destructive Actions — Two-Button Pattern

Agreed. The flow would be:

**Step 1:** User clicks "Archive Plan" button  
**Step 2:** Command handler sends a **confirmation chat message** back:

```
⚠️ Are you sure you want to archive "My Plan" (plan_abc123)?
This cannot be undone.

[✅ Yes, Archive]   [❌ Cancel]
```

**Step 3a:** "Yes, Archive" button triggers `projectMemory.archivePlanConfirmed` with the plan ID → executes the action  
**Step 3b:** "Cancel" button triggers a no-op or just shows "Cancelled."

This works because each button is a separate registered command. The "first" button just shows the confirmation message with the two real action buttons — it doesn't perform the destructive action itself.

---

## 5. Dashboard vs Chat — Complementary & Synced

Agreed. The design should be:

- **Dashboard** = full visual overview, drag-and-drop, bulk operations, always-visible sidebar panel
- **Chat** = conversational interface, quick actions, in-context during agent work, follow-ups

**Synced means:**
- Actions in chat (archive plan, mark step done) should immediately reflect in the dashboard
- Dashboard actions should be visible on next `/plan show` in chat
- Both read from the same MCP state — they're already synced at the data layer
- Chat can include "Open in Dashboard" buttons for when the user wants the richer UI

The chat becomes a **command line** for Project Memory, while the dashboard is the **GUI**. Both are valid entry points, neither replaces the other.

---

## Refined Enhancement Priorities Based on Your Answers

| # | Enhancement | Notes from Discussion |
|---|-------------|----------------------|
| 1 | **Plan action buttons** (archive, build, dashboard) | Full buttons for primary actions |
| 2 | **Command links** for plan IDs and step toggles | Inline links in text, not buttons |
| 3 | **Enhanced FollowupProvider** | Context-aware next-action chips |
| 4 | **Build script buttons** | Full button, workspace-scoped — maybe `/build` as standalone command |
| 5 | **Two-button confirmation pattern** | For archive, delete, skip |
| 6 | **Agent launch buttons** | Chat agent mode launch, not subagent |
| 7 | **"Open in Dashboard" bridge buttons** | Complement, don't compete |
| 8 | **File tree / references** | Lower priority, add when artifact data flows through |

Want to dive deeper into any of these, or should we start shaping this into a formal plan for the Architect?

User: Revised responses to earlier questions:
## Button vs Command Link? For step actions, do we prefer full buttons (prominent) or command links (inline, less noisy)? Probably command links for steps, buttons for major actions (archive, build, launch agent).
- use both logically. I definitely want to connect buttons to the terminal tools being built from the Integrated Program "Interactive Terminal GUI System", I will update that plan, dont touch it. Does the skills document already cover implementing buttons? Command links should allow for easy navigation to all reference material when its used/created and steps. Having buttons to research further after the intial architect plan and add to plan buttons for suggestions could be cool
## New slash commands? Should we add /build, /scripts, /steps as dedicated commands, or keep everything under /plan?
- keep under /plan with subcommands but add a help subcommand
## Agent launching from chat — What mechanism? A button that sends a chat prompt to @memory with an agent mode? Or a command that opens a new chat with the right mode pre-selected?
- I could see this being useful for creating multiple chat sessions for Integrated Programs that have multiple plans that arent dependant on others. It could prefill the chat identification and auto select the correct agent. Could also be useful when something arrises that's out of scope and requires a dedicated plan (can't be resolved easily)
## Confirmation for destructive actions — Archive, delete plan, skip step. Use a two-button pattern ("Are you sure?" → "Yes, archive" / "Cancel")? Or just do it with undo?
- Two button panel. 
## Dashboard vs Chat — Some of these features overlap with what the dashboard does. Should chat become a lightweight dashboard, or stay complementary?
- complimentary / synced

GitHub Copilot: 

 Great refinements. Let me synthesize these into sharper concepts, especially the new angles you've raised.

---

## Refined Concepts

### 1. Buttons + Command Links — Used Logically Together

**Your direction is clear:** both, each in their natural place.

The ChatResponseStream skill already covers `stream.button()` with examples including custom extension commands with arguments — so yes, the implementation pattern is documented. The skill covers the `Command` interface (`title`, `command`, `tooltip`, `arguments`), command registration, and the `isTrusted.enabledCommands` pattern for command links.

**New ideas from your feedback:**

**"Research Further" & "Add to Plan" buttons after Architect output:**
When the Architect produces a plan, the chat response could include:
```
## Plan: Add Authentication
Phase 1: Research → Phase 2: Implement → Phase 3: Test

[🔍 Research Further]  [➕ Add Step]  [📋 Open in Dashboard]
```
- "Research Further" → opens a new chat turn pre-addressed to the Researcher agent with the plan context
- "Add Step" → prompts the user for a step description, then calls `memory_steps(action: add)`
- These action buttons transform the plan from a static readout into a **living document in chat**

**Command links for reference navigation:**
When a plan step references files, research notes, or context, those become clickable inline:
```
✅ Step 3: Implement JWT middleware
   Files: [src/middleware/auth.ts] [src/config/jwt.ts]    ← command links → open file
   Research: [api-analysis.md]                             ← command link → show research note
   Context: [architecture decisions]                       ← command link → show context
```

**Terminal tool buttons (Interactive Terminal integration):**
You've noted linking buttons to the terminal tools from the Interactive Terminal GUI Program — I won't touch that plan, but the chat enhancement plan should include a **hook point** or interface contract where terminal tool commands can be wired to chat buttons. Something like:
- "Run in Terminal" button on build script listings
- "Approve Command" / "Decline Command" buttons that call the terminal tool's invokables
- This creates a unified control surface across chat, dashboard, and terminal GUI

---

### 2. `/plan help` Subcommand

Keep everything under `/plan` but add contextual help:

```
/plan help          → full command reference
/plan help create   → detailed help for create subcommand
/plan help show     → detailed help for show subcommand
```

Currently the default `/plan` (no args) shows a basic usage hint. A proper `help` subcommand could:
- List all subcommands with descriptions
- Show examples
- Include buttons: `[Try: /plan list]` `[Try: /plan create]`
- Follow-ups suggest the most common commands

---

### 3. Multi-Chat Agent Launching for Integrated Programs

This is the most interesting new concept. Two use cases:

**Use Case A: Parallel work on independent child plans**

An Integrated Program has 3 child plans that aren't dependent on each other. The chat could show:
```
## 📦 Program: Authentication Overhaul
├── Plan A: JWT Backend (independent)     [🚀 Launch Executor]
├── Plan B: Login UI (independent)        [🚀 Launch Executor]  
└── Plan C: Migration Script (blocked by A)   ⏳ Waiting

Each launch opens a NEW chat session with:
- Agent mode pre-selected (Executor, Reviewer, etc.)
- Plan ID and workspace ID pre-filled in the prompt
- Context about the specific child plan
```

This becomes a **mission control** for program-level parallelism. The Coordinator doesn't need to serialize — it can fan out to multiple chat sessions.

**Use Case B: Out-of-scope escalation**

An Executor hits something that's out of scope — say, a dependency needs upgrading first. Instead of the agent trying to handle it (scope violation), a button appears:
```
⚠️ Scope escalation: `jsonwebtoken` package is outdated and has
   a breaking API change that blocks this step.

[🆕 Create Dedicated Plan]  [⏸️ Mark Step Blocked]
```

"Create Dedicated Plan" opens a new chat session pre-filled with:
- A description of the issue
- The parent plan/program context
- Suggested category ("bug" or "change")
- Auto-links it to the parent program if one exists

This is essentially the scope escalation pattern from subagent-recovery.instructions.md but made user-facing with a single click.

**Technical mechanism:**
The VS Code API `vscode.commands.executeCommand('workbench.action.chat.open', ...)` or `vscode.commands.executeCommand('workbench.action.chat.newChat', ...)` can open a chat panel. We'd need to research whether we can pre-select an agent mode and pre-fill a prompt. If not, we register a command that:
1. Creates a new chat panel
2. Inserts the prompt text
3. The user just hits Enter

---

### 4. Two-Button Confirmation — Pattern Defined

For any destructive action, the pattern is:

**Step 1:** User clicks primary action button (e.g., "Archive Plan")
**Step 2:** A confirmation VS Code command runs that renders a chat response:
```
⚠️ **Confirm Archive**

Are you sure you want to archive "Add Authentication" (plan_abc123)?
This will move the plan to archived status.

[✅ Yes, Archive]   [❌ Cancel]
```
**Step 3:** "Yes" triggers the real action. "Cancel" shows "Cancelled." and does nothing.

This requires two registered commands per destructive action:
- `projectMemory.confirmArchivePlan` — shows the confirmation message
- `projectMemory.archivePlanConfirmed` — performs the archive

Or, more elegantly, a **single generic confirmation command** that takes an action descriptor:
```typescript
// Generic: projectMemory.confirmAction
arguments: [{
  action: 'archive',
  label: 'Archive Plan',
  description: 'Move "Add Auth" to archived status',
  confirmCommand: 'projectMemory.executeAction',
  confirmArgs: [wsId, planId, 'archive']
}]
```

---

### 5. Complementary & Synced — Chat ↔ Dashboard Bridge

Both read/write MCP state, so data sync is inherent. The chat enhancements should include:

- **"Open in Dashboard" button** on every plan response — jumps to that plan in the sidebar panel
- **Dashboard → Chat** — the dashboard could have a "Discuss in Chat" button that opens `@memory /plan show <id>`
- **Shared notifications** — when a step is marked done in chat, the dashboard updates; vice versa
- Chat is the **conversational CLI**, dashboard is the **visual GUI**

---

## Updated Priority Ranking

| # | Enhancement | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | **Plan action buttons** (archive, build, dashboard, add step) | High | Low-Med | **P1** |
| 2 | **Command links** for files, research, steps, plan IDs | High | Medium | **P1** |
| 3 | **Enhanced FollowupProvider** with context-aware suggestions | High | Low | **P1** |
| 4 | **Two-button confirmation pattern** (generic) | Medium | Low | **P1** |
| 5 | **`/plan help` subcommand** | Medium | Very Low | **P1** |
| 6 | **Multi-chat agent launching** for Programs | High | High | **P2** |
| 7 | **Out-of-scope escalation button** (create plan from blocker) | High | Medium | **P2** |
| 8 | **Build script buttons** (hooks for terminal tool integration) | High | Medium | **P2** |
| 9 | **"Research Further" / "Add to Plan" suggestion buttons** | Medium | Medium | **P2** |
| 10 | **File tree / references** for artifacts | Medium | Low | **P3** |
| 11 | **Chat ↔ Dashboard bridge buttons** | Medium | Low | **P3** |
| 12 | **Consistent progress indicators** | Low | Very Low | **P3** |

---

## Ready for Architect?

This feels like a solid brainstorm output. The decisions are made, the patterns are defined, and the priorities are ranked. Shall I hand off to Coordinator with a recommendation for Architect to decompose this into implementation steps?