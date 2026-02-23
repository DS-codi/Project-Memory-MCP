---
plan_id: plan_mlp8qxtq_ad821ebf
created_at: 2026-02-16T14:06:02.681Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Research Brief: MCP Terminal Tool & GUI Approval Flow\n\n## Three Research Questions\n\n### 1. Container-to-Host Process Launching\nMCP server runs in a Podman container on Windows. GUI terminal app (Rust/CxxQt/Qt) runs natively on the host. When the server needs to launch the GUI and it's not running, how do we spawn a host process from inside a container?\n\n### 2. MCP SDK Tool Call Timeout Behavior\nWhen waiting for GUI approval (~50s budget), what happens at the MCP protocol level? Can a single tool call return multiple responses? Default/configurable timeout? Is ~50s safe?\n\n### 3. Current Codebase IPC Protocol Audit\nWhat interactive-terminal TCP/IPC protocol already exists and what needs building from scratch?"