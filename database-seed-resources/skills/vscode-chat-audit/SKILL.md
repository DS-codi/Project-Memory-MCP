---
name: vscode-chat-audit
description: "Use this skill when the user needs to recover, summarize, or classify closed/crashed VS Code Copilot Chat sessions. Covers finding the JSONL transaction log files in workspaceStorage, parsing the kind-0/1/2 format, extracting user turns and timestamps, keyword-scanning for session identification, and applying CONTINUE-NOW / CONTINUE-LATER / DOC-ONLY classification."
---

# VS Code Copilot Chat Session Audit & Recovery

Use this skill when the user asks:
- "What was I working on in yesterday's sessions?"
- "I accidentally closed my chat tabs — help me find them"
- "Summarise all my recent chat sessions for this workspace"
- "Which session had the [topic] work?"

---

## 1. Storage Locations

### Session JSONL files (primary source)

VS Code writes one `.jsonl` per chat session under the **workspace-scoped** storage:

```
%APPDATA%\Code\User\workspaceStorage\<workspace-hash>\chatSessions\<session-uuid>.jsonl
```

- Each `.jsonl` filename IS the session UUID (e.g., `43aad28a-d5c8-446d-aefc-dd9aa0b92002.jsonl`)
- The workspace hash differs per workspace folder path  
- A code-workspace file gets its own hash, separate from the folder hash

### Finding the correct workspace hash

```powershell
$base = "$env:APPDATA\Code\User\workspaceStorage"
Get-ChildItem $base -Directory |
  Where-Object { $_.LastWriteTime -ge (Get-Date).AddDays(-2) } |
  ForEach-Object {
    $wj = Join-Path $_.FullName 'workspace.json'
    if (Test-Path $wj) { "$($_.Name): $(Get-Content $wj -Raw)" }
  }
```

`workspace.json` contains `{"folder":"file:///s%3A/NotionArchive"}` or similar — match this to the target workspace path.

A multi-root `.code-workspace` file gets its own separate hash. Check both:
- The folder hash (e.g., maps to `s:\NotionArchive`)
- The `.code-workspace` file hash (preferred if the user opens via workspace file)

---

## 2. JSONL Transaction Log Format

The `.jsonl` files are **not** raw turn logs. Each line is a transaction entry. Three kinds:

| `kind` | Meaning | Key fields |
|--------|---------|------------|
| `0` | Initial snapshot — full state at creation time | `v`: dict with `requests: []`, `customTitle`, etc. |
| `1` | Single-key replacement | `k: ["fieldName"]`, `v: newValue` (e.g., title update) |
| `2` | Array append | `k: ["requests"]`, `v: [list_of_new_request_objects]` |

### Reconstruct user turns

Only `kind=2` with `k=["requests"]` matters for message extraction:

```python
import json, os
from datetime import datetime, timezone, timedelta

LOCAL_TZ = timezone(timedelta(hours=11))  # adjust to user's timezone

def parse_session(path: str) -> dict:
    title = ""
    requests = []

    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            kind = obj.get("kind")
            k = obj.get("k", [])
            v = obj.get("v")

            # Initial title from snapshot
            if kind == 0 and isinstance(v, dict):
                title = v.get("customTitle", "")

            # Title update via kind=1
            elif kind == 1 and k == ["customTitle"]:
                title = v or title

            # User turns via kind=2 appends
            elif kind == 2 and k == ["requests"] and isinstance(v, list):
                for req in v:
                    if not isinstance(req, dict) or "message" not in req:
                        continue
                    msg = req["message"]
                    text = msg.get("text", "") if isinstance(msg, dict) else str(msg)
                    ts = req.get("timestamp")
                    dt = datetime.fromtimestamp(ts / 1000, tz=LOCAL_TZ) if ts else None
                    requests.append({"text": text, "ts": ts, "dt": dt})

    ts_start = next((r["dt"] for r in requests if r["dt"]), None)
    ts_end = next((r["dt"] for r in reversed(requests) if r["dt"]), None)

    return {
        "title": title,
        "requests": requests,
        "turns": len(requests),
        "ts_start": ts_start,
        "ts_end": ts_end,
    }
```

---

## 3. Enumerate and Date-Filter Sessions

```python
def list_sessions(chat_dir: str, since: datetime = None) -> list[dict]:
    results = []
    for fname in os.listdir(chat_dir):
        if not fname.endswith(".jsonl"):
            continue
        path = os.path.join(chat_dir, fname)
        session_id = fname[:-6]  # strip .jsonl
        mtime = datetime.fromtimestamp(os.path.getmtime(path), tz=LOCAL_TZ)
        
        data = parse_session(path)
        data["session_id"] = session_id
        data["mtime"] = mtime
        data["size_kb"] = os.path.getsize(path) // 1024
        
        if since and (data["ts_start"] or mtime) < since:
            continue
        results.append(data)

    return sorted(results, key=lambda d: d["ts_start"] or d["mtime"])
```

---

## 4. Keyword Scanning (Find a Specific Session)

When the user describes a session by topic but doesn't know which UUID, scan all message text:

```python
TARGET_KEYWORDS = [
    "staging", "sqlite", "restore", "bak", "uuid",
    "test db", "test database", "vm", "migration",
    # add domain-specific terms
]

def score_session(session: dict, keywords: list[str]) -> list[str]:
    hits = []
    for req in session["requests"]:
        text = req["text"].lower()
        for kw in keywords:
            if kw in text and kw not in hits:
                hits.append(kw)
    return hits
```

Print all sessions with any keyword hits:

```python
for s in sessions:
    hits = score_session(s, TARGET_KEYWORDS)
    if hits:
        date_str = s["ts_start"].strftime("%b %d %H:%M") if s["ts_start"] else "?"
        print(f"{s['session_id'][:8]}  {date_str}  {s['size_kb']:>6}KB  "
              f"turns={s['turns']:<3}  [{', '.join(hits[:5])}]  {s['title'][:60]}")
```

---

## 5. Classification System

Once you have user turns, classify each session:

### CONTINUE-NOW
The session has **in-flight, incomplete work** that requires immediate action.

Signals:
- A plan/task was started but not finished
- A script was run but results weren't resolved
- A blocker was hit and left unaddressed
- The final turn ends mid-task (no wrap-up)
- Files were modified, actions were taken, but not committed to a plan

### CONTINUE-LATER
Work is **paused but coherent**; all current actions are complete but a next step is clear.

Signals:
- Bugs are identified but explicitly deferred
- Research was done but no implementation started
- A plan was created and steps were staged but no execution began
- User said "skip this for now", "come back to it", or "defer"

### DOC-ONLY
The session is complete or its outcomes are fully captured elsewhere.

Signals:
- Plan was fully created and work was handed off to another session/agent
- Session ended cleanly with a summary or continuation prompt generated
- 84-turn session but all decisions are already in active plans or files
- The session is so old (no current plans reference it) that it's historical only
- Session crashed immediately (1 turn) — the plan it was continuing still exists

---

## 6. Output Format

### `session_summaries.txt` — top-level index

```
=== SESSION: <short-id> (<N> KB) ===
  [1] <first user message> ...
  [2] <second user message> ...
  ...
```

Useful for a quick scan of all sessions and their message history.

### `session_docs/INDEX.md` — curated index

```markdown
# Crashed Session Recovery Index

**Generated:** YYYY-MM-DD
**Source:** N sessions from `<workspace>` workspace

## Priority: CONTINUE NOW
| File | Session | Topic | Key Plans |
...

## Priority: CONTINUE LATER
...

## Priority: DOCUMENTATION ONLY
...

## Cross-Session Plan References
| Plan ID | Title | Referenced In |
...

## Infrastructure Quick Reference
| Resource | Value |
...
```

### `session_docs/<CLASS>_<session-id-prefix>_<slug>.md` — individual session docs

Naming: `CONTINUE-NOW_43aad28a_uuid-migration.md`

Each file should contain:
1. **Session metadata** — ID, date/time, turn count, workspace
2. **Topic summary** — 2–3 sentence overview
3. **Key technical decisions** — bullet list
4. **In-flight work** — what was left incomplete (for CONTINUE-NOW)
5. **Plan references** — any plan IDs created or referenced
6. **Continuation prompt** — ready-to-paste message to resume the session

---

## 7. Practical Workflow

1. **Find workspace hashes** — scan `workspaceStorage` for recently modified folders matching the target workspace via `workspace.json`
2. **List all session JSONL files** — enumerate `chatSessions/` under each matching hash
3. **Parse and date-filter** — run `parse_session()` on each, keep sessions in the target date range
4. **Quick overview** — print session_id, title, time, turns, size for all sessions
5. **User confirmation** — if the user isn't sure which session they're looking for, print the first 3 user messages from each candidate
6. **Keyword scan** — if searching for a specific topic, scan message text for domain keywords
7. **Read full turns** — for identified sessions, print all user messages with timestamps
8. **Classify** — apply CONTINUE-NOW / CONTINUE-LATER / DOC-ONLY to each session
9. **Write docs** — create INDEX.md and individual session doc files

> **Tip:** Always check the `.code-workspace`-scoped storage hash separately from the folder-scoped one. If the user opens VS Code via a `.code-workspace` file, all sessions go to the workspace-file hash, not the folder hash.

---

## 8. Global vs Workspace Storage

| Location | Contains | Use for |
|----------|----------|---------|
| `workspaceStorage/<hash>/chatSessions/` | Full session JSONL (messages + structure) | Primary recovery source |
| `workspaceStorage/<hash>/state.vscdb` | Session index, metadata (SQLite) | Finding session IDs only; key is `chat.ChatSessionStore.index` |
| `globalStorage/state.vscdb` | Cross-workspace preferences | Rarely needed for session recovery |
| `workspaceStorage/<hash>/GitHub.copilot-chat/chat-session-resources/` | Buffered large MCP tool response payloads | Not session content — these are MCP overflow buffers |

> **Do NOT** confuse the `chat-session-resources` folder with actual session history. It's VS Code's internal buffer for oversized MCP tool responses.

---

## 9. SQLite Session Index (Optional)

If the JSONL files aren't found yet and you need to identify session IDs:

```python
import sqlite3, json

db_path = r"C:\Users\<user>\AppData\Roaming\Code\User\workspaceStorage\<hash>\state.vscdb"
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT value FROM ItemTable WHERE key = 'chat.ChatSessionStore.index'")
row = cur.fetchone()
if row:
    index = json.loads(row[0])
    for session in index.get("sessions", []):
        print(session)  # contains sessionId, title, lastMessageDate
conn.close()
```

This gives you session IDs to match to JSONL filenames. However, the JSONL files themselves are more authoritative — parse them directly whenever possible.

