Refined Concepts
1. Buttons + Command Links — Used Logically Together
Your direction is clear: both, each in their natural place.

The ChatResponseStream skill already covers stream.button() with examples including custom extension commands with arguments — so yes, the implementation pattern is documented. The skill covers the Command interface (title, command, tooltip, arguments), command registration, and the isTrusted.enabledCommands pattern for command links.

New ideas from your feedback:

"Research Further" & "Add to Plan" buttons after Architect output:
When the Architect produces a plan, the chat response could include:

"Research Further" → opens a new chat turn pre-addressed to the Researcher agent with the plan context
"Add Step" → prompts the user for a step description, then calls memory_steps(action: add)
These action buttons transform the plan from a static readout into a living document in chat
Command links for reference navigation:
When a plan step references files, research notes, or context, those become clickable inline:

Terminal tool buttons (Interactive Terminal integration):
You've noted linking buttons to the terminal tools from the Interactive Terminal GUI Program — I won't touch that plan, but the chat enhancement plan should include a hook point or interface contract where terminal tool commands can be wired to chat buttons. Something like:

"Run in Terminal" button on build script listings
"Approve Command" / "Decline Command" buttons that call the terminal tool's invokables
This creates a unified control surface across chat, dashboard, and terminal GUI
2. /plan help Subcommand
Keep everything under /plan but add contextual help:

Currently the default /plan (no args) shows a basic usage hint. A proper help subcommand could:

List all subcommands with descriptions
Show examples
Include buttons: [Try: /plan list] [Try: /plan create]
Follow-ups suggest the most common commands
3. Multi-Chat Agent Launching for Integrated Programs
This is the most interesting new concept. Two use cases:

Use Case A: Parallel work on independent child plans

An Integrated Program has 3 child plans that aren't dependent on each other. The chat could show:

This becomes a mission control for program-level parallelism. The Coordinator doesn't need to serialize — it can fan out to multiple chat sessions.

Use Case B: Out-of-scope escalation

An Executor hits something that's out of scope — say, a dependency needs upgrading first. Instead of the agent trying to handle it (scope violation), a button appears:

"Create Dedicated Plan" opens a new chat session pre-filled with:

A description of the issue
The parent plan/program context
Suggested category ("bug" or "change")
Auto-links it to the parent program if one exists
This is essentially the scope escalation pattern from subagent-recovery.instructions.md but made user-facing with a single click.

Technical mechanism:
The VS Code API vscode.commands.executeCommand('workbench.action.chat.open', ...) or vscode.commands.executeCommand('workbench.action.chat.newChat', ...) can open a chat panel. We'd need to research whether we can pre-select an agent mode and pre-fill a prompt. If not, we register a command that:

Creates a new chat panel
Inserts the prompt text
The user just hits Enter
4. Two-Button Confirmation — Pattern Defined
For any destructive action, the pattern is:

Step 1: User clicks primary action button (e.g., "Archive Plan")
Step 2: A confirmation VS Code command runs that renders a chat response:

Step 3: "Yes" triggers the real action. "Cancel" shows "Cancelled." and does nothing.

This requires two registered commands per destructive action:

projectMemory.confirmArchivePlan — shows the confirmation message
projectMemory.archivePlanConfirmed — performs the archive
Or, more elegantly, a single generic confirmation command that takes an action descriptor:

5. Complementary & Synced — Chat ↔ Dashboard Bridge
Both read/write MCP state, so data sync is inherent. The chat enhancements should include:

"Open in Dashboard" button on every plan response — jumps to that plan in the sidebar panel
Dashboard → Chat — the dashboard could have a "Discuss in Chat" button that opens @memory /plan show <id>
Shared notifications — when a step is marked done in chat, the dashboard updates; vice versa
Chat is the conversational CLI, dashboard is the visual GUI
Updated Priority Ranking
#	Enhancement	Impact	Effort	Priority
1	Plan action buttons (archive, build, dashboard, add step)	High	Low-Med	P1
2	Command links for files, research, steps, plan IDs	High	Medium	P1
3	Enhanced FollowupProvider with context-aware suggestions	High	Low	P1
4	Two-button confirmation pattern (generic)	Medium	Low	P1
5	/plan help subcommand	Medium	Very Low	P1
6	Multi-chat agent launching for Programs	High	High	P2
7	Out-of-scope escalation button (create plan from blocker)	High	Medium	P2
8	Build script buttons (hooks for terminal tool integration)	High	Medium	P2
9	"Research Further" / "Add to Plan" suggestion buttons	Medium	Medium	P2
10	File tree / references for artifacts	Medium	Low	P3
11	Chat ↔ Dashboard bridge buttons	Medium	Low	P3
12	Consistent progress indicators	Low	Very Low	P3
Ready for Architect?
This feels like a solid brainstorm output. The decisions are made, the patterns are defined, and the priorities are ranked. Shall I hand off to Coordinator with a recommendation for Architect to decompose this into implementation steps?

