---
name: vscode-chat-response-stream
description: "Use this skill when building VS Code chat participant responses using ChatResponseStream. Covers markdown, command buttons, command links, file trees, progress messages, references/anchors, the generic push() method, and ChatFollowupProvider for suggested follow-ups."
category: vscode-extension
tags:
  - vscode
  - chat-participant
  - chatresponsestream
  - extension-development
language_targets:
  - typescript
framework_targets:
  - vscode
---

# VS Code ChatResponseStream API

When building VS Code chat participants, all response output flows through the `ChatResponseStream` object passed to your request handler. This skill documents every supported response type, how to use them, and what to avoid.

## When to Use This Skill

Apply this skill when:

- Implementing a VS Code chat participant's request handler
- Formatting rich responses with markdown, buttons, file trees, or references
- Adding follow-up suggestions after a chat response
- Deciding which response method to use for a given UI need

## Architecture Context

A chat participant handler receives four parameters:

```typescript
async function handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    response: vscode.ChatResponseStream,  // ← this is yours
    token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
    // Build your response using `response.*` methods
    response.progress('Working on it…');
    response.markdown('Here is the answer.');
    return { metadata: { command: 'myCommand' } };
}
```

The `response` object is a streaming interface — you call methods on it sequentially and VS Code renders each part as it arrives.

---

## Response Types

### 1. Markdown — `stream.markdown(value)`

Renders CommonMark-formatted text in the chat panel. This is the primary content method.

**Signature:**
```typescript
markdown(value: string | MarkdownString): void;
```

**Usage with plain strings:**
```typescript
response.markdown('# Heading\n\n');
response.markdown('**Bold text** and `inline code`\n');
response.markdown('- List item 1\n');
response.markdown('- List item 2\n');
```

**Usage with MarkdownString (for theme icons):**
```typescript
const md = new vscode.MarkdownString('$(check) All tests passed', true);
response.markdown(md);
```

**Key behaviors:**
- Multiple `markdown()` calls concatenate into a single rendered block
- Supports standard CommonMark: headings, bold, italic, code blocks, lists, tables, links
- Theme icons via `$(iconName)` require `supportThemeIcons: true` on `MarkdownString`
- Each call can contain partial content — VS Code streams it incrementally

**Real-world pattern — building formatted output:**
```typescript
response.markdown('📋 **Plans in this workspace** (${plans.length})\n\n');
for (const plan of plans) {
    const statusEmoji = plan.status === 'active' ? '🔵' : '✅';
    response.markdown(`${statusEmoji} **${plan.title}** \`${planId}\`\n`);
    if (plan.category) {
        response.markdown(`   Category: ${plan.category}\n`);
    }
}
```

---

### 2. Command Buttons — `stream.button(command)`

Renders a clickable button that executes a VS Code command when clicked.

**Signature:**
```typescript
button(command: Command): void;
```

**Command interface:**
```typescript
interface Command {
    title: string;       // Button label text
    command: string;     // VS Code command ID to execute
    tooltip?: string;    // Hover text
    arguments?: any[];   // Arguments passed to the command
}
```

**Example — open a file:**
```typescript
response.button({
    title: 'Open Configuration',
    command: 'vscode.open',
    tooltip: 'Open the config file in the editor',
    arguments: [vscode.Uri.file('/path/to/config.json')]
});
```

**Example — run a custom extension command:**
```typescript
response.button({
    title: '🚀 Deploy Plan',
    command: 'project-memory.deployPlan',
    arguments: [planId, workspaceId]
});
```

**Example — multiple action buttons:**
```typescript
response.markdown('What would you like to do next?\n\n');
response.button({
    title: 'View Plan Details',
    command: 'project-memory.showPlan',
    arguments: [planId]
});
response.button({
    title: 'Archive Plan',
    command: 'project-memory.archivePlan',
    arguments: [planId]
});
```

**Key behaviors:**
- Buttons appear inline in the chat response, below any preceding markdown
- The `command` must be a registered VS Code command (built-in or from an extension)
- Arguments are passed directly to the command handler

---

### 3. Command Links in Markdown — `[text](command:commandId)`

Embeds clickable command links inside markdown text. Requires a trusted `MarkdownString`.

**Signature:** Uses `markdown()` with a properly configured `MarkdownString`.

**Setup — allow specific commands:**
```typescript
const md = new vscode.MarkdownString();
md.isTrusted = { enabledCommands: ['vscode.open', 'project-memory.showPlan'] };
md.appendMarkdown('[Open settings](command:workbench.action.openSettings)\n');
md.appendMarkdown('[View plan](command:project-memory.showPlan)\n');
response.markdown(md);
```

**With arguments (URL-encoded JSON):**
```typescript
const args = encodeURIComponent(JSON.stringify([planId]));
const md = new vscode.MarkdownString();
md.isTrusted = { enabledCommands: ['project-memory.showPlan'] };
md.appendMarkdown(`[View ${planTitle}](command:project-memory.showPlan?${args})`);
response.markdown(md);
```

**Key behaviors:**
- **`isTrusted` MUST use the object form** with `enabledCommands` — the boolean form (`isTrusted = true`) is **not supported** in `ChatResponseStream`
- Only commands listed in `enabledCommands` will be clickable
- Arguments are passed as URL-encoded JSON after `?` in the command URI
- Use command links when you want inline clickable text; use `button()` when you want a prominent action button

---

### 4. File Trees — `stream.filetree(value, baseUri)`

Renders a visual file/folder tree structure in the chat panel.

**Signature:**
```typescript
filetree(value: ChatResponseFileTree[], baseUri: Uri): void;
```

**ChatResponseFileTree interface:**
```typescript
interface ChatResponseFileTree {
    name: string;                        // File or folder name
    children?: ChatResponseFileTree[];   // Nested children (makes it a folder)
}
```

**Example — display a project structure:**
```typescript
response.filetree([
    {
        name: 'src',
        children: [
            {
                name: 'chat',
                children: [
                    { name: 'ChatParticipant.ts' },
                    { name: 'ChatPlanCommands.ts' },
                    { name: 'ChatContextCommands.ts' }
                ]
            },
            { name: 'extension.ts' },
            { name: 'McpBridge.ts' }
        ]
    },
    { name: 'package.json' },
    { name: 'tsconfig.json' }
], vscode.Uri.file('/path/to/workspace'));
```

**Example — show files that will be created:**
```typescript
response.markdown('The following files will be created:\n\n');
response.filetree([
    {
        name: 'middleware',
        children: [
            { name: 'auth.ts' },
            { name: 'jwt.ts' }
        ]
    },
    { name: 'routes/auth.ts' },
    { name: '__tests__/auth.test.ts' }
], vscode.Uri.file(workspacePath));
```

**Key behaviors:**
- The `baseUri` is the root directory that the tree is relative to
- Clicking a file node in the tree opens it in the editor (if it exists)
- Items with `children` render as expandable folders
- Items without `children` render as files
- Useful for showing planned file changes, project scaffolding, or directory overviews

---

### 5. Progress Messages — `stream.progress(value)`

Displays a transient progress indicator with a message. Ideal for showing the user what's happening during async operations.

**Signature:**
```typescript
progress(value: string): void;
```

**Example — multi-step operation:**
```typescript
response.progress('Fetching plans...');
const plans = await mcpBridge.callTool('memory_plan', { action: 'list', workspace_id: wsId });

response.progress('Analyzing plan state...');
const state = await mcpBridge.callTool('memory_plan', { action: 'get', workspace_id: wsId, plan_id: planId });

response.markdown(`Found **${plans.length}** plans.\n`);
```

**Example — loading indicator:**
```typescript
response.progress('Loading knowledge file "api-notes"…');
const file = await mcpBridge.callTool('memory_context', { action: 'knowledge_get', workspace_id: wsId, slug: 'api-notes' });
response.markdown(`# ${file.title}\n\n${file.content}\n`);
```

**Key behaviors:**
- Progress messages are **transient** — they disappear once the next response part is pushed
- Use them to provide feedback during async work, not for permanent content
- Keep messages short and descriptive
- Only the most recent progress message is visible at any time

---

### 6. References and Anchors — `stream.reference()` and `stream.anchor()`

**Reference** renders a file/location as a clickable chip-style link with an optional icon. **Anchor** renders an inline hyperlink to a URI or location.

**Reference signature:**
```typescript
reference(value: Uri | Location, iconPath?: IconPath): void;
```

**Anchor signature:**
```typescript
anchor(value: Uri | Location, title?: string): void;
```

**Example — reference a file:**
```typescript
response.reference(vscode.Uri.file('/path/to/src/auth/login.ts'));
response.markdown(' was modified.\n');
```

**Example — reference with icon:**
```typescript
response.reference(
    vscode.Uri.file('/path/to/config.json'),
    new vscode.ThemeIcon('gear')
);
```

**Example — reference a specific location:**
```typescript
const location = new vscode.Location(
    vscode.Uri.file('/path/to/file.ts'),
    new vscode.Range(10, 0, 15, 0)  // Lines 11-16
);
response.reference(location, new vscode.ThemeIcon('symbol-function'));
response.markdown(' contains the authentication logic.\n');
```

**Example — anchor inline link:**
```typescript
response.markdown('See ');
response.anchor(vscode.Uri.file('/path/to/docs/README.md'), 'the documentation');
response.markdown(' for more details.\n');
```

**Example — anchor to a specific line:**
```typescript
const loc = new vscode.Location(
    vscode.Uri.file('/path/to/handler.ts'),
    new vscode.Position(42, 0)
);
response.anchor(loc, 'the handler function');
```

**Key behaviors:**
- `reference()` renders as a chip/pill with a file icon — good for "files changed" lists
- `anchor()` renders as an inline hyperlink — good for inline mentions in text
- Both accept `Uri` (whole file) or `Location` (specific range)
- Clicking opens the file (and navigates to the range if `Location` is used)
- `reference()` accepts an optional `iconPath` (ThemeIcon, Uri, or {light, dark} object)

---

## Generic Push — `stream.push(part)`

For programmatic construction, `push()` accepts any `ChatResponsePart` value.

**Signature:**
```typescript
push(part: ChatResponsePart): void;
```

**ChatResponsePart union type:**
```typescript
type ChatResponsePart =
    | ChatResponseMarkdownPart
    | ChatResponseFileTreePart
    | ChatResponseAnchorPart
    | ChatResponseProgressPart
    | ChatResponseReferencePart
    | ChatResponseCommandButtonPart;
```

**Example — dynamic response building:**
```typescript
const parts: vscode.ChatResponsePart[] = [];

parts.push(new vscode.ChatResponseProgressPart('Building response…'));
parts.push(new vscode.ChatResponseMarkdownPart('# Results\n\n'));

if (showFiles) {
    parts.push(new vscode.ChatResponseFileTreePart(fileTree, baseUri));
}

parts.push(new vscode.ChatResponseMarkdownPart('Done!\n'));

for (const part of parts) {
    response.push(part);
}
```

**When to use `push()` vs named methods:**
- Use named methods (`markdown()`, `button()`, etc.) for straightforward responses — they're clearer
- Use `push()` when building response parts dynamically or conditionally in a loop
- Use `push()` when you have a helper function that returns `ChatResponsePart` arrays

---

## ChatFollowupProvider — Suggested Follow-ups

After a response completes, VS Code can show clickable follow-up suggestions. Register a provider on the participant.

**Registration:**
```typescript
const participant = vscode.chat.createChatParticipant('myext.chat', handleRequest);

participant.followupProvider = {
    provideFollowups(
        result: vscode.ChatResult,
        context: vscode.ChatContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.ChatFollowup[]> {
        const metadata = result.metadata as Record<string, unknown> | undefined;
        const command = metadata?.command;

        const followups: vscode.ChatFollowup[] = [];

        if (command === 'plan' && metadata?.action === 'created') {
            followups.push({
                prompt: `/plan show ${metadata.planId}`,
                label: 'View plan details',
                command: 'plan'
            });
        }

        followups.push({
            prompt: '/status',
            label: 'Check status',
            command: 'status'
        });

        return followups;
    }
};
```

**ChatFollowup interface:**
```typescript
interface ChatFollowup {
    prompt: string;       // Text inserted into the chat input when clicked
    label?: string;       // Display label (if different from prompt)
    participant?: string; // Target participant ID (cross-participant follow-ups)
    command?: string;     // Target slash command
}
```

**Key patterns:**
- Use `result.metadata` to pass context from the handler to the followup provider
- The `prompt` field is what gets sent as the next chat message when the user clicks
- Set `command` to target a specific slash command
- Set `participant` to route follow-ups to a different chat participant
- Return an empty array when no follow-ups apply
- Follow-ups appear as clickable chips below the response

**Example — contextual follow-ups based on response type:**
```typescript
provideFollowups(result) {
    const meta = result.metadata as Record<string, unknown>;
    const followups: vscode.ChatFollowup[] = [];

    switch (meta?.command) {
        case 'plan':
            followups.push({ prompt: '/plan list', label: '📋 List all plans', command: 'plan' });
            break;
        case 'status':
            followups.push({ prompt: '/plan list', label: '📋 View plans', command: 'plan' });
            followups.push({ prompt: '/knowledge list', label: '📚 View knowledge', command: 'knowledge' });
            break;
        case 'error':
            followups.push({ prompt: '/diagnostics', label: '🔍 Run diagnostics', command: 'diagnostics' });
            break;
    }

    return followups;
}
```

---

## Common Pitfalls

### Anti-Patterns — What NOT to Do

- **Never use HTML rendering** in chat responses. The chat panel does not support raw HTML, iframes, or embedded web views.

- **Never use `isTrusted = true` (boolean form)** on `MarkdownString` in `ChatResponseStream`. It is not supported. Always use the object form:
  ```typescript
  // ❌ WRONG — boolean form not supported in ChatResponseStream
  md.isTrusted = true;

  // ✅ CORRECT — object form with explicit command allowlist
  md.isTrusted = { enabledCommands: ['myext.myCommand'] };
  ```

- **Never use `internal://` URI schemes** — they are not recognized and will not resolve.

- **Never attempt custom component rendering** or use a `ResourceProvider` to inject custom UI into the chat panel. The chat panel only supports the six response types documented above.

- **Never use `supportHtml = true`** on `MarkdownString` in chat responses. HTML is stripped in the chat panel context.

- **Avoid very long single `markdown()` calls** — break content into multiple calls for better streaming UX. Each call can be rendered incrementally.

### Common Mistakes

- **Forgetting `\n` at the end of markdown lines** — without newlines, consecutive `markdown()` calls concatenate on the same line.

- **Using `progress()` for permanent content** — progress messages are transient. They disappear when the next response part is pushed. Use `markdown()` for content that should persist.

- **Not including the command in `enabledCommands`** — command links silently fail if the command ID is not listed in the `enabledCommands` array.

- **Passing unregistered commands to `button()`** — the button will render but clicking it will show an error. Verify the command is registered.

---

## Method Selection Guide

| Need | Method | Notes |
|------|--------|-------|
| Formatted text, headings, lists | `markdown()` | Primary content method |
| Loading/progress feedback | `progress()` | Transient — disappears on next part |
| Clickable action button | `button()` | Renders as a prominent button |
| Inline command link in text | `markdown()` + `MarkdownString` | Requires `isTrusted.enabledCommands` |
| File/folder tree visualization | `filetree()` | Nodes are clickable if files exist |
| File reference chip/pill | `reference()` | Chip-style with optional icon |
| Inline file hyperlink | `anchor()` | Renders as underlined link in text |
| Dynamic/conditional parts | `push()` | Accepts any `ChatResponsePart` |
| Post-response suggestions | `followupProvider` | Clickable chips below the response |

---

## Complete Handler Example

```typescript
import * as vscode from 'vscode';

async function handlePlanShowCommand(
    planId: string,
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string
): Promise<vscode.ChatResult> {
    // 1. Show progress while loading
    response.progress('Loading plan details…');

    const plan = await mcpBridge.callTool('memory_plan', {
        action: 'get',
        workspace_id: workspaceId,
        plan_id: planId
    });

    // 2. Render plan header
    const statusEmoji = plan.status === 'active' ? '🔵' : '✅';
    response.markdown(`# ${statusEmoji} ${plan.title}\n\n`);
    response.markdown(`**Category**: ${plan.category} | **Priority**: ${plan.priority}\n\n`);

    // 3. Reference key files
    if (plan.files?.length) {
        response.markdown('**Key Files:**\n');
        for (const file of plan.files) {
            response.reference(vscode.Uri.file(file), new vscode.ThemeIcon('file'));
            response.markdown('\n');
        }
        response.markdown('\n');
    }

    // 4. Render steps
    response.markdown('## Steps\n\n');
    for (const [i, step] of plan.steps.entries()) {
        const icon = step.status === 'done' ? '✅' : step.status === 'active' ? '🔵' : '⬜';
        response.markdown(`${icon} **Step ${i + 1}**: ${step.task}\n`);
    }

    // 5. Action buttons
    response.markdown('\n---\n\n');
    response.button({
        title: '📋 Archive Plan',
        command: 'project-memory.archivePlan',
        arguments: [workspaceId, planId]
    });

    // 6. Return metadata for follow-up provider
    return {
        metadata: {
            command: 'plan',
            action: 'show',
            planId
        }
    };
}
```

---

## File Structure

When implementing chat participant responses, the typical file layout is:

```
vscode-extension/src/
├── chat/
│   ├── ChatParticipant.ts          # Main participant + followup provider
│   ├── ChatPlanCommands.ts         # /plan command handlers
│   ├── ChatContextCommands.ts      # /context command handlers
│   ├── ChatMiscCommands.ts         # /status, /deploy, /diagnostics
│   └── KnowledgeCommandHandler.ts  # /knowledge command handlers
├── extension.ts                    # Activation + participant registration
└── McpBridge.ts                    # MCP server communication
```

Each command handler file exports functions that receive the `ChatResponseStream` and return a `ChatResult` with metadata for the follow-up provider.
